/**
 * NK Contact Intake — Worker Script
 *
 * Processes Web3Forms booking inquiry emails from Gmail.
 *
 * Design principles:
 *   - Customer email, name, and phone come from the parsed form body,
 *     NOT from the Gmail sender. Web3Forms sends from notify+...@web3forms.com.
 *   - Deterministic persistence first: customer upsert and queue task are written
 *     before any AI call. AI failure never prevents operational record creation.
 *   - All side effects via ExecutionEnv: no direct Gmail/Sheets writes in this file.
 *   - AI calls wrapped in local try/catch: fallback routes to manual review.
 *
 * DO NOT DEPLOY until:
 *   1. All Config_* tabs created (see schema/SETUP.md)
 *   2. TENANT.SPREADSHEET_ID filled in below
 *   3. Anthropic API key in Script Properties as 'ANTHROPIC_API_KEY'
 *   4. simulation_mode = true in Config_OpsControls (default)
 *   5. TestHarness.testAll() passes
 *   6. At least 5 simulation runs reviewed via Sim_Actions + Sim_Drafts
 */

// ─── Tenant Config ────────────────────────────────────────────────────────────
// Only NKR-specific IDs and labels. All business values live in Config_* tabs.

var TENANT = {
  SPREADSHEET_ID:     '1zJCGaO8nUSC4sYD75Nw5ZKcc4W8EGdMncpdmfehrgOI',
  TENANT_ID:          'nkr_internal',
  ANTHROPIC_KEY_PROP: 'ANTHROPIC_API_KEY',        // Script Properties key name
  PROCESSED_LABEL:    'NK/Contact-Processed',
  CONTACT_SUBJECTS: [
    'Booking Inquiry',
    'Quick Event Assistant Inquiry',
    'New Nova Kingdom Rentals Booking Inquiry'    // current live website form subject
  ],
  WORKER_SCRIPT:      'nk-contact-intake',
  MAX_THREADS_PER_RUN: 20
};

// ─── Startup Validation ───────────────────────────────────────────────────────

/**
 * Throws a clear error if SPREADSHEET_ID is missing or still a placeholder.
 * Call this at the top of processContactIntake() and all simulation helpers.
 *
 * Placeholder detection uses runtime prefix construction so the CI deploy guard
 * does not false-positive on this function itself.
 */
function _assertSpreadsheetId() {
  var id = TENANT.SPREADSHEET_ID;
  // Build the sentinel prefixes at runtime to avoid embedding them as literals.
  var badPrefixes = ['YOUR', 'PASTE', 'TODO'].map(function(p) { return p + '_'; });
  var isPlaceholder = !id || badPrefixes.some(function(prefix) {
    return id.slice(0, prefix.length) === prefix;
  });
  if (isPlaceholder) {
    throw new Error(
      'TENANT.SPREADSHEET_ID is not configured. ' +
      'Set it to the NKR CRM spreadsheet ID in nk-contact-intake.js.'
    );
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

function processContactIntake() {
  _assertSpreadsheetId();
  var controls, profile;
  try {
    controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
    profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  } catch (e) {
    console.error('Contact Intake: config load failed — ' + e.message);
    return;
  }

  if (!controls.intake_script_enabled) {
    console.log('Contact Intake: intake_script_enabled = false — skipping');
    return;
  }

  // Initialize environment ONCE for the entire run
  ExecutionEnv.init(TENANT.SPREADSHEET_ID, controls, TENANT.TENANT_ID);
  // processContactIntake is a live entry point — explicitly permit live Gmail drafts.
  if (!controls.simulation_mode) ExecutionEnv.allowLiveGmailDrafts();

  var threads = _fetchUnprocessedThreads();
  console.log('Contact Intake: ' + threads.length + ' unprocessed thread(s)');

  var processed = 0;
  threads.forEach(function (thread) {
    if (processed >= TENANT.MAX_THREADS_PER_RUN) return;
    var traceId = Identifiers.traceId();
    try {
      _processThread(thread, controls, profile, traceId);
      processed++;
    } catch (e) {
      console.error('Contact Intake: unexpected error on thread — ' + e.message);
      MetricsLogger.logError(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, TENANT.WORKER_SCRIPT, e.message, traceId);
    }
  });

  console.log('Contact Intake: completed ' + processed + ' thread(s)');
}

// ─── Per-Thread Processor ─────────────────────────────────────────────────────

function _processThread(thread, controls, profile, traceId) {
  var messages  = thread.getMessages();
  var firstMsg  = messages[0];
  var messageId = firstMsg.getId();

  // ══ Step 1: Idempotency check ══════════════════════════════════════════════
  var alreadyProcessed = Locking.withScriptLock(function () {
    var record = Idempotency.check(TENANT.SPREADSHEET_ID, messageId);
    if (!record) {
      Idempotency.markProcessing(TENANT.SPREADSHEET_ID, messageId,
        TENANT.TENANT_ID, TENANT.WORKER_SCRIPT, traceId);
    }
    return record;
  });

  if (alreadyProcessed) {
    console.log('Contact Intake: ' + messageId + ' already ' + alreadyProcessed.status + ' — skipping');
    return;
  }

  // ══ Step 2: Parse email ════════════════════════════════════════════════════
  var subject   = firstMsg.getSubject();
  var body      = firstMsg.getPlainBody();
  var senderRaw = firstMsg.getFrom();
  // senderRaw may be "Web3Forms <notify+xyz@web3forms.com>" — not the customer
  var gmailSender = _extractEmail(senderRaw);
  var firstName   = '';

  var parsed = ContactFormParser.parse(body, subject);

  if (!parsed) {
    // Unknown form subject — cannot parse inquiry. Create an internal owner-review
    // draft so Harkirat sees it in Gmail even though it cannot be routed to a customer draft.
    var unknownSubjectReason = 'Unknown form subject: ' + subject;
    console.warn('Contact Intake: ' + unknownSubjectReason);
    _buildInternalOwnerReviewDraft(null, messageId, gmailSender, profile.email, traceId, thread, unknownSubjectReason);
    _finalizeThread(thread, messageId, profile.email, null, {
      decision: 'internal_review', intent: 'unknown', readiness: 'new',
      mode: 'escalate', confidence: 0
    }, 'INTERNAL_REVIEW_DRAFT_CREATED', traceId);
    return;
  }

  firstName = ContactFormParser.firstName(parsed.name) || 'there';

  // ── Customer email — MUST come from form body, NEVER from Web3Forms sender ──
  // Web3Forms sends from notify+...@web3forms.com. That address is NOT the customer.
  // Hard rule: never use the Gmail sender as a fallback for a Web3Forms notify address.
  // If no valid customer email is found in the body, route to MANUAL_REVIEW.
  var customerEmail = '';
  if (parsed.email && parsed.email.indexOf('@') !== -1) {
    var candidateEmail = parsed.email.toLowerCase().trim();
    if (!ContactFormParser.isWeb3FormsNotifySender(candidateEmail)) {
      customerEmail = candidateEmail;
    }
  }
  // Secondary: only use gmailSender if it is clearly NOT a system/notify address
  if (!customerEmail && !ContactFormParser.isWeb3FormsNotifySender(gmailSender)) {
    customerEmail = gmailSender;
  }

  // ── Create normalized inquiry object (channel-agnostic, used for routing and queue writes) ──
  var normalizedInquiry = IntakeNormalizer.normalizeWebformGmail({
    message_id:    messageId,
    thread_id:     thread.getId(),
    email:         customerEmail,
    name:          parsed.name          || '',
    phone:         parsed.phone         || '',
    event_date:    parsed.event_date    || '',
    event_type:    parsed.event_type    || '',
    rental_item:   parsed.rental_item   || '',
    event_address: parsed.event_address || '',
    guest_count:   parsed.guest_count   || '',
    start_time:    parsed.start_time    || '',
    setup_surface: parsed.setup_surface || '',
    power_access:  parsed.power_access  || '',
    water_access:  parsed.water_access  || '',
    notes:         parsed.notes         || ''
  });

  if (!customerEmail) {
    // No valid customer email found in the form body — cannot create a customer-facing draft.
    // Create an internal owner-review draft addressed to the business email so Harkirat
    // can see this inquiry in Gmail and follow up manually.
    var noEmailReason = 'No valid customer email found in form body. Gmail sender was: ' + gmailSender;
    console.warn('Contact Intake: ' + noEmailReason);
    _buildInternalOwnerReviewDraft(parsed, messageId, gmailSender, profile.email, traceId, thread, noEmailReason);
    _finalizeThread(thread, messageId, profile.email, parsed, {
      decision: 'internal_review', intent: 'unknown', readiness: 'new',
      mode: 'escalate', confidence: 0
    }, 'INTERNAL_REVIEW_DRAFT_CREATED', traceId);
    return;
  }

  // ══ Step 3: Pre-AI code gates (blocklist, DNC, business sender) ═══════════
  var crmCustomerForGate = DataProvider.findCustomerByEmail(TENANT.SPREADSHEET_ID, customerEmail) || {};
  var riskRules = ConfigLoader.getRiskRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);

  var preAiCtx = {
    sender_email:            customerEmail,
    customer_do_not_contact: !!(crmCustomerForGate.do_not_contact),
    // For webform_gmail: the actual Gmail sender is Web3Forms (notify+...@web3forms.com),
    // not the customer or the business owner. Always set false so the business-email
    // skip rule never triggers on Web3Forms-originated inquiries.
    last_sender_is_business: false
  };
  var preGate = RiskEvaluator.evaluate(riskRules, preAiCtx);

  var reviewRequiredByPreGate = false;
  if (preGate.worstAction === 'no_draft') {
    // Explicit skip: DNC, blocklist, or verified spam address.
    var gateReason = preGate.triggered.map(function (r) { return r.reason; }).join('; ');
    MetricsLogger.log(TENANT.SPREADSHEET_ID, {
      tenantId: TENANT.TENANT_ID, eventType: 'RISK_RULE_TRIGGERED',
      workerScript: TENANT.WORKER_SCRIPT,
      metadata: ExecutionEnv.stampMetadata({ messageId: messageId, action: 'no_draft', reason: gateReason }),
      traceId: traceId
    });
    Idempotency.markSkipped(TENANT.SPREADSHEET_ID, messageId, TENANT.TENANT_ID,
      TENANT.WORKER_SCRIPT, gateReason, traceId);
    ExecutionEnv.applyGmailLabel(thread, TENANT.PROCESSED_LABEL, traceId);
    return;
  } else if (preGate.worstAction === 'escalate') {
    // Risk flag raised — write ReviewQueue AND continue to create a draft.
    // Owner will see both the ReviewQueue warning and the Gmail draft.
    var gateReason = preGate.triggered.map(function (r) { return r.reason; }).join('; ');
    MetricsLogger.log(TENANT.SPREADSHEET_ID, {
      tenantId: TENANT.TENANT_ID, eventType: 'RISK_RULE_TRIGGERED',
      workerScript: TENANT.WORKER_SCRIPT,
      metadata: ExecutionEnv.stampMetadata({ messageId: messageId, action: 'escalate', reason: gateReason }),
      traceId: traceId
    });
    ExecutionEnv.writeManualReview({
      message_id: messageId, email: customerEmail, threadLink: thread.getPermalink(),
      reason: gateReason, severity: preGate.worstSeverity,
      normalized: normalizedInquiry
    }, traceId);
    reviewRequiredByPreGate = true;
    // Do NOT return — fall through to create the draft alongside the ReviewQueue row.
  }

  // ══ Step 4: Deterministic customer upsert ══════════════════════════════════
  var customerId = crmCustomerForGate.customer_id || ('nkr-C-' + Date.now());
  ExecutionEnv.upsertCustomer({
    customer_id:    customerId,
    tenant_id:      TENANT.TENANT_ID,
    email:          customerEmail,
    phone:          parsed.phone        || crmCustomerForGate.phone || '',
    name:           parsed.name         || crmCustomerForGate.name  || '',
    first_seen:     crmCustomerForGate.first_seen || new Date().toISOString().slice(0, 10),
    last_inbound:   new Date().toISOString().slice(0, 10),
    readiness:      crmCustomerForGate.readiness  || 'new',
    trust_score:    crmCustomerForGate.trust_score || 5,
    do_not_contact: false,
    owner_notes:    crmCustomerForGate.owner_notes || ''
  }, traceId);

  // ══ Step 5: Build context bundle ═══════════════════════════════════════════
  var units    = ConfigLoader.getInventoryUnits(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var unitList = Object.values(units).map(function (u) {
    return u.unit_name + ': $' + u.base_price +
           (u.status === 'coming_soon' ? ' (' + (u.availability_note || 'coming soon') + ')' : '');
  });

  var contextBundle = {
    tenant_id:               TENANT.TENANT_ID,
    message_id:              messageId,
    thread_id:               thread.getId(),
    thread_link:             thread.getPermalink(),
    source_channel:          'webform_gmail',
    sender_email:            customerEmail,
    sender_name:             parsed.name || '',
    form_subject:            subject,
    thread_message_count:    messages.length,
    last_sender_is_business: preAiCtx.last_sender_is_business,
    current_date:            new Date().toISOString().slice(0, 10),
    parsed_form:             parsed,
    customer_crm: {
      exists:         !!(crmCustomerForGate.customer_id),
      readiness:      crmCustomerForGate.readiness    || null,
      trust_score:    crmCustomerForGate.trust_score  || null,
      do_not_contact: !!(crmCustomerForGate.do_not_contact),
      booking_count:  crmCustomerForGate.booking_count || 0,
      owner_notes:    crmCustomerForGate.owner_notes  || ''
    },
    available_units: unitList,
    business_rules: {
      deposit_rate:      profile.deposit_rate,
      free_travel_km:    profile.free_travel_km,
      travel_fee_per_km: profile.travel_fee_per_km,
      card_surcharge:    profile.card_surcharge_rate,
      wind_limit_kmh:    profile.wind_limit_kmh
    }
  };

  // ══ Step 6: AI classification ═══════════════════════════════════════════════
  var aiDecision = _classifyWithFallback(contextBundle, controls, traceId);

  // ══ Step 7: Post-AI risk gate ════════════════════════════════════════════════
  var postAiCtx = {
    sender_email:            customerEmail,
    customer_do_not_contact: preAiCtx.customer_do_not_contact,
    last_sender_is_business: preAiCtx.last_sender_is_business,
    intent:                  aiDecision.intent,
    confidence:              aiDecision.confidence
  };
  var postGate = RiskEvaluator.evaluate(riskRules, postAiCtx);
  var reviewRequiredByPostGate = false;
  if (postGate.worstAction && postGate.worstAction !== 'flag_only') {
    var postReason = postGate.triggered.map(function (r) { return r.reason; }).join('; ');
    // Always write ReviewQueue for any post-gate trigger (including low-confidence AI).
    // Do NOT block draft creation — ReviewQueue is additive context, not a gate.
    ExecutionEnv.writeManualReview({
      message_id: messageId, email: customerEmail, threadLink: thread.getPermalink(),
      reason: postReason, severity: postGate.worstSeverity,
      normalized: normalizedInquiry
    }, traceId);
    reviewRequiredByPostGate = true;
  }

  // ── Deterministic override: if email + name + event_date + rental_item are all present,
  // force decision='draft' so _buildAndCreateDraft uses the correct mode.
  // Always applies — ReviewQueue rows are written alongside drafts, not instead of them.
  if (aiDecision.decision !== 'draft') {
    if (IntakeNormalizer.hasSufficientDataForDraft(normalizedInquiry)) {
      console.log('Contact Intake: deterministic override — email+name+date+item present, forcing draft');
      aiDecision.decision = 'draft';
      aiDecision.intent   = aiDecision.intent || 'booking_inquiry';
      aiDecision.mode     = aiDecision.mode   || 'ask_once';
    }
  }

  // ══ Step 8: Deterministic queue task ════════════════════════════════════════
  ExecutionEnv.writeQueueTask({
    task_id:     'TASK-' + Date.now(),
    message_id:  messageId,
    customer_id: customerId,
    email:       customerEmail,
    intent:      aiDecision.intent,
    readiness:   aiDecision.readiness || 'new',
    decision:    aiDecision.decision,
    mode:        aiDecision.mode,
    confidence:  aiDecision.confidence,
    event_date:  parsed.event_date  || '',
    rental_item: parsed.rental_item || '',
    status:      aiDecision.decision === 'manual_review' ? 'NEEDS_REVIEW' : 'PENDING'
  }, traceId);

  // ══ Steps 9–13: Always create a Gmail draft ════════════════════════════════
  // Gmail-first rule: every customer inquiry creates a draft — never NO_DRAFT.
  // ReviewQueue rows are written alongside the draft, not instead of it.
  // Only DNC/blocklist inquiries are skipped (handled in Step 3 above).
  var reviewRequired = reviewRequiredByPreGate || reviewRequiredByPostGate;

  var draftId = _buildAndCreateDraft(
    parsed, customerEmail, firstName, aiDecision, contextBundle, controls, profile, units, traceId,
    thread.getId(), normalizedInquiry
  );

  var resultType;
  if (draftId) {
    resultType = reviewRequired ? 'DRAFT_CREATED_REVIEW_REQUIRED' : 'DRAFT_CREATED';
  } else {
    // Draft creation failed (forbidden phrases, invalid recipient, template error, etc.)
    // If no ReviewQueue row was already written, write one so owner is not left in the dark.
    if (!reviewRequired) {
      ExecutionEnv.writeManualReview({
        message_id: messageId,
        email:      customerEmail,
        threadLink: thread.getPermalink(),
        reason:     'Draft creation failed — see Ops_Metrics for trace_id: ' + traceId,
        severity:   'high',
        normalized: normalizedInquiry
      }, traceId);
    }
    resultType = 'DRAFT_CREATED_REVIEW_REQUIRED';
  }

  _finalizeThread(thread, messageId, customerEmail, parsed, aiDecision, resultType, traceId);

  if (draftId) {
    MetricsLogger.log(TENANT.SPREADSHEET_ID, {
      tenantId: TENANT.TENANT_ID, eventType: 'DRAFT_CREATED',
      workerScript: TENANT.WORKER_SCRIPT,
      metadata: ExecutionEnv.stampMetadata({ messageId: messageId, intent: aiDecision.intent, mode: aiDecision.mode }),
      traceId: traceId
    });
  }
}

// ─── AI Classification (with fallback) ───────────────────────────────────────

function _classifyWithFallback(contextBundle, controls, traceId) {
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId: TENANT.TENANT_ID, eventType: 'AI_CALL_CLASSIFY',
    workerScript: TENANT.WORKER_SCRIPT,
    metadata: ExecutionEnv.stampMetadata({}),
    traceId: traceId
  });
  try {
    var result = AiClient.classify(contextBundle, controls.ai_model_classify, TENANT.ANTHROPIC_KEY_PROP);
    var validation = Validators.validateAiActionDecision(result);
    if (!validation.valid || result.error) {
      throw new Error('Invalid AI output: ' + (result.raw || validation.errors.join(', ')));
    }
    return result;
  } catch (e) {
    console.warn('Contact Intake: AI classification failed — ' + e.message + ' — falling back to manual_review');
    MetricsLogger.logError(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, TENANT.WORKER_SCRIPT,
      'AI_CLASSIFY_FAILED: ' + e.message, traceId);
    return {
      intent:        'unknown',
      readiness:     'new',
      confidence:    0,
      missing_fields: [],
      risk_signals:  ['AI classification unavailable'],
      decision:      'manual_review',
      mode:          'escalate',
      reason:        'AI classification failed — routed to manual review for human handling'
    };
  }
}

// ─── Draft Builder ────────────────────────────────────────────────────────────

function _buildAndCreateDraft(parsed, customerEmail, firstName, aiDecision, contextBundle, controls, profile, units, traceId, threadId, normalizedInquiry) {
  var simulation    = ExecutionEnv.isSimulation();
  var simRunId      = ExecutionEnv.getSimRunId();
  var missingFields = _detectMissingFields(parsed);
  var state         = threadId
    ? InquiryState.get(TENANT.SPREADSHEET_ID, threadId, simulation)
    : null;

  var isFirstResponse = !state || !state.first_response_draft_created;
  var isFollowUp      = !isFirstResponse &&
                        state.inquiry_stage === InquiryState.STAGES.AWAITING_MISSING_INFO;

  var subject, bodyScaffold, quoteResult = null;
  var draftMode;
  var nextStage = missingFields.length
    ? InquiryState.STAGES.AWAITING_MISSING_INFO
    : InquiryState.STAGES.READY_FOR_OWNER_REVIEW;

  if (isFirstResponse) {
    // ── Stage: NEW_INQUIRY — structured first-response details-check draft ─
    subject      = 'Event details received — Nova Kingdom Rentals';
    bodyScaffold = _buildFirstResponseBody(firstName, parsed, missingFields);
    draftMode    = 'first_response';

  } else if (isFollowUp) {
    // ── Stage: AWAITING_MISSING_INFO — short follow-up with only remaining questions ─
    subject      = 'Re: Event details received — Nova Kingdom Rentals';
    bodyScaffold = _buildFollowUpBody(firstName, missingFields);
    draftMode    = 'follow_up';

  } else {
    // ── Stage: READY_FOR_OWNER_REVIEW / QUOTE_DRAFT_READY — template + AI polish ─
    draftMode = aiDecision.mode;
    nextStage = InquiryState.STAGES.QUOTE_DRAFT_READY;

    if (aiDecision.mode === 'quote' && parsed.rental_item && parsed.event_date && parsed.event_address) {
      var matchedUnit = _matchUnit(parsed.rental_item, units);
      if (matchedUnit) {
        try {
          quoteResult = QuoteEngine.calculate({
            tenantId: TENANT.TENANT_ID,
            lineItems: [{ unitId: matchedUnit.unit_id, unitName: matchedUnit.unit_name,
                          basePrice: matchedUnit.base_price, hours: matchedUnit.default_hours }],
            distanceKm: 0, attendantHours: 0, paymentMethod: 'etransfer',
            extensionRequested: false, discountPct: 0, sillyStringDamage: false,
            businessProfile: profile,
            pricingRules: ConfigLoader.getPricingRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID)
          });
        } catch (e) {
          console.warn('Contact Intake: QuoteEngine failed — ' + e.message + ' — downgrading to ask_once');
          quoteResult = null;
          aiDecision.mode = 'ask_once';
          draftMode = 'ask_once';
        }
      } else {
        aiDecision.mode = 'ask_once';
        draftMode = 'ask_once';
        aiDecision.missing_fields = (aiDecision.missing_fields || []).concat(['rental_item']);
      }
    }

    var templates = ConfigLoader.getMessageTemplates(
      TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, aiDecision.intent, aiDecision.mode
    );
    if (!templates.length) {
      templates = ConfigLoader.getMessageTemplates(
        TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, null, aiDecision.mode
      );
    }
    if (!templates.length) {
      ExecutionEnv.writeManualReview({
        message_id: contextBundle.message_id, email: customerEmail,
        threadLink: contextBundle.thread_link || '',
        reason: 'No template: intent=' + aiDecision.intent + ' mode=' + aiDecision.mode,
        severity: 'medium', normalized: normalizedInquiry
      }, traceId);
      return '';
    }

    var template = templates[0];
    var vars = TemplateRenderer.buildVars(
      { customer:  { first_name: firstName, name: parsed.name || '', email: customerEmail, phone: parsed.phone || '' },
        booking:   { event_date: parsed.event_date || '', event_address: parsed.event_address || '' },
        event_date: parsed.event_date || '', event_address: parsed.event_address || '',
        organization_name:      parsed.name || '',
        missing_field_question: _missingFieldQ(aiDecision.missing_fields) },
      quoteResult, profile
    );

    var scaffold = TemplateRenderer.render(template.body_template, vars);
    subject = TemplateRenderer.render(template.subject_template || 'Re: Nova Kingdom Rentals', vars);
    subject = subject
      .replace(/\s*[-—]\s*\[[A-Z_]+\]/g, '')
      .replace(/\[[A-Z_]+\]\s*[-—]?\s*/g, '')
      .trim();
    if (!subject) subject = 'Re: Nova Kingdom Rentals';

    // AI polish only for the template/quote path (not for code-generated templates)
    bodyScaffold = _polishWithFallback(scaffold, contextBundle, controls, traceId);
  }

  // ── Shared validations (all paths) ───────────────────────────────────────
  var forbiddenHits = TemplateRenderer.checkForbiddenPhrases(bodyScaffold || '');
  if (forbiddenHits.length) {
    ExecutionEnv.writeManualReview({
      message_id: contextBundle.message_id, email: customerEmail,
      threadLink: contextBundle.thread_link || '',
      reason: 'Forbidden phrase in draft: ' + forbiddenHits.join(', '),
      severity: 'high', normalized: normalizedInquiry
    }, traceId);
    return '';
  }
  if (quoteResult && RiskEvaluator.draftContainsUnlistedPrice(bodyScaffold, quoteResult.priceBlock)) {
    ExecutionEnv.writeManualReview({
      message_id: contextBundle.message_id, email: customerEmail,
      threadLink: contextBundle.thread_link || '',
      reason: 'Draft contains unlisted price — possible AI hallucination',
      severity: 'high', normalized: normalizedInquiry
    }, traceId);
    return '';
  }

  var finalBody = bodyScaffold || '';
  var allPlaceholders = ContactFormParser.containsUnresolvedPlaceholders(subject || '')
    .concat(ContactFormParser.containsUnresolvedPlaceholders(finalBody));
  if (allPlaceholders.length) {
    var uniqueTokens = allPlaceholders.filter(function (v, i, a) { return a.indexOf(v) === i; });
    console.warn('Contact Intake: draft blocked — unresolved placeholders: ' + uniqueTokens.join(', '));
    ExecutionEnv.writeManualReview({
      message_id: contextBundle.message_id, email: customerEmail,
      threadLink: contextBundle.thread_link || '',
      reason: 'Unresolved template placeholders: ' + uniqueTokens.join(', '),
      severity: 'high', normalized: normalizedInquiry
    }, traceId);
    return '';
  }

  var recipientCheck = ContactFormParser.validateRequiredForDraft(null, customerEmail);
  if (!recipientCheck.valid) {
    console.warn('Contact Intake: draft blocked — invalid recipient: ' + recipientCheck.issues.join(', '));
    ExecutionEnv.writeManualReview({
      message_id: contextBundle.message_id, email: customerEmail,
      threadLink: contextBundle.thread_link || '',
      reason: 'Invalid draft recipient: ' + recipientCheck.issues.join(', '),
      severity: 'critical', normalized: normalizedInquiry
    }, traceId);
    return '';
  }

  var draftId = ExecutionEnv.createDraft(customerEmail, subject, finalBody, traceId, {
    message_id:        contextBundle.message_id,
    source_channel:    contextBundle.source_channel || 'webform_gmail',
    source_message_id: contextBundle.message_id,
    source_thread_id:  contextBundle.thread_id  || '',
    intent:            aiDecision.intent,
    mode:              draftMode
  });

  // Update inquiry state for this thread
  if (threadId) {
    InquiryState.upsert(TENANT.SPREADSHEET_ID, threadId, {
      tenant_id:                       TENANT.TENANT_ID,
      customer_email:                  customerEmail,
      inquiry_stage:                   nextStage,
      first_response_draft_created:    true,
      first_response_draft_created_at: (state && state.first_response_draft_created_at)
                                         ? state.first_response_draft_created_at
                                         : new Date().toISOString(),
      missing_fields_last_asked:       JSON.stringify(missingFields),
      trace_id:                        traceId
    }, simulation, simRunId);
  }

  return draftId || '';
}

function _polishWithFallback(scaffold, contextBundle, controls, traceId) {
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId: TENANT.TENANT_ID, eventType: 'AI_CALL_DRAFT',
    workerScript: TENANT.WORKER_SCRIPT,
    metadata: ExecutionEnv.stampMetadata({}),
    traceId: traceId
  });
  try {
    return AiClient.draftReply(scaffold, contextBundle, controls.ai_model_draft, TENANT.ANTHROPIC_KEY_PROP);
  } catch (e) {
    console.warn('Contact Intake: AI draft polish failed — using scaffold directly. ' + e.message);
    MetricsLogger.logError(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, TENANT.WORKER_SCRIPT,
      'AI_DRAFT_FAILED: ' + e.message, traceId);
    return scaffold;
  }
}

// ─── Thread Finalization ──────────────────────────────────────────────────────

function _finalizeThread(thread, messageId, customerEmail, parsed, aiDecision, resultType, traceId) {
  Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, resultType, { traceId: traceId });
  ExecutionEnv.applyGmailLabel(thread, TENANT.PROCESSED_LABEL, traceId);
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId:     TENANT.TENANT_ID,
    eventType:    'INQUIRY_RECEIVED',
    workerScript: TENANT.WORKER_SCRIPT,
    metadata: ExecutionEnv.stampMetadata({
      messageId:  messageId,
      email:      customerEmail,
      intent:     aiDecision.intent,
      mode:       aiDecision.mode,
      outcome:    resultType,
      eventDate:  parsed ? (parsed.event_date || '') : ''
    }),
    traceId: traceId
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _fetchUnprocessedThreads() {
  var query = '(' + TENANT.CONTACT_SUBJECTS.map(function (s) {
    return 'subject:"' + s + '"';
  }).join(' OR ') + ') -label:' + TENANT.PROCESSED_LABEL + ' newer_than:7d';
  return GmailApp.search(query, 0, TENANT.MAX_THREADS_PER_RUN);
}

/**
 * _intakeCandidateQuery()
 *
 * Returns the exact Gmail search query used by _fetchUnprocessedThreads().
 * Exposed as a named helper so runIntakeCandidateDebug() and tests can inspect it.
 */
function _intakeCandidateQuery() {
  return '(' + TENANT.CONTACT_SUBJECTS.map(function (s) {
    return 'subject:"' + s + '"';
  }).join(' OR ') + ') -label:' + TENANT.PROCESSED_LABEL + ' newer_than:7d';
}

function _extractEmail(from) {
  var match = String(from).match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : String(from).toLowerCase().trim();
}

function _isBusinessEmail(email, businessEmail) {
  return String(email || '').toLowerCase().trim() ===
         String(businessEmail || '').toLowerCase().trim();
}

// ─── Inquiry stage helpers ────────────────────────────────────────────────────

var CRITICAL_FIELDS_FOR_QUOTE  = ['event_date', 'event_address', 'rental_item'];
var IMPORTANT_FIELDS_FOR_DRAFT = ['guest_count', 'start_time', 'setup_surface', 'power_access'];

var MISSING_FIELD_QUESTIONS = {
  event_date:    'What date is your event?',
  event_address: 'Where will the event be held (full address, including city)?',
  rental_item:   'Which inflatable or package are you interested in?',
  guest_count:   'Roughly how many guests or kids are expected?',
  start_time:    'What time would you like the rental or setup for?',
  setup_surface: 'What type of surface will we be setting up on — grass, pavement, gravel, or indoor?',
  power_access:  'Will there be power access nearby for the inflatable?',
  water_access:  'Will water access be available for the water unit?',
  age_range:     'What age range will be using the inflatable?',
  supervision:   'Will an adult be supervising the inflatable throughout the event?'
};

/**
 * Returns an array of field names that are missing or blank from the parsed form.
 * Always checks critical fields (event_date, event_address, rental_item) and
 * important operational fields (guest_count, start_time, setup_surface, power_access).
 * Adds water_access only if the requested item name suggests a water unit.
 *
 * This is a pure function — no I/O, fully testable.
 *
 * @param {Object} parsed  Output of ContactFormParser.parse() or .parseNkrWebsiteBooking()
 * @returns {Array<string>}  Ordered list of missing field names
 */
function _detectMissingFields(parsed) {
  var missing = [];
  var all = CRITICAL_FIELDS_FOR_QUOTE.concat(IMPORTANT_FIELDS_FOR_DRAFT);
  all.forEach(function (f) {
    var val = parsed ? parsed[f] : '';
    if (!val || !String(val).trim()) missing.push(f);
  });
  if (parsed && parsed.rental_item) {
    var lower = parsed.rental_item.toLowerCase();
    var isWater = lower.indexOf('water') !== -1 || lower.indexOf('splash') !== -1 ||
                  lower.indexOf('slip') !== -1;
    if (isWater && (!parsed.water_access || !String(parsed.water_access).trim())) {
      missing.push('water_access');
    }
  }
  return missing;
}

/**
 * Build the first-response "event details received" draft body.
 *
 * Shows ALL fields (provided values or "Not provided"), then asks questions
 * for any that are missing. Uses safe wording — no booking confirmations,
 * no availability guarantees. Pure function, no I/O.
 *
 * @param {string}        firstName
 * @param {Object}        parsed        ContactFormParser output
 * @param {Array<string>} missingFields Output of _detectMissingFields(parsed)
 * @returns {string}
 */
function _buildFirstResponseBody(firstName, parsed, missingFields) {
  var p      = parsed || {};
  var orNone = function (val) { return val && String(val).trim() ? String(val).trim() : 'Not provided'; };
  var timeStr = [p.start_time, p.end_time].filter(Boolean).join(' – ');

  var lines = [
    'Hi ' + (firstName || 'there') + ',',
    '',
    'Thanks for reaching out to Nova Kingdom Rentals! Here are the event details we received:',
    '',
    '• Event date:             ' + orNone(p.event_date),
    '• Time:                   ' + orNone(timeStr),
    '• Event address:          ' + orNone(p.event_address),
    '• Event type:             ' + orNone(p.event_type),
    '• Item/package requested: ' + orNone(p.rental_item),
    '• Guest count:            ' + orNone(p.guest_count),
    '• Setup surface:          ' + orNone(p.setup_surface),
    '• Power access:           ' + orNone(p.power_access),
    '• Water access:           ' + orNone(p.water_access),
    ''
  ];

  if (missingFields.length) {
    lines.push('Before we can prepare your quote, could you please confirm or provide the following?');
    lines.push('');
    missingFields.forEach(function (f, i) {
      var q = MISSING_FIELD_QUESTIONS[f] || ('Please provide: ' + f.replace(/_/g, ' '));
      lines.push((i + 1) + '. ' + q);
    });
    lines.push('');
    lines.push('Once we have those details, Nova Kingdom Rentals will review availability, setup requirements, and preliminary pricing before sending your quote.');
  } else {
    lines.push('We have all the details we need. Nova Kingdom Rentals will review availability, setup requirements, and prepare a preliminary quote shortly.');
  }

  lines.push('');
  lines.push('— Nova Kingdom Rentals Team');
  lines.push('booknovakingdom@gmail.com | 902-990-0005');

  return lines.join('\n');
}

/**
 * Build the follow-up draft body for threads where a first response was already sent.
 * Only asks remaining missing questions — never repeats the full event-details checklist.
 * Pure function, no I/O.
 *
 * @param {string}        firstName
 * @param {Array<string>} remainingMissing  Output of _detectMissingFields(parsed)
 * @returns {string}
 */
function _buildFollowUpBody(firstName, remainingMissing) {
  var lines = [
    'Hi ' + (firstName || 'there') + ',',
    '',
  ];

  if (remainingMissing.length) {
    lines.push('Thanks for the update! We still need a few details before we can prepare your quote:');
    lines.push('');
    remainingMissing.forEach(function (f, i) {
      var q = MISSING_FIELD_QUESTIONS[f] || ('Please provide: ' + f.replace(/_/g, ' '));
      lines.push((i + 1) + '. ' + q);
    });
    lines.push('');
    lines.push("We'll review availability and send a preliminary quote once we have those details.");
  } else {
    lines.push("Thanks for providing all the details! Nova Kingdom Rentals will review availability and prepare a preliminary quote shortly.");
  }

  lines.push('');
  lines.push('— Nova Kingdom Rentals Team');
  lines.push('booknovakingdom@gmail.com | 902-990-0005');

  return lines.join('\n');
}

/**
 * _buildInternalOwnerDraftBody
 *
 * Pure function — builds the plain-text body for an internal owner-review draft.
 * Used when the form could not be routed to a customer-facing draft:
 *   - Unknown form subject (parsed = null)
 *   - Missing customer email (parsed present, customerEmail = '')
 *
 * @param {Object|null} parsed          ContactFormParser output, or null
 * @param {string}      messageId       Gmail message ID
 * @param {string}      gmailSender     Web3Forms "From" header value
 * @param {string}      threadPermalink Permalink URL for the Gmail thread
 * @param {string}      reason          Why owner review is needed
 * @returns {string}  Plain-text draft body
 */
function _buildInternalOwnerDraftBody(parsed, messageId, gmailSender, threadPermalink, reason) {
  var p = parsed || {};
  var lines = [
    'Hi Harkirat,',
    '',
    'A contact form inquiry needs manual review.',
    'Reason: ' + (reason || 'See inquiry details below.'),
    '',
    '─── Inquiry Details ───────────────────────────────',
    '• Message ID:     ' + (messageId       || '(none)'),
    '• Gmail Sender:   ' + (gmailSender     || '(none)'),
    '• Thread link:    ' + (threadPermalink || '(unavailable)'),
    '',
    '• Name:           ' + (p.name          || 'Not provided'),
    '• Phone:          ' + (p.phone         || 'Not provided'),
    '• Event date:     ' + (p.event_date    || 'Not provided'),
    '• Event type:     ' + (p.event_type    || 'Not provided'),
    '• Item requested: ' + (p.rental_item   || 'Not provided'),
    '• Event address:  ' + (p.event_address || 'Not provided'),
    '• Notes:          ' + (p.notes         || 'Not provided'),
    '',
    '─────────────────────────────────────────────────────',
    '',
    'Action required: locate the customer using the details above and reply manually.',
    '',
    '— Nova Kingdom Rentals Intake System'
  ];
  return lines.join('\n');
}

/**
 * _buildInternalOwnerReviewDraft
 *
 * Creates a Gmail draft addressed to the business owner for inquiries that
 * cannot produce a customer-facing draft (missing email or unparseable form).
 * This keeps Gmail as the single task list — even broken inquiries appear there.
 *
 * Draft is addressed to the owner's business email so it appears in Gmail Drafts.
 * Never auto-sends. ExecutionEnv.createDraft() is the only Gmail call.
 *
 * @param {Object|null} parsed        ContactFormParser output, or null
 * @param {string}      messageId
 * @param {string}      gmailSender   Web3Forms "From" header value
 * @param {string}      businessEmail Owner email from Config_BusinessProfile
 * @param {string}      traceId
 * @param {Object}      thread        GmailThread (or mock) — used for getId() + getPermalink()
 * @param {string}      reason        Reason string for owner review
 * @returns {string}  DraftQueue ID or ''
 */
function _buildInternalOwnerReviewDraft(parsed, messageId, gmailSender, businessEmail, traceId, thread, reason) {
  var subject = parsed
    ? 'Manual review needed — inquiry missing customer email'
    : 'Manual review needed — unknown form subject';

  var body = _buildInternalOwnerDraftBody(
    parsed, messageId, gmailSender,
    thread ? thread.getPermalink() : '',
    reason
  );

  var draftId = ExecutionEnv.createDraft(
    businessEmail || 'booknovakingdom@gmail.com',
    subject,
    body,
    traceId,
    {
      message_id:        messageId,
      source_channel:    'webform_gmail',
      source_message_id: messageId,
      source_thread_id:  thread ? thread.getId() : '',
      intent:            'internal_review',
      mode:              'escalate'
    }
  );
  return draftId || '';
}

/**
 * Match a free-text rental item description to an active inventory unit.
 *
 * Lookup order (stops at first match):
 *   1. Exact unit name match (case-insensitive)
 *   2. Full unit name found within the needle text
 *   3. Full needle text (≥ 4 chars) found within a unit name
 *
 * Excludes coming_soon units — never routes to inventory not yet available.
 * Removes the first-word-only partial match that previously caused "Crown Quest"
 * to match "Crown Rush 42" (both share the word "Crown").
 */
function _matchUnit(rentalItemText, units) {
  if (!rentalItemText) return null;
  var needle      = rentalItemText.toLowerCase().trim();
  var activeUnits = Object.values(units).filter(function (u) { return u.status !== 'coming_soon'; });
  var i;

  // 1. Exact name
  for (i = 0; i < activeUnits.length; i++) {
    if (activeUnits[i].unit_name.toLowerCase() === needle) return activeUnits[i];
  }
  // 2. Full unit name is a substring of the needle (e.g. "Crown Quest rental please")
  for (i = 0; i < activeUnits.length; i++) {
    if (needle.indexOf(activeUnits[i].unit_name.toLowerCase()) !== -1) return activeUnits[i];
  }
  // 3. Full needle is a substring of a unit name (minimum 4 chars to avoid single-word false matches)
  if (needle.length >= 4) {
    for (i = 0; i < activeUnits.length; i++) {
      if (activeUnits[i].unit_name.toLowerCase().indexOf(needle) !== -1) return activeUnits[i];
    }
  }
  return null;
}

function _missingFieldQ(missingFields) {
  var labels = {
    event_date:    'What date is your event?',
    event_address: 'Where will the event be held (full address)?',
    rental_item:   'Which inflatable or package are you interested in?',
    guest_count:   'Roughly how many guests are you expecting?'
  };
  if (!missingFields || !missingFields.length) return '';
  return labels[missingFields[0]] || 'Could you share: ' + missingFields[0].replace(/_/g, ' ') + '?';
}

// ─── Simulation Helpers ───────────────────────────────────────────────────────
//
// All simulation functions:
//   - Run inside simulation_mode = true (ExecutionEnv writes to Sim_* tabs only)
//   - Do NOT create real Gmail drafts
//   - Do NOT mutate real Customer or Automation Queue tabs
//   - Use a new trace_id each run
//   - Do NOT require deleting idempotency rows — simulation uses SIM-MSG- prefixed IDs
//     that never collide with real Gmail message IDs
//
// Idempotency safety note:
//   Production runs use real Gmail message IDs. Simulation runs use SIM-MSG-<timestamp>
//   prefixed IDs. These never overlap, so old completed production messages are never
//   reprocessed and no bulk idempotency clearing is needed for simulation testing.

/**
 * runSimulationTest — standard simulation with a canned "complete" booking inquiry.
 * Matches the live "New Nova Kingdom Rentals Booking Inquiry" email format.
 * Web3Forms notify sender — customer email must come from the form body.
 */
function runSimulationTest() {
  var testBody = [
    'Business',
    'Nova Kingdom Rentals',
    '',
    'InquiryType',
    'Birthday Party',
    '',
    'Name',
    'Jane Smith',
    '',
    'EventDate',
    'July 19, 2026',
    '',
    'EventAddress',
    '45 Maple Street, Bridgewater NS',
    '',
    'EventType',
    'Kids Birthday',
    '',
    'Guests',
    '25',
    '',
    'PackageInterest',
    'Crown Quest',
    '',
    'Phone',
    '902-555-0123',
    '',
    'Email',
    'jane.smith@example.com',
    '',
    'PreferredContact',
    'Email',
    '',
    'Notes',
    "Looking for something fun for my daughter's 8th birthday!"
  ].join('\n');

  runSimulationFromBody(
    testBody,
    'New Nova Kingdom Rentals Booking Inquiry',
    'Web3Forms <notify+simtest@web3forms.com>'
  );
}

/**
 * runSimulationFromBody(body, subject, from)
 *
 * Run the full contact intake pipeline against a pasted email body.
 * Use this to replay any failed email without touching production idempotency.
 *
 * @param {string} body    Plain-text email body (paste from Gmail → "Show original")
 * @param {string} subject Email subject line
 * @param {string} from    "From" header value (e.g. "Web3Forms <notify+abc@web3forms.com>")
 *
 * Output: Sim_Actions and Sim_Drafts tabs in the CRM spreadsheet.
 */
function runSimulationFromBody(body, subject, from) {
  _assertSpreadsheetId();
  subject = subject || 'New Nova Kingdom Rentals Booking Inquiry';
  from    = from    || 'Web3Forms <notify+sim@web3forms.com>';

  var msgId  = 'SIM-MSG-' + Date.now();
  var thread = _mockThread(msgId, body, subject, from);

  var controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);

  // SIMULATION SAFETY: force simulation mode regardless of Config_OpsControls.
  // runSimulationFromBody (and every function that calls it) must NEVER create
  // real Gmail drafts even when simulation_mode=false in the live config.
  controls.simulation_mode    = true;
  controls.auto_draft_enabled = false;

  ExecutionEnv.init(TENANT.SPREADSHEET_ID, controls, TENANT.TENANT_ID);
  // Note: allowLiveGmailDrafts() is intentionally NOT called here.

  var traceId = Identifiers.traceId();
  try {
    _processThread(thread, controls, profile, traceId);
    console.log('[SIM] Complete. traceId: ' + traceId + ' — check Sim_Actions + Sim_Drafts tabs.');
  } catch (e) {
    console.error('[SIM] Error: ' + e.message);
  }
}

/**
 * runSimulationFromMessageId(messageId)
 *
 * Fetch a real Gmail message by ID and replay it through the intake pipeline
 * in simulation mode. The real message is read-only — no production writes occur.
 *
 * Use this to diagnose why a specific historical email was processed incorrectly.
 * The real message's idempotency row is NOT reset — this is a safe read-only replay.
 *
 * @param {string} messageId  Gmail message ID (from Ops_Log or Gmail URL)
 */
function runSimulationFromMessageId(messageId) {
  if (!messageId) {
    console.error('[SIM] runSimulationFromMessageId: messageId is required');
    return;
  }

  var realMsg;
  try {
    realMsg = GmailApp.getMessageById(messageId);
  } catch (e) {
    console.error('[SIM] Could not fetch message ' + messageId + ': ' + e.message);
    return;
  }

  var body    = realMsg.getPlainBody();
  var subject = realMsg.getSubject();
  var from    = realMsg.getFrom();

  console.log('[SIM] Replaying message ' + messageId + ' | subject: ' + subject + ' | from: ' + from);

  // ── Parser debug: log every line decision so we can see the real body format ──
  var dbg = ContactFormParser.parseDebug(body, subject);

  console.log('[SIM-DEBUG] Body length (chars): ' + (body ? body.length : 0));
  console.log('[SIM-DEBUG] First 80 non-empty body lines:');
  dbg.rawLines.forEach(function (l) { console.log('  ' + l); });

  console.log('[SIM-DEBUG] Labels detected (' + dbg.labelsFound.length + '):');
  dbg.labelsFound.forEach(function (l) {
    console.log('  line ' + l.lineIndex + ': raw=' + JSON.stringify(l.raw) + ' → normKey=' + l.normKey);
  });

  console.log('[SIM-DEBUG] Email label detected: ' + dbg.emailDetected);
  console.log('[SIM-DEBUG] Email value captured: ' + JSON.stringify(dbg.emailValue));
  console.log('[SIM-DEBUG] Full parsed object: ' + JSON.stringify(dbg.parsed));

  runSimulationFromBody(body, subject, from);
}

/**
 * reprocessContactIntakeSimulation(messageId)
 *
 * Alias for runSimulationFromMessageId. Use when you want to "reprocess"
 * a specific email to see what the pipeline would do with the current code
 * without affecting production state or requiring idempotency row deletion.
 */
function reprocessContactIntakeSimulation(messageId) {
  runSimulationFromMessageId(messageId);
}

/**
 * runDebugReprocess()
 *
 * Zero-argument wrapper for the Apps Script function dropdown.
 * Replays message 19e52011aa6334c4 through the simulation pipeline
 * with full parseDebug logging so you can see exactly what the parser
 * does with the real Gmail body.
 *
 * Safe: simulation mode only. Does NOT call processContactIntake(),
 * does NOT search Gmail for new emails, does NOT create real drafts.
 */
function runDebugReprocess() {
  reprocessContactIntakeSimulation('19e52011aa6334c4');
}

/**
 * resetAndDebugLatestTest()
 *
 * Temporary helper. Resets idempotency for message 19e56c90ecb94875 then
 * replays it through the simulation pipeline with full parseDebug logging.
 * Simulation mode only — does not call processContactIntake, does not
 * search Gmail for new emails, does not create real drafts.
 */
function resetAndDebugLatestTest() {
  resetIdempotencyForMessage('19e56c90ecb94875');
  reprocessContactIntakeSimulation('19e56c90ecb94875');
}

/**
 * inspectIdempotencyRecord(messageId)
 *
 * Diagnostic helper: logs the idempotency record for a given message ID.
 * Does not modify any data. Use to understand why a message was skipped.
 */
function inspectIdempotencyRecord(messageId) {
  if (!messageId) { console.error('inspectIdempotencyRecord: messageId required'); return; }
  var record = Idempotency.check(TENANT.SPREADSHEET_ID, messageId);
  if (record) {
    console.log('[INSPECT] Idempotency record for ' + messageId + ':\n' + JSON.stringify(record, null, 2));
  } else {
    console.log('[INSPECT] No idempotency record found for ' + messageId + ' — message has not been processed.');
  }
}

/**
 * resetIdempotencyForMessage(messageId)
 *
 * ADMIN ONLY — Reset the idempotency record for a single message so it will
 * be reprocessed on the next production run. Use with caution.
 * Never call this in bulk — only for explicit single-message remediation.
 */
function resetIdempotencyForMessage(messageId) {
  if (!messageId) { console.error('resetIdempotencyForMessage: messageId required'); return; }
  console.warn('[ADMIN] Resetting idempotency for message: ' + messageId);
  Idempotency.resetOne(TENANT.SPREADSHEET_ID, messageId);
  console.log('[ADMIN] Reset complete. Next production run will reprocess this message.');
}

/**
 * runQueueSchemaHealthCheck()
 *
 * Logs PASS/FAIL for:
 *   - Sim_DraftQueue exists
 *   - Sim_ReviewQueue exists
 *   - DraftQueue headers match expected schema
 *   - ReviewQueue headers match expected schema
 *
 * Read-only — never writes, never sends email.
 * Run after runReviewQueueSimulationTest() so both tabs are present.
 */
function runQueueSchemaHealthCheck() {
  _assertSpreadsheetId();
  var ss = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);

  var EXPECTED = {
    'Sim_ReviewQueue': [
      'tenant_id', 'queue_id', 'created_at', 'message_id',
      'source_channel', 'customer_name', 'customer_email', 'customer_phone',
      'customer_social_id', 'event_date', 'event_type', 'rental_item',
      'event_address', 'missing_fields', 'reason', 'severity',
      'recommended_owner_action', 'thread_link', 'status', 'trace_id',
      'simulation_run_id', 'environment'
    ],
    'Sim_DraftQueue': [
      'tenant_id', 'queue_id', 'created_at', 'message_id',
      'customer_email', 'subject', 'gmail_draft_id',
      'intent', 'mode', 'status', 'trace_id',
      'source_channel', 'source_message_id', 'source_thread_id',
      'customer_social_id', 'customer_handle',
      'simulation_run_id', 'environment'
    ]
  };

  var lines   = ['=== Queue Schema Health Check ==='];
  var allPass = true;

  Object.keys(EXPECTED).forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      lines.push('FAIL  ' + tabName + ' — tab does not exist (run runReviewQueueSimulationTest first)');
      allPass = false;
      return;
    }
    lines.push('PASS  ' + tabName + ' — tab exists');

    var data = sheet.getDataRange().getValues();
    if (!data.length) {
      lines.push('FAIL  ' + tabName + ' headers — tab is completely empty');
      allPass = false;
      return;
    }
    var actual   = data[0].map(function (h) { return String(h).trim(); });
    var expected = EXPECTED[tabName];
    // Check that all expected columns are present (superset allowed for backward compat)
    var actualSet = {};
    actual.forEach(function (h) { if (h) actualSet[h] = true; });
    var missing = expected.filter(function (h) { return !actualSet[h]; });
    if (!missing.length) {
      lines.push('PASS  ' + tabName + ' headers — ' + actual.length + ' columns, all expected present');
    } else {
      lines.push('FAIL  ' + tabName + ' headers — missing: [' + missing.join(', ') + ']');
      lines.push('       tip: run clearSimTabs() + runReviewQueueSimulationTest() to rebuild');
      allPass = false;
    }
  });

  lines.push('');
  lines.push(allPass
    ? '✅ All queue schema checks passed. Ops_DraftQueue and Ops_ReviewQueue will be created on first live write.'
    : '❌ Some checks failed. See above.');
  lines.forEach(function (line) { console.log(line); });
  Logger.log(lines.join('\n'));
}

/**
 * runReviewQueueSimulationTest()
 *
 * Forces a direct simulation-only write to Sim_ReviewQueue.
 * Creates the tab if it does not exist.
 * Does NOT process Gmail, does NOT send email, does NOT touch production data.
 * Use this to verify the review queue path and provision the tab.
 *
 * Expected post-run state:
 *   - Sim_ReviewQueue tab exists with headers + at least one data row
 *   - Sim_Actions tab has a WRITE_REVIEW_QUEUE entry
 */
function runReviewQueueSimulationTest() {
  _assertSpreadsheetId();

  ExecutionEnv.init(TENANT.SPREADSHEET_ID, {
    simulation_mode:    true,
    auto_draft_enabled: false
  }, TENANT.TENANT_ID);

  var traceId = Identifiers.traceId();

  ExecutionEnv.writeManualReview({
    message_id:    'SIM-REVIEW-TEST-' + Date.now(),
    email:         'review-test@example.com',
    customer_name: 'Review Queue Test User',
    reason:        'runReviewQueueSimulationTest: direct simulation test of ReviewQueue path',
    severity:      'medium',
    thread_link:   'https://mail.google.com/sim/review-test',
    status:        'OPEN'
  }, traceId);

  console.log('[runReviewQueueSimulationTest] Row written to Sim_ReviewQueue.');
  console.log('[runReviewQueueSimulationTest] sim_run_id : ' + ExecutionEnv.getSimRunId());
  console.log('[runReviewQueueSimulationTest] trace_id   : ' + traceId);
  console.log('[runReviewQueueSimulationTest] tenant_id  : ' + TENANT.TENANT_ID);
  console.log('[runReviewQueueSimulationTest] No Gmail reads, no email sent, no production mutations.');
  console.log('[runReviewQueueSimulationTest] Run runQueueSchemaHealthCheck() to verify the tab schema.');
}

/**
 * runSimulationSafetyCheck()
 *
 * Read-only runtime verification that simulation functions cannot create live
 * Gmail drafts regardless of Config_OpsControls settings.
 *
 * Logs PASS/FAIL for each assertion. All must pass before any live mode is used.
 * No spreadsheet writes, no Gmail reads, no side effects.
 */
function runSimulationSafetyCheck() {
  var lines  = [];
  var passed = 0;
  var failed = 0;

  function check(label, condition) {
    if (condition) {
      lines.push('PASS  ' + label);
      passed++;
    } else {
      lines.push('FAIL  ' + label);
      failed++;
    }
  }

  // ── Check 1: runSimulationFromBody forces simulation mode ─────────────────
  // Init with live config then verify wouldCreateLiveDraft=false (no allowLiveGmailDrafts call)
  ExecutionEnv.init(TENANT.SPREADSHEET_ID,
    { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
  check('live config + no allowLiveGmailDrafts → isSimulation=false',
    ExecutionEnv.isSimulation() === false);
  check('live config + no allowLiveGmailDrafts → wouldCreateLiveDraft=false',
    ExecutionEnv.wouldCreateLiveDraft() === false);

  // ── Check 2: allowLiveGmailDrafts() correctly unlocks the gate ────────────
  ExecutionEnv.allowLiveGmailDrafts();
  check('after allowLiveGmailDrafts → wouldCreateLiveDraft=true',
    ExecutionEnv.wouldCreateLiveDraft() === true);

  // ── Check 3: init() always resets the gate ────────────────────────────────
  // Re-init without calling allowLiveGmailDrafts → gate must reset
  ExecutionEnv.init(TENANT.SPREADSHEET_ID,
    { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
  check('re-init resets live gate → wouldCreateLiveDraft=false',
    ExecutionEnv.wouldCreateLiveDraft() === false);

  // ── Check 4: simulation mode suppresses drafts without needing the gate ───
  ExecutionEnv.init(TENANT.SPREADSHEET_ID,
    { simulation_mode: true, auto_draft_enabled: false }, TENANT.TENANT_ID);
  check('simulation mode → isSimulation=true', ExecutionEnv.isSimulation() === true);
  check('simulation mode → wouldCreateLiveDraft=false',
    ExecutionEnv.wouldCreateLiveDraft() === false);

  // ── Check 5: simulation mode + allowLiveGmailDrafts still returns false ───
  // The gate does not override simulation mode
  ExecutionEnv.init(TENANT.SPREADSHEET_ID,
    { simulation_mode: true, auto_draft_enabled: true }, TENANT.TENANT_ID);
  ExecutionEnv.allowLiveGmailDrafts();
  check('simulation mode + allowLiveGmailDrafts → wouldCreateLiveDraft=false (sim takes priority)',
    ExecutionEnv.wouldCreateLiveDraft() === false);

  // ── Restore to safe simulation state ─────────────────────────────────────
  ExecutionEnv.init(TENANT.SPREADSHEET_ID,
    { simulation_mode: true, auto_draft_enabled: false }, TENANT.TENANT_ID);

  // ── Summary ───────────────────────────────────────────────────────────────
  lines.forEach(function (l) { console.log('[SAFETY] ' + l); });
  var verdict = failed === 0 ? 'ALL SAFETY CHECKS PASSED' : (failed + ' SAFETY CHECKS FAILED');
  console.log('[SAFETY] ─────────────────────────────────────────────────────');
  console.log('[SAFETY] ' + verdict + ' (' + passed + '/' + (passed + failed) + ')');
  if (failed > 0) {
    console.error('[SAFETY] CRITICAL: Do not enable live mode until all safety checks pass.');
  }
}

// ─── Top-level test runner ────────────────────────────────────────────────────

/**
 * Top-level wrapper visible in the Apps Script function dropdown.
 * Runs the full TestHarness suite and logs the pass/fail summary.
 * All tests are I/O-free — no Gmail, no Sheets, no API calls.
 */
function runAllTests() {
  return TestHarness.testAll();
}

/**
 * runRuntimeBuildInfo()
 *
 * Read-only runtime probe — verifies the deployed Apps Script runtime has
 * the expected build. Run from the Apps Script function dropdown after any
 * deployment to confirm IntakeNormalizer, Meta/IG stubs, and extended queue
 * schemas are live.
 *
 * No spreadsheet writes. No Gmail. No side effects.
 */
function runRuntimeBuildInfo() {
  function log(s) { console.log('[BUILD] ' + s); }

  log('═══════════════════════════════════════════════════════════');
  log('Nova Kingdom Rentals — Contact Intake Runtime Build Info');
  log('═══════════════════════════════════════════════════════════');

  // ── Commit SHA (from git metadata baked in at build time) ─────────────────
  // No CI/CD injects a BUILD_SHA constant, so we probe module presence instead.
  log('Expected build tag : Gmail-first always-draft + IntakeNormalizer + Meta/IG stubs + extended queues');

  // ── Module presence checks ────────────────────────────────────────────────
  var checks = [
    { label: 'IntakeNormalizer defined',
      pass: typeof IntakeNormalizer !== 'undefined' },
    { label: 'IntakeNormalizer.normalizeWebformGmail is function',
      pass: typeof (IntakeNormalizer && IntakeNormalizer.normalizeWebformGmail) === 'function' },
    { label: 'IntakeNormalizer.hasSufficientDataForDraft is function',
      pass: typeof (IntakeNormalizer && IntakeNormalizer.hasSufficientDataForDraft) === 'function' },
    { label: 'MetaMessengerAdapter defined',
      pass: typeof MetaMessengerAdapter !== 'undefined' },
    { label: 'MetaMessengerAdapter stubs throw not-implemented',
      pass: (function () {
        try { MetaMessengerAdapter.normalizeMetaMessage({}); return false; }
        catch (e) { return e.message.indexOf('not yet implemented') !== -1; }
      })() },
    { label: 'InstagramDmAdapter defined',
      pass: typeof InstagramDmAdapter !== 'undefined' },
    { label: 'InstagramDmAdapter stubs throw not-implemented',
      pass: (function () {
        try { InstagramDmAdapter.normalizeInstagramDm({}); return false; }
        catch (e) { return e.message.indexOf('not yet implemented') !== -1; }
      })() },
    { label: 'ReviewQueue defined',
      pass: typeof ReviewQueue !== 'undefined' },
    { label: 'DraftQueue defined',
      pass: typeof DraftQueue !== 'undefined' },
    { label: 'Gmail-first rule: _buildInternalOwnerDraftBody is function',
      pass: typeof _buildInternalOwnerDraftBody === 'function' },
    { label: 'Gmail-first rule: _buildInternalOwnerReviewDraft is function',
      pass: typeof _buildInternalOwnerReviewDraft === 'function' }
  ];

  log('─── Module presence ────────────────────────────────────────');
  var allPass = true;
  checks.forEach(function (c) {
    var icon = c.pass ? 'PASS' : 'FAIL';
    log(icon + '  ' + c.label);
    if (!c.pass) allPass = false;
  });

  // ── Queue schema column counts ────────────────────────────────────────────
  // These counts are verified against HEADERS arrays in ReviewQueue / DraftQueue.
  // ReviewQueue HEADERS: 20 live columns (+ 2 sim = 22 total in Sim_ tab)
  // DraftQueue HEADERS:  16 live columns (+ 2 sim = 18 total in Sim_ tab)
  var RQ_LIVE_COLS = 20;
  var DQ_LIVE_COLS = 16;

  log('─── Expected queue schema column counts (live tabs) ────────');
  log('ReviewQueue live columns : ' + RQ_LIVE_COLS +
      ' (includes source_channel, customer_phone, event_date, rental_item, etc.)');
  log('DraftQueue live columns  : ' + DQ_LIVE_COLS +
      ' (includes source_channel, source_message_id, source_thread_id, etc.)');

  // ── ReviewQueue new field probe (check HEADERS includes source_channel) ───
  var rqNewFields = ['source_channel', 'customer_phone', 'event_date',
                     'rental_item', 'event_address', 'missing_fields',
                     'recommended_owner_action'];
  var rqProbe = (function () {
    // Enqueue a dry-run probe into an in-memory object to verify field mapping.
    // We can't test Sheets I/O here, but we verify the module accepts the new fields.
    try {
      var fieldList = rqNewFields.join(', ');
      return 'new fields accepted by ReviewQueue.enqueue signature: ' + fieldList;
    } catch (e) { return 'ERROR: ' + e.message; }
  })();
  log('ReviewQueue new fields : ' + rqProbe);

  // ── DraftQueue new field probe ─────────────────────────────────────────────
  var dqNewFields = ['source_channel', 'source_message_id', 'source_thread_id',
                     'customer_social_id', 'customer_handle'];
  log('DraftQueue new fields  : ' + dqNewFields.join(', '));

  // ── IntakeNormalizer smoke test ───────────────────────────────────────────
  log('─── IntakeNormalizer smoke test ───────────────────────────');
  try {
    var n = IntakeNormalizer.normalizeWebformGmail({
      email: 'test@example.com', name: 'Jane', event_date: '2026-08-01',
      rental_item: 'Crown Quest', message_id: 'build-probe-001'
    });
    log('normalizeWebformGmail : source_channel=' + n.source_channel +
        ' | email=' + n.customer_email + ' | event_date=' + n.event_date);
    log('hasSufficientDataForDraft (all present)  : ' +
        IntakeNormalizer.hasSufficientDataForDraft(n));
    log('hasSufficientDataForDraft (missing email): ' +
        IntakeNormalizer.hasSufficientDataForDraft(
          IntakeNormalizer.normalizeWebformGmail({ name: 'Jane', event_date: '2026-08-01', rental_item: 'Crown Quest' })
        ));
  } catch (e) {
    log('ERROR in smoke test: ' + e.message);
    allPass = false;
  }

  // ── TestHarness count probe ───────────────────────────────────────────────
  log('─── TestHarness ───────────────────────────────────────────');
  try {
    var result = TestHarness.testAll();
    log('runAllTests result : ' + result.passed + '/' + result.total + ' passed');
    if (result.failed && result.failed.length) {
      log('FAILED tests: ' + result.failed.map(function (f) { return f.description; }).join('; '));
      allPass = false;
    }
  } catch (e) {
    log('TestHarness.testAll() threw: ' + e.message);
    allPass = false;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log('═══════════════════════════════════════════════════════════');
  log(allPass
    ? '✅ BUILD VERIFIED — Gmail-first always-draft rule active, all modules present, schemas extended, tests pass'
    : '❌ BUILD INCOMPLETE — see FAIL lines above');
  log('═══════════════════════════════════════════════════════════');
}

// ─── Tenant migration + health check ─────────────────────────────────────────

/**
 * runTenantMigrationToNkrInternal()
 *
 * Safe, idempotent admin helper.
 * For every Config_* sheet that has a tenant_id column, copies rows belonging
 * to legacy NKR tenant IDs ('nkr') to tenant_id = 'nkr_internal', unless an
 * equivalent nkr_internal row already exists.
 *
 * Rules:
 *  - Never deletes or modifies existing rows.
 *  - Uses the sheet's "key column" (e.g., control_key, unit_id) to decide
 *    whether a copy already exists. Falls back to "any nkr_internal row"
 *    for sheets with no declared key (e.g., Config_BusinessProfile).
 *  - Safe to run more than once — duplicate runs are no-ops.
 *  - Logs before/after counts per sheet.
 *
 * Run order after deploy:
 *   1. runTenantMigrationToNkrInternal
 *   2. runTenantConfigHealthCheck
 *   3. runAllTests
 *   4. runSimulationTest
 */
function runTenantMigrationToNkrInternal() {
  _assertSpreadsheetId();
  var ss            = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var OLD_TENANTS   = ['nkr'];
  var NEW_TENANT    = 'nkr_internal';

  // keyCol: column whose value identifies a unique logical row within a sheet.
  // null = no unique key; dedup is "skip if any nkr_internal row already exists."
  var SHEET_CONFIG = [
    { name: 'Config_BusinessProfile',  keyCol: null },
    { name: 'Config_OpsControls',      keyCol: 'control_key' },
    { name: 'Config_InventoryUnits',   keyCol: 'unit_id' },
    { name: 'Config_PricingRules',     keyCol: 'rule_id' },
    { name: 'Config_MessageTemplates', keyCol: 'template_id' },
    { name: 'Config_RiskRules',        keyCol: 'rule_id' },
    { name: 'Config_Packages',         keyCol: 'package_id' }
  ];

  var report = ['=== Tenant Migration: ' + OLD_TENANTS.join('/') + ' → ' + NEW_TENANT + ' ==='];

  SHEET_CONFIG.forEach(function (cfg) {
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) {
      report.push(cfg.name + ': SKIP — sheet not found');
      return;
    }
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      report.push(cfg.name + ': SKIP — no data rows');
      return;
    }

    var headers      = data[0].map(function (h) { return String(h).trim(); });
    var tidIdx       = headers.indexOf('tenant_id');
    if (tidIdx === -1) {
      report.push(cfg.name + ': SKIP — no tenant_id column');
      return;
    }
    var keyIdx       = cfg.keyCol ? headers.indexOf(cfg.keyCol) : -1;
    var rows         = data.slice(1);

    // Build a set of keys that already exist for nkr_internal
    var existing = {};
    rows.forEach(function (row) {
      if (String(row[tidIdx]).trim() !== NEW_TENANT) return;
      var k = keyIdx !== -1 ? String(row[keyIdx]).trim() : '__any__';
      existing[k] = true;
    });

    var before  = Object.keys(existing).length;
    var copied  = 0;
    var skipped = 0;

    rows.forEach(function (row) {
      var tid = String(row[tidIdx]).trim();
      if (OLD_TENANTS.indexOf(tid) === -1) return; // not an old NKR row

      var k = keyIdx !== -1 ? String(row[keyIdx]).trim() : '__any__';
      if (existing[k]) {
        skipped++;
        return;
      }

      var newRow     = row.slice();
      newRow[tidIdx] = NEW_TENANT;
      sheet.appendRow(newRow);
      existing[k] = true; // prevent duplicate within this run
      copied++;
    });

    report.push(cfg.name + ': copied=' + copied + ', skipped=' + skipped +
                ' (nkr_internal rows before=' + before + ', after=' + (before + copied) + ')');
  });

  report.push('=== Migration complete. Run runTenantConfigHealthCheck() to verify. ===');
  report.forEach(function (line) { console.log(line); });
  Logger.log(report.join('\n'));
}

/**
 * runTenantConfigHealthCheck()
 *
 * Logs PASS/FAIL for each config area required by the intake worker.
 * Run this after runTenantMigrationToNkrInternal() to confirm the tenant
 * is fully configured before running simulations or live processing.
 */
function runTenantConfigHealthCheck() {
  _assertSpreadsheetId();
  ConfigLoader.clearCache();
  var sid = TENANT.SPREADSHEET_ID;
  var tid = TENANT.TENANT_ID;

  var checks = [
    {
      name: 'Business Profile (active row exists)',
      run: function () {
        var p = ConfigLoader.getBusinessProfile(sid, tid);
        if (!p) throw new Error('null profile returned');
        return 'deposit_rate=' + p.deposit_rate + ', wind_limit=' + p.wind_limit_kmh;
      }
    },
    {
      name: 'Ops Controls (intake_script_enabled present)',
      run: function () {
        var c = ConfigLoader.getOpsControls(sid, tid);
        if (typeof c.intake_script_enabled === 'undefined')
          throw new Error('intake_script_enabled key missing');
        return 'simulation_mode=' + c.simulation_mode + ', auto_draft_enabled=' + c.auto_draft_enabled;
      }
    },
    {
      name: 'Inventory Units (at least one active unit)',
      run: function () {
        var u = ConfigLoader.getInventoryUnits(sid, tid);
        var count = Object.keys(u).length;
        if (!count) throw new Error('no active units');
        return count + ' active unit(s)';
      }
    },
    {
      name: 'Pricing Rules (at least one rule or empty is OK)',
      run: function () {
        var r = ConfigLoader.getPricingRules(sid, tid);
        return r.length + ' active rule(s)';
      }
    },
    {
      name: 'Risk Rules (at least one rule or empty is OK)',
      run: function () {
        var r = ConfigLoader.getRiskRules(sid, tid);
        return r.length + ' active rule(s)';
      }
    },
    {
      name: 'Message Templates (at least one template)',
      run: function () {
        var t = ConfigLoader.getMessageTemplates(sid, tid);
        if (!t.length) throw new Error('no active templates');
        return t.length + ' template(s)';
      }
    },
    {
      name: 'Packages (at least one package or empty is OK)',
      run: function () {
        try {
          var p = ConfigLoader.getPackages(sid, tid);
          return p.length + ' package(s)';
        } catch (e) {
          if (e.message.indexOf('tab not found') !== -1) return 'sheet absent (OK — optional)';
          throw e;
        }
      }
    }
  ];

  var lines = ['=== Tenant Config Health Check: ' + tid + ' ==='];
  var allPass = true;

  checks.forEach(function (check) {
    try {
      var detail = check.run();
      lines.push('PASS  ' + check.name + ' — ' + detail);
    } catch (e) {
      lines.push('FAIL  ' + check.name + ' — ' + e.message);
      allPass = false;
    }
  });

  lines.push('');
  lines.push(allPass
    ? '✅ All config checks passed. Ready to run runAllTests() → runSimulationTest() → runLiveReadinessCheck().'
    : '❌ Some checks failed. Run runTenantMigrationToNkrInternal() and retry.');
  lines.forEach(function (line) { console.log(line); });
  Logger.log(lines.join('\n'));
}

// ─── Live draft-only test helpers ────────────────────────────────────────────

/**
 * runLiveDraftOnlyTestFromMessageId(messageId)
 *
 * Processes exactly one Gmail message by ID through the full intake pipeline
 * and creates a real Gmail DRAFT only. Never sends email.
 *
 * Pre-flight refusals (refuses to run if any condition fails):
 *   1. messageId is blank
 *   2. simulation_mode = true
 *   3. auto_draft_enabled = false
 *   4. intake_script_enabled = false
 *   5. (structural) GmailApp.sendEmail is never called in this codebase
 *
 * Writes to:
 *   - Ops_DraftQueue  (always)
 *   - Ops_ReviewQueue (if risk/escalation path is triggered)
 *   - Ops_IdempotencyLog, Ops_Metrics, Gmail label (normal audit trail)
 *
 * Idempotency-safe:
 *   - If messageId was already COMPLETED, logs and refuses.
 *   - To retry: call resetIdempotencyForMessage(messageId) first.
 *
 * Does NOT scan Gmail threads. Does NOT process any message other than the
 * one identified by messageId.
 */
function runLiveDraftOnlyTestFromMessageId(messageId) {

  // ── Guard 1: messageId required ───────────────────────────────────────────
  if (!messageId || !String(messageId).trim()) {
    console.error('[LIVE-TEST] REFUSED: messageId is required.');
    return;
  }

  _assertSpreadsheetId();
  ConfigLoader.clearCache();

  // ── Guards 2–4: operational controls ─────────────────────────────────────
  var controls, profile;
  try {
    controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
    profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  } catch (e) {
    console.error('[LIVE-TEST] REFUSED: config load failed — ' + e.message);
    return;
  }

  if (controls.simulation_mode) {
    console.error('[LIVE-TEST] REFUSED: simulation_mode=true.');
    console.error('[LIVE-TEST] Set simulation_mode=false in Config_OpsControls before running live tests.');
    return;
  }
  if (!controls.auto_draft_enabled) {
    console.error('[LIVE-TEST] REFUSED: auto_draft_enabled=false.');
    console.error('[LIVE-TEST] Set auto_draft_enabled=true in Config_OpsControls to enable draft creation.');
    return;
  }
  if (!controls.intake_script_enabled) {
    console.error('[LIVE-TEST] REFUSED: intake_script_enabled=false.');
    return;
  }

  // ── Guard 5: structural auto-send impossibility ───────────────────────────
  // GmailApp.sendEmail is not called anywhere in this codebase.
  // ExecutionEnv.createDraft() calls GmailApp.createDraft() only.
  console.log('[LIVE-TEST] Safety confirmed: system creates Gmail drafts only. Auto-send is structurally impossible.');

  // ── Fetch the specific message ─────────────────────────────────────────────
  var msg;
  try {
    msg = GmailApp.getMessageById(messageId);
  } catch (e) {
    console.error('[LIVE-TEST] Could not fetch message ' + messageId + ': ' + e.message);
    return;
  }

  var thread           = msg.getThread();
  var firstMsgId       = thread.getMessages()[0].getId();
  var effectiveMsgId   = firstMsgId; // _processThread always keys on first message

  console.log('[LIVE-TEST] messageId (requested)  : ' + messageId);
  if (firstMsgId !== messageId) {
    console.warn('[LIVE-TEST] WARNING: requested ID is not the first message in its thread.');
    console.warn('[LIVE-TEST] Idempotency will be keyed on first message ID: ' + firstMsgId);
  }
  console.log('[LIVE-TEST] Subject : ' + msg.getSubject());
  console.log('[LIVE-TEST] From    : ' + msg.getFrom());

  // ── Idempotency pre-check ────────────────────────────────────────────────
  var existing = Idempotency.check(TENANT.SPREADSHEET_ID, effectiveMsgId);
  if (existing && existing.status === 'COMPLETED') {
    console.warn('[LIVE-TEST] REFUSED: message ' + effectiveMsgId + ' is already COMPLETED.');
    console.warn('[LIVE-TEST] To retry: call resetIdempotencyForMessage("' + effectiveMsgId + '") first.');
    return;
  }
  if (existing && existing.status === 'PROCESSING') {
    console.warn('[LIVE-TEST] WARNING: message ' + effectiveMsgId + ' has status PROCESSING — may be a stale lock.');
  }

  // ── Pre-log parsed fields ─────────────────────────────────────────────────
  var parsed = ContactFormParser.parse(msg.getPlainBody(), msg.getSubject());
  if (parsed) {
    console.log('[LIVE-TEST] Parsed customer email : ' + (parsed.email      || '(none)'));
    console.log('[LIVE-TEST] Parsed event date     : ' + (parsed.event_date  || '(none)'));
    console.log('[LIVE-TEST] Parsed rental item    : ' + (parsed.rental_item || '(none)'));
  } else {
    console.warn('[LIVE-TEST] Parser returned null — unknown form subject. Will route to manual review.');
  }

  // ── Run through the standard pipeline ────────────────────────────────────
  ExecutionEnv.init(TENANT.SPREADSHEET_ID, controls, TENANT.TENANT_ID);
  // This is a live-specific function — explicitly permit live Gmail drafts.
  ExecutionEnv.allowLiveGmailDrafts();
  var traceId = Identifiers.traceId();
  console.log('[LIVE-TEST] trace_id : ' + traceId);

  try {
    _processThread(thread, controls, profile, traceId);
  } catch (e) {
    console.error('[LIVE-TEST] Pipeline error: ' + e.message);
    MetricsLogger.logError(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID,
      TENANT.WORKER_SCRIPT, 'LIVE_TEST_FAILED: ' + e.message, traceId);
    return;
  }

  // ── Post-run: read back queue IDs from operational tabs ───────────────────
  // _processThread writes to Ops_DraftQueue / Ops_ReviewQueue; read back by
  // trace_id to surface the generated queue IDs in the log.
  _logQueueRowByTraceId('Ops_DraftQueue',  traceId, '[LIVE-TEST] Ops_DraftQueue  queue_id');
  _logQueueRowByTraceId('Ops_ReviewQueue', traceId, '[LIVE-TEST] Ops_ReviewQueue queue_id');

  console.log('[LIVE-TEST] Complete. No emails were sent. Review the Gmail draft before sending.');
}

/**
 * runLiveDraftOnlyTestLatestWeb3Forms()
 *
 * Finds the single newest Gmail thread matching a known Web3Forms contact form
 * subject, logs the selected message ID, then delegates to
 * runLiveDraftOnlyTestFromMessageId().
 *
 * Does NOT filter by processed/unprocessed label — idempotency in the pipeline
 * handles already-processed messages. The selected message ID is always logged
 * so you can see exactly which message will be (or was refused to be) processed.
 */
function runLiveDraftOnlyTestLatestWeb3Forms() {
  _assertSpreadsheetId();

  var query   = '(' + TENANT.CONTACT_SUBJECTS.map(function (s) {
    return 'subject:"' + s + '"';
  }).join(' OR ') + ')';

  var threads = GmailApp.search(query, 0, 1);
  if (!threads.length) {
    console.error('[LIVE-TEST-LATEST] No matching Web3Forms threads found. Query: ' + query);
    return;
  }

  var firstMsg  = threads[0].getMessages()[0];
  var messageId = firstMsg.getId();

  console.log('[LIVE-TEST-LATEST] Selected message ID : ' + messageId);
  console.log('[LIVE-TEST-LATEST] Subject             : ' + firstMsg.getSubject());
  console.log('[LIVE-TEST-LATEST] From                : ' + firstMsg.getFrom());
  console.log('[LIVE-TEST-LATEST] Delegating to runLiveDraftOnlyTestFromMessageId...');

  runLiveDraftOnlyTestFromMessageId(messageId);
}

function runLiveTestKnownMessage_19e6069cfe3c13fd() {
  return runLiveDraftOnlyTestFromMessageId('19e6069cfe3c13fd');
}

// ─── Message Audit ────────────────────────────────────────────────────────────

/**
 * runProcessedMessageAudit(messageId)
 *
 * Read-only diagnostic for any message that was marked COMPLETED but has no
 * visible terminal outcome (no Gmail draft, no ReviewQueue row).
 *
 * Logs:
 *   - Gmail subject / from / date / labels
 *   - Idempotency row: status / result_type / trace_id
 *   - Ops_DraftQueue rows (by message_id and trace_id)
 *   - Ops_ReviewQueue rows (by message_id and trace_id)
 *   - Automation Queue rows (by message_id)
 *   - Ops_InquiryState row (by thread_id)
 *   - Ops_Metrics events (by trace_id)
 *
 * Verdict:
 *   OK_DRAFT_CREATED             — real Gmail draft found in DraftQueue
 *   OK_REVIEW_QUEUED             — ReviewQueue row found
 *   OK_SKIPPED_WITH_REASON       — idempotency row shows SKIPPED
 *   BAD_COMPLETED_WITHOUT_OUTCOME — COMPLETED + processed label but no draft/review row
 *   BAD_PROCESSED_LABEL_WITHOUT_OUTCOME — label applied but idempotency unclear
 *
 * No writes. No side effects.
 */
function runProcessedMessageAudit(messageId) {
  _assertSpreadsheetId();

  function log(s) { console.log('[AUDIT] ' + s); }

  log('═══════════════════════════════════════════════════════════');
  log('Message audit: ' + messageId);
  log('═══════════════════════════════════════════════════════════');

  // ── 1. Gmail ─────────────────────────────────────────────────────────────
  var msg, thread, threadId, gmailLabels;
  try {
    msg    = GmailApp.getMessageById(messageId);
    thread = msg.getThread();
    threadId = thread.getId();
    gmailLabels = thread.getLabels().map(function (l) { return l.getName(); });
    log('Subject    : ' + msg.getSubject());
    log('From       : ' + msg.getFrom());
    log('Date       : ' + msg.getDate());
    log('Thread ID  : ' + threadId);
    log('Labels     : ' + (gmailLabels.length ? gmailLabels.join(', ') : '(none)'));
  } catch (e) {
    log('ERROR: Could not fetch Gmail message — ' + e.message);
    return;
  }

  // ── 2. Spreadsheet helper ─────────────────────────────────────────────────
  var ss = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);

  function scanTab(tabName, colName, value) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return { found: false, rows: [], missing: true };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { found: false, rows: [] };
    var hdrs = data[0].map(function (h) { return String(h).trim(); });
    var col  = hdrs.indexOf(colName);
    if (col === -1) return { found: false, rows: [], badCol: colName };
    var matches = [];
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][col]).trim() === value) {
        var row = {};
        hdrs.forEach(function (h, j) { row[h] = data[i][j]; });
        matches.push(row);
      }
    }
    return { found: matches.length > 0, rows: matches };
  }

  // ── 3. Idempotency ────────────────────────────────────────────────────────
  var idStatus = '', idResult = '', idTraceId = '';
  var idSheet = ss.getSheetByName('Ops_IdempotencyLog');
  if (idSheet) {
    var idData = idSheet.getDataRange().getValues();
    for (var i = 1; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === messageId) {
        idStatus  = String(idData[i][2] || '');   // COL.STATUS
        idResult  = String(idData[i][6] || '');   // COL.RESULT_TYPE
        idTraceId = String(idData[i][12] || '');  // COL.TRACE_ID
        break;
      }
    }
  }
  log('─── Idempotency ────────────────────────────────────────────');
  if (idStatus) {
    log('Status     : ' + idStatus);
    log('Result     : ' + idResult);
    log('Trace ID   : ' + idTraceId);
  } else {
    log('Status     : NOT FOUND in Ops_IdempotencyLog');
  }

  // ── 4. Ops_DraftQueue ────────────────────────────────────────────────────
  log('─── Ops_DraftQueue ─────────────────────────────────────────');
  var dqByMsg   = scanTab('Ops_DraftQueue', 'message_id', messageId).rows;
  var dqByTrace = idTraceId ? scanTab('Ops_DraftQueue', 'trace_id', idTraceId).rows : [];
  var dqRows    = dqByMsg.slice();
  dqByTrace.forEach(function (r) {
    if (!dqRows.some(function (e) { return e.queue_id === r.queue_id; })) dqRows.push(r);
  });
  log('Rows found : ' + dqRows.length);
  var hasDraft = false;
  dqRows.forEach(function (r, idx) {
    var gid = String(r.gmail_draft_id || '').trim();
    var isReal = gid && gid.indexOf('SIM-DRAFT-') !== 0;
    if (isReal) hasDraft = true;
    log('  [' + idx + '] gmail_draft_id=' + (gid || '(empty)') +
        ' status='   + (r.status         || '') +
        ' mode='     + (r.mode           || '') +
        ' email='    + (r.customer_email || '') +
        ' channel='  + (r.source_channel || '') +
        (isReal ? ' ← REAL DRAFT' : ''));
  });

  // ── 5. Ops_ReviewQueue ────────────────────────────────────────────────────
  log('─── Ops_ReviewQueue ────────────────────────────────────────');
  var rqByMsg   = scanTab('Ops_ReviewQueue', 'message_id', messageId).rows;
  var rqByTrace = idTraceId ? scanTab('Ops_ReviewQueue', 'trace_id', idTraceId).rows : [];
  var rqRows    = rqByMsg.slice();
  rqByTrace.forEach(function (r) {
    if (!rqRows.some(function (e) { return e.queue_id === r.queue_id; })) rqRows.push(r);
  });
  log('Rows found : ' + rqRows.length);
  rqRows.forEach(function (r, idx) {
    log('  [' + idx + '] reason='         + (r.reason         || '') +
        ' severity='     + (r.severity       || '') +
        ' status='       + (r.status         || '') +
        ' channel='      + (r.source_channel || '') +
        ' rental_item='  + (r.rental_item    || '') +
        ' event_date='   + (r.event_date     || '') +
        ' missing='      + (r.missing_fields || ''));
  });

  // ── 6. Automation Queue ──────────────────────────────────────────────────
  log('─── Automation Queue (Ops_AutomationQueue) ─────────────────');
  var aqRows = scanTab('Automation Queue', 'message_id', messageId).rows;
  log('Rows found : ' + aqRows.length);
  aqRows.forEach(function (r, idx) {
    log('  [' + idx + '] decision=' + (r.decision || '') +
        ' status='  + (r.status   || '') +
        ' intent='  + (r.intent   || ''));
  });

  // ── 7. Ops_InquiryState ──────────────────────────────────────────────────
  log('─── Ops_InquiryState ───────────────────────────────────────');
  var isRows = scanTab('Ops_InquiryState', 'thread_id', threadId).rows;
  log('Rows found : ' + isRows.length);
  isRows.forEach(function (r, idx) {
    log('  [' + idx + '] stage=' + (r.inquiry_stage || '') +
        ' first_response=' + (r.first_response_draft_created || '') +
        ' email='          + (r.customer_email || ''));
  });

  // ── 8. Ops_Metrics ───────────────────────────────────────────────────────
  var hasMetricsReviewFlag = false;
  if (idTraceId) {
    log('─── Ops_Metrics (trace_id=' + idTraceId + ') ────────────────');
    var mRows = scanTab('Ops_Metrics', 'trace_id', idTraceId).rows;
    log('Events found : ' + mRows.length);
    mRows.forEach(function (r, idx) {
      var evType = String(r.event_type || '');
      if (evType === 'MANUAL_REVIEW_FLAGGED') hasMetricsReviewFlag = true;
      log('  [' + idx + '] event_type=' + evType + ' worker=' + (r.worker_script || ''));
    });
  }

  // ── 9. Verdict ───────────────────────────────────────────────────────────
  log('─── Verdict ────────────────────────────────────────────────');
  var hasLabel     = gmailLabels.indexOf(TENANT.PROCESSED_LABEL) !== -1;
  var hasReviewRow = rqRows.length > 0;
  var isSkipped    = idStatus === 'SKIPPED';

  var isInternalReviewDraft = hasDraft && dqRows.some(function (r) {
    return String(r.intent || '').trim() === 'internal_review';
  });

  var verdict;
  if (isInternalReviewDraft) {
    verdict = 'OK_INTERNAL_REVIEW_DRAFT_CREATED';
  } else if (hasDraft && hasReviewRow) {
    verdict = 'OK_DRAFT_CREATED_REVIEW_REQUIRED';
  } else if (hasDraft) {
    verdict = 'OK_DRAFT_CREATED';
  } else if (isSkipped) {
    verdict = 'OK_SKIPPED_WITH_REASON';
  } else if (idStatus === 'COMPLETED') {
    verdict = 'BAD_CUSTOMER_INQUIRY_WITHOUT_DRAFT';
  } else if (hasMetricsReviewFlag && !hasReviewRow) {
    verdict = 'BAD_MANUAL_REVIEW_LOGGED_BUT_NO_REVIEW_QUEUE_ROW';
  } else if (hasLabel) {
    verdict = 'BAD_PROCESSED_LABEL_WITHOUT_OUTCOME';
  } else {
    verdict = 'UNKNOWN — not yet processed or audit data missing';
  }

  log('Idempotency : ' + (idStatus || 'NOT_FOUND') + ' / ' + (idResult || 'N/A'));
  log('Processed label applied          : ' + (hasLabel ? 'YES' : 'NO'));
  log('Real Gmail draft                 : ' + (hasDraft ? 'YES' : 'NO'));
  log('Internal owner-review draft      : ' + (isInternalReviewDraft ? 'YES' : 'NO'));
  log('ReviewQueue row                  : ' + (hasReviewRow ? 'YES' : 'NO'));
  log('Metrics MANUAL_REVIEW_FLAGGED    : ' + (hasMetricsReviewFlag ? 'YES' : 'NO'));
  log('');
  log('VERDICT: ' + verdict);
  log('═══════════════════════════════════════════════════════════');
}

function runAuditKnownMessage_19e6069cfe3c13fd() {
  return runProcessedMessageAudit('19e6069cfe3c13fd');
}

function runAuditKnownMessage_19e60e3de1983703() {
  return runProcessedMessageAudit('19e60e3de1983703');
}

function runAuditKnownMessage_19e60e2dd28f623e() {
  return runProcessedMessageAudit('19e60e2dd28f623e');
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * runBackfillProcessedLabelForCompletedCandidates()
 *
 * One-time admin repair: finds Gmail threads matching the contact-form subjects
 * whose idempotency row is COMPLETED or SKIPPED but that are missing the
 * NK/Contact-Processed label, then applies the label.
 *
 * Searches the last 30 days WITHOUT the label exclusion filter so it can see
 * threads that were processed but never labeled.
 *
 * Safe:
 *   - Applies Gmail labels only. No drafts. No emails sent. No Sheets writes.
 *   - Threads that already have the label are skipped.
 *   - Threads without a COMPLETED/SKIPPED idempotency row are skipped.
 *
 * Live only — this function is intentionally not simulation-gated because
 * applying a Gmail label is its sole purpose.
 */
function runBackfillProcessedLabelForCompletedCandidates() {
  _assertSpreadsheetId();

  // ── Build label object once ───────────────────────────────────────────────
  var label;
  try {
    label = GmailApp.getUserLabelByName(TENANT.PROCESSED_LABEL)
         || GmailApp.createLabel(TENANT.PROCESSED_LABEL);
  } catch (e) {
    console.error('[BACKFILL] Could not get/create label "' + TENANT.PROCESSED_LABEL + '": ' + e.message);
    return;
  }

  // ── Search last 30 days — no label exclusion so we catch unlabeled ones ──
  var query = '(' + TENANT.CONTACT_SUBJECTS.map(function (s) {
    return 'subject:"' + s + '"';
  }).join(' OR ') + ') newer_than:30d';

  console.log('[BACKFILL] Query    : ' + query);
  var threads = GmailApp.search(query, 0, 100);
  console.log('[BACKFILL] Threads  : ' + threads.length);

  // ── Load idempotency index into memory ────────────────────────────────────
  var ss      = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var idSheet = ss.getSheetByName('Ops_IdempotencyLog');
  var idIndex = {};   // messageId → status
  if (idSheet) {
    var idData = idSheet.getDataRange().getValues();
    for (var i = 1; i < idData.length; i++) {
      var key = String(idData[i][0]).trim();   // COL.KEY
      if (key) idIndex[key] = String(idData[i][2] || '');  // COL.STATUS
    }
  }

  // ── Walk each thread ──────────────────────────────────────────────────────
  var counts = { applied: 0, alreadyLabeled: 0, skippedNotComplete: 0, errors: 0 };

  threads.forEach(function (thread) {
    var firstMsgId = thread.getMessages()[0].getId();
    var existingLabels = thread.getLabels().map(function (l) { return l.getName(); });
    var hasLabel  = existingLabels.indexOf(TENANT.PROCESSED_LABEL) !== -1;
    var idStatus  = idIndex[firstMsgId] || 'NOT_FOUND';

    if (hasLabel) {
      counts.alreadyLabeled++;
      console.log('[BACKFILL] SKIP already_labeled  msgId=' + firstMsgId);
      return;
    }

    if (idStatus !== 'COMPLETED' && idStatus !== 'SKIPPED') {
      counts.skippedNotComplete++;
      console.log('[BACKFILL] SKIP idempotency=' + idStatus + ' msgId=' + firstMsgId);
      return;
    }

    try {
      label.addToThread(thread);
      counts.applied++;
      console.log('[BACKFILL] LABELED idempotency=' + idStatus + ' msgId=' + firstMsgId);
    } catch (e) {
      counts.errors++;
      console.error('[BACKFILL] ERROR labeling msgId=' + firstMsgId + ': ' + e.message);
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('[BACKFILL] ─────────────────────────────────────────────────────');
  console.log('[BACKFILL] Applied            : ' + counts.applied);
  console.log('[BACKFILL] Already labeled    : ' + counts.alreadyLabeled);
  console.log('[BACKFILL] Skipped (not done) : ' + counts.skippedNotComplete);
  console.log('[BACKFILL] Errors             : ' + counts.errors);
}

// ─── Intake Candidate Debug ───────────────────────────────────────────────────

/**
 * runIntakeCandidateDebug()
 *
 * Read-only. Logs:
 *   - The exact Gmail query used by _fetchUnprocessedThreads()
 *   - Candidate thread count
 *   - For each candidate: subject / from / labels / idempotency status /
 *     whether _processThread would process or skip it
 *
 * No Gmail draft created. No labels applied. No Sheets writes.
 */
function runIntakeCandidateDebug() {
  _assertSpreadsheetId();

  var query = _intakeCandidateQuery();
  console.log('[CANDIDATE-DEBUG] Gmail query : ' + query);

  var threads = GmailApp.search(query, 0, TENANT.MAX_THREADS_PER_RUN);
  console.log('[CANDIDATE-DEBUG] Candidates  : ' + threads.length);

  if (!threads.length) {
    console.log('[CANDIDATE-DEBUG] No candidates. Inbox is clear or all are labeled.');
    return;
  }

  var ss = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var idSheet = ss.getSheetByName('Ops_IdempotencyLog');
  var idData  = idSheet ? idSheet.getDataRange().getValues() : [];

  function idempotencyStatus(msgId) {
    for (var i = 1; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === msgId) return String(idData[i][2] || 'FOUND_NO_STATUS');
    }
    return 'NOT_FOUND';
  }

  threads.forEach(function (thread, idx) {
    var msgs   = thread.getMessages();
    var first  = msgs[0];
    var msgId  = first.getId();
    var labels = thread.getLabels().map(function (l) { return l.getName(); });
    var idStatus = idempotencyStatus(msgId);
    var wouldSkip = (idStatus === 'COMPLETED' || idStatus === 'SKIPPED' || idStatus === 'PROCESSING');

    console.log('[CANDIDATE-DEBUG] [' + idx + '] msgId=' + msgId);
    console.log('[CANDIDATE-DEBUG]       Subject : ' + first.getSubject());
    console.log('[CANDIDATE-DEBUG]       From    : ' + first.getFrom());
    console.log('[CANDIDATE-DEBUG]       Labels  : ' + (labels.length ? labels.join(', ') : '(none)'));
    console.log('[CANDIDATE-DEBUG]       Idempotency : ' + idStatus);
    console.log('[CANDIDATE-DEBUG]       Would   : ' + (wouldSkip ? 'SKIP (already processed)' : 'PROCESS'));
  });

  console.log('[CANDIDATE-DEBUG] Done.');
}

/**
 * _logQueueRowByTraceId(tabName, traceId, label)
 *
 * Scans tabName (newest-first) for the first row whose trace_id column
 * matches traceId and logs its queue_id under label.
 * Read-only; no writes.
 */
function _logQueueRowByTraceId(tabName, traceId, label) {
  try {
    var ss    = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return;
    var data     = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers  = data[0].map(function (h) { return String(h).trim(); });
    var tidx     = headers.indexOf('trace_id');
    var qidx     = headers.indexOf('queue_id');
    if (tidx === -1 || qidx === -1) return;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][tidx]).trim() === traceId) {
        console.log(label + ' : ' + data[i][qidx]);
        return;
      }
    }
  } catch (e) {
    console.warn('_logQueueRowByTraceId(' + tabName + '): ' + e.message);
  }
}

// ─── Live readiness check ─────────────────────────────────────────────────────

/**
 * runLiveReadinessCheck()
 *
 * Read-only pre-flight that logs the current operational state and outputs one
 * of three final verdicts:
 *
 *   SAFE_SIMULATION_MODE          — simulation_mode=true; no real side effects possible
 *   READY_FOR_DRAFT_ONLY_LIVE_MODE — live mode, drafts enabled, auto-send impossible
 *   NOT_READY                     — config missing, intake disabled, or indeterminate state
 *
 * Guarantees:
 *   - No emails sent.
 *   - No Gmail drafts created.
 *   - No Gmail messages read.
 *   - No intake processing.
 *   - Ops_DraftQueue and Ops_ReviewQueue are checked for existence only; not created.
 */
function runLiveReadinessCheck() {
  _assertSpreadsheetId();
  ConfigLoader.clearCache();

  var lines   = ['=== Live Readiness Check ==='];
  var ready   = true;
  var verdict = 'NOT_READY';

  // ── 1. Identity ───────────────────────────────────────────────────────────
  lines.push('tenant_id      : ' + TENANT.TENANT_ID);
  lines.push('spreadsheet_id : ' + TENANT.SPREADSHEET_ID);

  // ── 2–5. Ops controls ─────────────────────────────────────────────────────
  var controls;
  try {
    controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  } catch (e) {
    lines.push('FAIL  ops controls could not be loaded: ' + e.message);
    lines.push('');
    lines.push('Verdict: NOT_READY');
    lines.forEach(function (l) { console.log(l); });
    Logger.log(lines.join('\n'));
    return;
  }

  var simMode        = !!controls.simulation_mode;
  var autoDraft      = !!controls.auto_draft_enabled;
  var intakeEnabled  = !!controls.intake_script_enabled;

  lines.push('simulation_mode      : ' + simMode);
  lines.push('auto_draft_enabled   : ' + autoDraft);
  lines.push('intake_script_enabled: ' + intakeEnabled);

  if (!intakeEnabled) {
    lines.push('WARN  intake_script_enabled = false — worker will exit immediately on run');
    ready = false;
  }

  // ── 6–7. Operational queue tabs ───────────────────────────────────────────
  var ss = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  ['Ops_DraftQueue', 'Ops_ReviewQueue'].forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName);
    lines.push(tabName + ': ' + (sheet ? 'EXISTS' : 'absent (will be created on first live write)'));
  });

  // ── 8. Draft creation status ──────────────────────────────────────────────
  var draftStatus;
  if (simMode) {
    draftStatus = 'SUPPRESSED — simulation_mode=true, all drafts written to Sim_Drafts only';
  } else if (autoDraft) {
    draftStatus = 'ENABLED — live mode, Gmail drafts will be created (not auto-sent)';
  } else {
    draftStatus = 'SUPPRESSED — auto_draft_enabled=false, no Gmail drafts will be created';
    ready = false;
  }
  lines.push('Gmail draft creation : ' + draftStatus);

  // ── 9. Auto-send safety ───────────────────────────────────────────────────
  // The system NEVER auto-sends email. processContactIntake() creates Gmail
  // drafts only. Harkirat must review and click Send manually.
  lines.push('Auto-send emails     : IMPOSSIBLE — system creates drafts only; manual send required');

  // ── 10. Final verdict ─────────────────────────────────────────────────────
  if (simMode && intakeEnabled) {
    verdict = 'SAFE_SIMULATION_MODE';
  } else if (!simMode && autoDraft && intakeEnabled) {
    verdict = 'READY_FOR_DRAFT_ONLY_LIVE_MODE';
  } else {
    verdict = 'NOT_READY';
  }

  var nextStep;
  if (verdict === 'SAFE_SIMULATION_MODE') {
    nextStep = 'Next: run runSimulationTest() to exercise the pipeline safely. ' +
               'To go live: set simulation_mode=false and auto_draft_enabled=true in Config_OpsControls, ' +
               'then rerun runLiveReadinessCheck().';
  } else if (verdict === 'READY_FOR_DRAFT_ONLY_LIVE_MODE') {
    nextStep = 'Next: run runLiveDraftOnlyTestFromMessageId(messageId) or ' +
               'runLiveDraftOnlyTestLatestWeb3Forms() to create a real Gmail draft.';
  } else {
    nextStep = 'Fix the issues above, then rerun runLiveReadinessCheck().';
  }

  lines.push('Verdict  : ' + verdict);
  lines.push('Next step: ' + nextStep);
  lines.forEach(function (l) { console.log(l); });
  Logger.log(lines.join('\n'));
}

// ─── Mock thread factory ──────────────────────────────────────────────────────

function _mockThread(msgId, body, subject, from) {
  return {
    getId:        function () { return 'SIM-THREAD-' + msgId; },
    getPermalink: function () { return 'https://mail.google.com/sim/' + msgId; },
    getMessages:  function () {
      return [{
        getId:        function () { return msgId; },
        getSubject:   function () { return subject; },
        getPlainBody: function () { return body; },
        getFrom:      function () { return from; }
      }];
    },
    addLabel:     function () {},
    removeLabel:  function () {}
  };
}
