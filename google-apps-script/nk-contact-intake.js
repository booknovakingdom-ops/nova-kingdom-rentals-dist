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
  SPREADSHEET_ID:     'YOUR_CRM_SPREADSHEET_ID', // ← fill in before deploying
  TENANT_ID:          'nkr',
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

// ─── Main Entry Point ─────────────────────────────────────────────────────────

function processContactIntake() {
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
    // Unknown form subject — use gmailSender as best available email
    ExecutionEnv.writeManualReview({
      email: gmailSender, threadLink: thread.getPermalink(),
      reason: 'Unknown form subject: ' + subject, severity: 'medium'
    }, traceId);
    _finalizeThread(thread, messageId, gmailSender, null, {
      decision: 'manual_review', intent: 'unknown', readiness: 'new',
      mode: 'escalate', confidence: 0
    }, 'MANUAL_REVIEW', traceId);
    return;
  }

  firstName = ContactFormParser.firstName(parsed.name) || 'there';

  // ── Customer email from form body (not Gmail sender) ─────────────────────
  // Web3Forms sends from notify+...@web3forms.com. The customer's real email,
  // name, and phone are in the parsed form body. Use gmailSender only as last resort.
  var customerEmail = (parsed.email && parsed.email.indexOf('@') !== -1)
    ? parsed.email.toLowerCase().trim()
    : gmailSender;

  // ══ Step 3: Pre-AI code gates (blocklist, DNC, business sender) ═══════════
  var crmCustomerForGate = DataProvider.findCustomerByEmail(TENANT.SPREADSHEET_ID, customerEmail) || {};
  var riskRules = ConfigLoader.getRiskRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);

  var preAiCtx = {
    sender_email:            customerEmail,
    customer_do_not_contact: !!(crmCustomerForGate.do_not_contact),
    last_sender_is_business: _isBusinessEmail(customerEmail, profile.email)
  };
  var preGate = RiskEvaluator.evaluate(riskRules, preAiCtx);

  if (preGate.worstAction === 'no_draft' || preGate.worstAction === 'escalate') {
    var gateReason = preGate.triggered.map(function (r) { return r.reason; }).join('; ');
    MetricsLogger.log(TENANT.SPREADSHEET_ID, {
      tenantId: TENANT.TENANT_ID, eventType: 'RISK_RULE_TRIGGERED',
      workerScript: TENANT.WORKER_SCRIPT,
      metadata: ExecutionEnv.stampMetadata({ messageId: messageId, action: preGate.worstAction, reason: gateReason }),
      traceId: traceId
    });
    if (preGate.worstAction === 'escalate') {
      ExecutionEnv.writeManualReview({
        email: customerEmail, threadLink: thread.getPermalink(),
        reason: gateReason, severity: preGate.worstSeverity
      }, traceId);
    }
    Idempotency.markSkipped(TENANT.SPREADSHEET_ID, messageId, TENANT.TENANT_ID,
      TENANT.WORKER_SCRIPT, gateReason, traceId);
    ExecutionEnv.applyGmailLabel(thread, TENANT.PROCESSED_LABEL, traceId);
    return;
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
  if (postGate.worstAction && postGate.worstAction !== 'flag_only') {
    var postReason = postGate.triggered.map(function (r) { return r.reason; }).join('; ');
    if (postGate.worstAction === 'manual_review' || postGate.worstAction === 'escalate') {
      ExecutionEnv.writeManualReview({
        email: customerEmail, threadLink: thread.getPermalink(),
        reason: postReason, severity: postGate.worstSeverity
      }, traceId);
      aiDecision.decision = 'manual_review';
    } else {
      aiDecision.decision = 'no_draft';
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

  // ══ Steps 9–13: Draft path ═══════════════════════════════════════════════════
  if (aiDecision.decision !== 'draft') {
    _finalizeThread(thread, messageId, customerEmail, parsed, aiDecision,
      aiDecision.decision === 'status_only' ? 'STATUS_ONLY' : 'NO_DRAFT', traceId);
    return;
  }

  var draftId = _buildAndCreateDraft(
    parsed, customerEmail, firstName, aiDecision, contextBundle, controls, profile, units, traceId
  );

  _finalizeThread(thread, messageId, customerEmail, parsed, aiDecision,
    draftId ? 'DRAFT_CREATED' : 'MANUAL_REVIEW', traceId);

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

function _buildAndCreateDraft(parsed, customerEmail, firstName, aiDecision, contextBundle, controls, profile, units, traceId) {
  // Quote calculation if all fields are present
  var quoteResult = null;
  if (aiDecision.mode === 'quote' && parsed.rental_item && parsed.event_date && parsed.event_address) {
    var matchedUnit = _matchUnit(parsed.rental_item, units);
    if (matchedUnit) {
      try {
        quoteResult = QuoteEngine.calculate({
          tenantId: TENANT.TENANT_ID,
          lineItems: [{ unitId: matchedUnit.unit_id, unitName: matchedUnit.unit_name,
                        basePrice: matchedUnit.base_price, hours: matchedUnit.default_hours }],
          distanceKm: 0,
          attendantHours: 0, paymentMethod: 'etransfer',
          extensionRequested: false, discountPct: 0, sillyStringDamage: false,
          businessProfile: profile,
          pricingRules: ConfigLoader.getPricingRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID)
        });
      } catch (e) {
        console.warn('Contact Intake: QuoteEngine failed — ' + e.message + ' — downgrading to ask_once');
        quoteResult = null;
        aiDecision.mode = 'ask_once';
      }
    } else {
      aiDecision.mode = 'ask_once';
      aiDecision.missing_fields = (aiDecision.missing_fields || []).concat(['rental_item']);
    }
  }

  // Template selection
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
      email: customerEmail, threadLink: '',
      reason: 'No template: intent=' + aiDecision.intent + ' mode=' + aiDecision.mode,
      severity: 'medium'
    }, traceId);
    return '';
  }

  var template = templates[0];
  var vars     = TemplateRenderer.buildVars(
    { customer:  { first_name: firstName, name: parsed.name || '', email: customerEmail, phone: parsed.phone || '' },
      booking:   { event_date: parsed.event_date || '', event_address: parsed.event_address || '' },
      event_date: parsed.event_date || '', event_address: parsed.event_address || '',
      organization_name:      parsed.name || '',
      missing_field_question: _missingFieldQ(aiDecision.missing_fields) },
    quoteResult, profile
  );

  var scaffold = TemplateRenderer.render(template.body_template, vars);

  // Render subject and strip any unresolved [PLACEHOLDER] tokens.
  // booking_id is not assigned at inquiry stage — remove it from subject rather than showing [BOOKING_ID].
  var subject = TemplateRenderer.render(template.subject_template || 'Re: Nova Kingdom Rentals', vars);
  subject = subject
    .replace(/\s*[-—]\s*\[[A-Z_]+\]/g, '')   // "— [BOOKING_ID]" at end
    .replace(/\[[A-Z_]+\]\s*[-—]?\s*/g, '')   // "[BOOKING_ID]" elsewhere
    .trim();
  if (!subject) subject = 'Re: Nova Kingdom Rentals';

  // AI polish (fallback to scaffold on failure)
  var draftBody = _polishWithFallback(scaffold, contextBundle, controls, traceId);

  // Post-draft validations
  var forbiddenHits = TemplateRenderer.checkForbiddenPhrases(draftBody);
  if (forbiddenHits.length) {
    ExecutionEnv.writeManualReview({
      email: customerEmail, threadLink: '',
      reason: 'Forbidden phrase in draft: ' + forbiddenHits.join(', '), severity: 'high'
    }, traceId);
    return '';
  }
  if (quoteResult && RiskEvaluator.draftContainsUnlistedPrice(draftBody, quoteResult.priceBlock)) {
    ExecutionEnv.writeManualReview({
      email: customerEmail, threadLink: '',
      reason: 'Draft contains unlisted price — possible AI hallucination', severity: 'high'
    }, traceId);
    return '';
  }

  var finalBody = draftBody + '\n\n⚠ DRAFT — REVIEW BEFORE SENDING ⚠';
  return ExecutionEnv.createDraft(customerEmail, subject, finalBody, traceId);
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
  }).join(' OR ') + ') -label:' + TENANT.PROCESSED_LABEL;
  return GmailApp.search(query, 0, TENANT.MAX_THREADS_PER_RUN);
}

function _extractEmail(from) {
  var match = String(from).match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : String(from).toLowerCase().trim();
}

function _isBusinessEmail(email, businessEmail) {
  return String(email || '').toLowerCase().trim() ===
         String(businessEmail || '').toLowerCase().trim();
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

// ─── Simulation Test ──────────────────────────────────────────────────────────

/**
 * runSimulationTest — run from Apps Script editor to test the real production form path.
 * Uses a mock thread matching the live "New Nova Kingdom Rentals Booking Inquiry" format
 * with a Web3Forms notify sender (as received in production).
 * Check Sim_Actions and Sim_Drafts tabs in the CRM spreadsheet for output.
 */
function runSimulationTest() {
  // Real production body format: label on one line, value on the next
  var testBody = [
    'Business',
    'Nova Kingdom Rentals',
    'InquiryType',
    'Birthday Party',
    'Name',
    'Jane Smith',
    'EventDate',
    'July 19, 2026',
    'EventAddress',
    '45 Maple Street, Bridgewater NS',
    'EventType',
    'Kids Birthday',
    'Guests',
    '25',
    'PackageInterest',
    'Crown Quest',
    'Phone',
    '902-555-0123',
    'Email',
    'jane.smith@example.com',
    'PreferredContact',
    'Email',
    'Notes',
    "Looking for something fun for my daughter's 8th birthday!"
  ].join('\n');

  var msgId   = 'SIM-MSG-' + Date.now();
  // Sender is the Web3Forms notify address — customer email comes from form body
  var thread  = _mockThread(msgId, testBody, 'New Nova Kingdom Rentals Booking Inquiry',
                            'Web3Forms <notify+simtest@web3forms.com>');

  var controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  ExecutionEnv.init(TENANT.SPREADSHEET_ID, controls, TENANT.TENANT_ID);

  var traceId = Identifiers.traceId();
  try {
    _processThread(thread, controls, profile, traceId);
    console.log('Simulation complete — check Sim_Actions and Sim_Drafts. traceId: ' + traceId);
  } catch (e) {
    console.error('Simulation test error: ' + e.message);
  }
}

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
    }
  };
}
