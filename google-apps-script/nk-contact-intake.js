/**
 * NK Contact Intake — Worker Script
 *
 * Processes Web3Forms "Booking Inquiry" and "Quick Event Assistant Inquiry"
 * emails from Gmail. Classifies intent, upserts customer, creates queue task,
 * generates safe draft (or logs to Sim_ tabs in simulation mode).
 *
 * This script is a thin orchestrator. All business logic lives in RentalOps Core.
 *
 * DO NOT DEPLOY until:
 *   1. All Config_* tabs created in CRM (see schema/SETUP.md)
 *   2. TENANT.SPREADSHEET_ID filled in below
 *   3. Anthropic API key added to Script Properties as 'ANTHROPIC_API_KEY'
 *   4. simulation_mode = true confirmed in Config_OpsControls
 *   5. TestHarness.testAll() passes
 *   6. At least 5 simulation runs reviewed manually
 */

// ─── Tenant Config ────────────────────────────────────────────────────────────
// Only NKR-specific values live here. All business logic is in RentalOps Core.

var TENANT = {
  SPREADSHEET_ID:       'YOUR_CRM_SPREADSHEET_ID', // ← Fill in before deploying
  TENANT_ID:            'nkr',
  ANTHROPIC_KEY_PROP:   'ANTHROPIC_API_KEY',        // Script Properties key name
  PROCESSED_LABEL:      'NK/Contact-Processed',
  CONTACT_SUBJECTS:     ['Booking Inquiry', 'Quick Event Assistant Inquiry'],
  WORKER_SCRIPT:        'nk-contact-intake',
  MAX_THREADS_PER_RUN:  20                           // Safety cap per execution
};

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * processContactIntake — call this from a time-based trigger (future Phase 1b).
 * For now: run manually from Apps Script editor to test.
 */
function processContactIntake() {
  var traceId = Identifiers.traceId();
  var controls, profile;

  try {
    controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
    profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  } catch (e) {
    console.error('Contact Intake: failed to load config — ' + e.message);
    return;
  }

  if (!controls.intake_script_enabled) {
    console.log('Contact Intake: intake_script_enabled = false — skipping');
    return;
  }

  var threads = _fetchUnprocessedThreads();
  console.log('Contact Intake: found ' + threads.length + ' unprocessed thread(s)');

  var processed = 0;
  for (var i = 0; i < threads.length && i < TENANT.MAX_THREADS_PER_RUN; i++) {
    try {
      _processThread(threads[i], controls, profile, traceId);
      processed++;
    } catch (e) {
      console.error('Contact Intake: unhandled error on thread — ' + e.message);
      MetricsLogger.logError(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, TENANT.WORKER_SCRIPT, e.message, traceId);
    }
  }

  console.log('Contact Intake: completed ' + processed + '/' + threads.length + ' thread(s)');
}

// ─── Per-Thread Processor ─────────────────────────────────────────────────────

function _processThread(thread, controls, profile, runTraceId) {
  var messages = thread.getMessages();
  var firstMsg = messages[0];
  var messageId = firstMsg.getId();
  var traceId   = Identifiers.traceId(); // per-thread trace

  // ── Step 1: Idempotency check (inside lock) ──────────────────────────────
  var existing = Locking.withScriptLock(function () {
    var record = Idempotency.check(TENANT.SPREADSHEET_ID, messageId);
    if (!record) {
      Idempotency.markProcessing(TENANT.SPREADSHEET_ID, messageId,
        TENANT.TENANT_ID, TENANT.WORKER_SCRIPT, traceId);
    }
    return record;
  });

  if (existing) {
    if (existing.status === 'PROCESSING') {
      console.log('Contact Intake: ' + messageId + ' already in PROCESSING — skipping (active lock)');
    } else {
      console.log('Contact Intake: ' + messageId + ' already ' + existing.status + ' — skipping');
    }
    return;
  }

  // ── Step 2: Parse email ───────────────────────────────────────────────────
  var subject   = firstMsg.getSubject();
  var body      = firstMsg.getPlainBody();
  var sender    = firstMsg.getFrom();
  var senderEmail = _extractEmail(sender);
  var parsed    = ContactFormParser.parse(body, subject);

  if (!parsed) {
    // Unknown form subject — route to manual review
    _writeManualReview(messageId, senderEmail, thread.getPermalink(),
      'Unknown form subject: ' + subject, 'medium', traceId, controls);
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW',
      { traceId: traceId });
    _applyProcessedLabel(thread);
    return;
  }

  var firstName = ContactFormParser.firstName(parsed.name) || 'there';

  // ── Step 3: Load customer from CRM ───────────────────────────────────────
  var crmCustomer = DataProvider.findCustomerByEmail(TENANT.SPREADSHEET_ID, senderEmail) || {};

  // ── Step 4: Pre-AI code gates ─────────────────────────────────────────────
  var riskRules   = ConfigLoader.getRiskRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var preAiCtx    = {
    sender_email:          senderEmail,
    customer_do_not_contact: !!(crmCustomer.do_not_contact),
    last_sender_is_business: _isBusinessEmail(senderEmail, profile.email)
  };
  var preGate = RiskEvaluator.evaluate(riskRules, preAiCtx);

  if (preGate.worstAction === 'no_draft' || preGate.worstAction === 'escalate') {
    var skipReason = preGate.triggered.map(function (r) { return r.reason; }).join('; ');
    Idempotency.markSkipped(TENANT.SPREADSHEET_ID, messageId, TENANT.TENANT_ID,
      TENANT.WORKER_SCRIPT, skipReason, traceId);
    MetricsLogger.log(TENANT.SPREADSHEET_ID, {
      tenantId: TENANT.TENANT_ID, eventType: 'RISK_RULE_TRIGGERED',
      workerScript: TENANT.WORKER_SCRIPT,
      metadata: { messageId: messageId, action: preGate.worstAction, reason: skipReason },
      traceId: traceId
    });
    if (preGate.worstAction !== 'no_draft') {
      _writeManualReview(messageId, senderEmail, thread.getPermalink(),
        skipReason, preGate.worstSeverity, traceId, controls);
    }
    _applyProcessedLabel(thread);
    return;
  }

  // ── Step 5: Build context bundle ──────────────────────────────────────────
  var units    = ConfigLoader.getInventoryUnits(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var unitList = Object.values(units).map(function (u) {
    return u.unit_name + ': $' + u.base_price + (u.status === 'coming_soon' ? ' (' + u.availability_note + ')' : '');
  });

  var contextBundle = {
    tenant_id:              TENANT.TENANT_ID,
    message_id:             messageId,
    thread_id:              thread.getId(),
    sender_email:           senderEmail,
    sender_name:            parsed.name || '',
    form_subject:           subject,
    thread_message_count:   messages.length,
    last_sender_is_business: preAiCtx.last_sender_is_business,
    current_date:           new Date().toISOString().slice(0, 10),
    parsed_form:            parsed,
    customer_crm: {
      exists:        !!(crmCustomer.customer_id),
      readiness:     crmCustomer.readiness     || null,
      trust_score:   crmCustomer.trust_score   || null,
      do_not_contact: !!(crmCustomer.do_not_contact),
      booking_count: crmCustomer.booking_count || 0,
      owner_notes:   crmCustomer.owner_notes   || ''
    },
    available_units:        unitList,
    business_rules: {
      deposit_rate:      profile.deposit_rate,
      free_travel_km:    profile.free_travel_km,
      travel_fee_per_km: profile.travel_fee_per_km,
      card_surcharge:    profile.card_surcharge_rate,
      wind_limit_kmh:    profile.wind_limit_kmh
    }
  };

  var bundleValidation = Validators.validateContextBundle(contextBundle);
  if (!bundleValidation.valid) {
    Idempotency.markFailed(TENANT.SPREADSHEET_ID, messageId,
      'Invalid context bundle: ' + bundleValidation.errors.join(', '), { traceId: traceId });
    return;
  }

  // ── Step 6: AI Call #1 — classify intent ─────────────────────────────────
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId: TENANT.TENANT_ID, eventType: 'AI_CALL_CLASSIFY',
    workerScript: TENANT.WORKER_SCRIPT, traceId: traceId
  });

  var aiDecision = AiClient.classify(contextBundle, controls.ai_model_classify, TENANT.ANTHROPIC_KEY_PROP);

  // Validate AI output structure
  var aiValidation = Validators.validateAiActionDecision(aiDecision);
  if (!aiValidation.valid || aiDecision.error) {
    _writeManualReview(messageId, senderEmail, thread.getPermalink(),
      'AI classification failed: ' + (aiDecision.raw || aiValidation.errors.join(', ')),
      'medium', traceId, controls);
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW', { traceId: traceId });
    _applyProcessedLabel(thread);
    return;
  }

  // ── Step 7: Post-AI risk gate ─────────────────────────────────────────────
  var postAiCtx = Object.assign({}, preAiCtx, {
    intent:     aiDecision.intent,
    confidence: aiDecision.confidence
  });
  var postGate = RiskEvaluator.evaluate(riskRules, postAiCtx);
  if (postGate.worstAction && postGate.worstAction !== 'flag_only') {
    var postReason = postGate.triggered.map(function (r) { return r.reason; }).join('; ');
    if (postGate.worstAction === 'manual_review' || postGate.worstAction === 'escalate') {
      _writeManualReview(messageId, senderEmail, thread.getPermalink(),
        postReason, postGate.worstSeverity, traceId, controls);
    }
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW', { traceId: traceId });
    _applyProcessedLabel(thread);
    _logInquiry(messageId, senderEmail, parsed, aiDecision, 'MANUAL_REVIEW', traceId);
    return;
  }

  // status_only — log and close, no draft
  if (aiDecision.decision === 'status_only' || aiDecision.decision === 'no_draft') {
    _upsertCustomerAndQueue(parsed, senderEmail, aiDecision, messageId, traceId, controls);
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'STATUS_ONLY', { traceId: traceId });
    _applyProcessedLabel(thread);
    _logInquiry(messageId, senderEmail, parsed, aiDecision, 'STATUS_ONLY', traceId);
    return;
  }

  // ── Step 8: Prepare draft ─────────────────────────────────────────────────
  var quoteResult = null;
  var templateVars = TemplateRenderer.buildVars(
    { customer: { first_name: firstName, name: parsed.name, email: senderEmail, phone: parsed.phone },
      booking:  { event_date: parsed.event_date, event_address: parsed.event_address },
      event_date: parsed.event_date, event_address: parsed.event_address,
      organization_name: parsed.name,
      missing_field_question: _missingFieldQuestion(aiDecision.missing_fields) },
    null, profile
  );

  // If mode = quote and all fields present, run QuoteEngine
  if (aiDecision.mode === 'quote' && parsed.rental_item && parsed.event_date && parsed.event_address) {
    var matchedUnit = _findUnit(parsed.rental_item, units);
    if (matchedUnit) {
      quoteResult = QuoteEngine.calculate({
        tenantId: TENANT.TENANT_ID,
        lineItems: [{ unitId: matchedUnit.unit_id, unitName: matchedUnit.unit_name,
                      basePrice: matchedUnit.base_price, hours: matchedUnit.default_hours }],
        distanceKm: 0, // Distance unknown at this stage — travel fee excluded, noted in draft
        attendantHours: 0, paymentMethod: 'etransfer',
        extensionRequested: false, discountPct: 0, sillyStringDamage: false,
        businessProfile: profile,
        pricingRules: ConfigLoader.getPricingRules(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID)
      });
      templateVars = TemplateRenderer.buildVars(
        { customer: { first_name: firstName, name: parsed.name, email: senderEmail, phone: parsed.phone },
          booking:  { event_date: parsed.event_date, event_address: parsed.event_address } },
        quoteResult, profile
      );
    } else {
      // Unit not matched — downgrade to ask_once
      aiDecision.mode = 'ask_once';
      if (!aiDecision.missing_fields) aiDecision.missing_fields = [];
      aiDecision.missing_fields.push('rental_item');
      templateVars.missing_field_question = 'Which inflatable or package are you interested in?';
    }
  }

  // Select and render template
  var templates = ConfigLoader.getMessageTemplates(
    TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, aiDecision.intent, aiDecision.mode
  );
  // Fall back to mode-only match if intent+mode has no template
  if (!templates.length) {
    templates = ConfigLoader.getMessageTemplates(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID, null, aiDecision.mode);
  }
  if (!templates.length) {
    _writeManualReview(messageId, senderEmail, thread.getPermalink(),
      'No template found for intent=' + aiDecision.intent + ' mode=' + aiDecision.mode,
      'medium', traceId, controls);
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW', { traceId: traceId });
    _applyProcessedLabel(thread);
    return;
  }

  var template = templates[0];
  var scaffold = TemplateRenderer.render(template.body_template, templateVars);
  var subject  = TemplateRenderer.render(template.subject_template || 'Re: Nova Kingdom Rentals', templateVars);

  // ── Step 9: AI Call #2 — polish draft ────────────────────────────────────
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId: TENANT.TENANT_ID, eventType: 'AI_CALL_DRAFT',
    workerScript: TENANT.WORKER_SCRIPT, traceId: traceId
  });

  var draftBody = AiClient.draftReply(scaffold, contextBundle, controls.ai_model_draft, TENANT.ANTHROPIC_KEY_PROP);

  // ── Step 10: Post-draft validation ────────────────────────────────────────
  var forbiddenHits = TemplateRenderer.checkForbiddenPhrases(draftBody);
  if (forbiddenHits.length) {
    _writeManualReview(messageId, senderEmail, thread.getPermalink(),
      'Draft contains forbidden phrases: ' + forbiddenHits.join(', '), 'high', traceId, controls);
    Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW', { traceId: traceId });
    _applyProcessedLabel(thread);
    return;
  }

  if (quoteResult) {
    var groundingFail = RiskEvaluator.draftContainsUnlistedPrice(draftBody, quoteResult.priceBlock);
    if (groundingFail) {
      _writeManualReview(messageId, senderEmail, thread.getPermalink(),
        'Draft contains unlisted price — possible AI hallucination', 'high', traceId, controls);
      Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'MANUAL_REVIEW', { traceId: traceId });
      _applyProcessedLabel(thread);
      return;
    }
  }

  // Draft must always include review flag
  var finalDraft = draftBody + '\n\n— DRAFT — REVIEW BEFORE SENDING —';

  // ── Step 11: Write draft (or simulate) ───────────────────────────────────
  var draftId = '';
  if (controls.simulation_mode) {
    _writeSimDraft(messageId, senderEmail, subject, finalDraft, aiDecision, traceId, quoteResult);
  } else if (controls.auto_draft_enabled) {
    draftId = _createGmailDraft(senderEmail, subject, finalDraft);
  } else {
    // auto_draft_enabled = false: log only, no draft
    console.log('Contact Intake: auto_draft_enabled = false — draft not created for ' + messageId);
  }

  // ── Step 12: Upsert customer + write queue task ───────────────────────────
  _upsertCustomerAndQueue(parsed, senderEmail, aiDecision, messageId, traceId, controls);

  // ── Step 13: Complete ──────────────────────────────────────────────────────
  Idempotency.markCompleted(TENANT.SPREADSHEET_ID, messageId, 'DRAFT_CREATED',
    { draftId: draftId, traceId: traceId });
  _applyProcessedLabel(thread);
  _logInquiry(messageId, senderEmail, parsed, aiDecision, 'DRAFT_CREATED', traceId);

  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId: TENANT.TENANT_ID, eventType: 'DRAFT_CREATED',
    workerScript: TENANT.WORKER_SCRIPT,
    value: quoteResult ? quoteResult.quoteTotal : null, unit: quoteResult ? 'CAD' : null,
    metadata: { messageId: messageId, intent: aiDecision.intent, mode: aiDecision.mode, simulation: controls.simulation_mode },
    traceId: traceId
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _fetchUnprocessedThreads() {
  var query = TENANT.CONTACT_SUBJECTS.map(function (s) {
    return 'subject:"' + s + '"';
  }).join(' OR ');
  query += ' -label:' + TENANT.PROCESSED_LABEL;
  return GmailApp.search(query, 0, TENANT.MAX_THREADS_PER_RUN);
}

function _extractEmail(from) {
  var match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : from.toLowerCase().trim();
}

function _isBusinessEmail(senderEmail, businessEmail) {
  return senderEmail === (businessEmail || '').toLowerCase().trim();
}

function _applyProcessedLabel(thread) {
  try {
    var label = GmailApp.getUserLabelByName(TENANT.PROCESSED_LABEL)
              || GmailApp.createLabel(TENANT.PROCESSED_LABEL);
    label.addToThread(thread);
  } catch (e) {
    console.warn('Contact Intake: could not apply label — ' + e.message);
  }
}

function _findUnit(rentalItemText, units) {
  if (!rentalItemText) return null;
  var needle = rentalItemText.toLowerCase();
  var best = null;
  Object.values(units).forEach(function (u) {
    if (u.unit_name.toLowerCase().indexOf(needle) !== -1 ||
        needle.indexOf(u.unit_name.toLowerCase()) !== -1) {
      best = u;
    }
  });
  return best;
}

function _missingFieldQuestion(missingFields) {
  if (!missingFields || !missingFields.length) return '';
  var labels = {
    event_date:    'What date is your event?',
    event_address: 'Where will the event be held (full address)?',
    rental_item:   'Which inflatable or package are you interested in?',
    guest_count:   'Roughly how many guests are you expecting?'
  };
  return labels[missingFields[0]] || ('Could you let me know: ' + missingFields[0].replace(/_/g, ' ') + '?');
}

function _createGmailDraft(toEmail, subject, body) {
  try {
    var draft = GmailApp.createDraft(toEmail, subject, body);
    return draft.getId();
  } catch (e) {
    console.error('Contact Intake: failed to create Gmail draft — ' + e.message);
    return '';
  }
}

function _writeSimDraft(messageId, toEmail, subject, body, aiDecision, traceId, quoteResult) {
  var ss    = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var tab   = ss.getSheetByName('Sim_ContactDrafts');
  if (!tab) tab = ss.insertSheet('Sim_ContactDrafts');
  if (tab.getLastRow() === 0) {
    tab.appendRow(['timestamp', 'message_id', 'to_email', 'subject', 'intent', 'mode',
                   'decision', 'confidence', 'quote_total', 'deposit', 'trace_id', 'body']);
  }
  tab.appendRow([
    new Date().toISOString(), messageId, toEmail, subject,
    aiDecision.intent, aiDecision.mode, aiDecision.decision, aiDecision.confidence,
    quoteResult ? quoteResult.quoteTotal : '',
    quoteResult ? quoteResult.depositAmount : '',
    traceId, body
  ]);
}

function _writeManualReview(messageId, email, threadLink, reason, severity, traceId, controls) {
  var ss  = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var tab = ss.getSheetByName('Manual_Review');
  if (!tab) tab = ss.insertSheet('Manual_Review');
  if (tab.getLastRow() === 0) {
    tab.appendRow(['manual_review_id', 'timestamp', 'customer_email', 'thread_link',
                   'risk_reason', 'severity', 'recommended_owner_action', 'urgency', 'trace_id']);
  }
  var urgency = (severity === 'critical' || severity === 'high') ? 'TODAY' : 'THIS_WEEK';
  var action  = (severity === 'critical') ? 'Call customer immediately' : 'Review and reply manually';
  tab.appendRow([
    'MR-' + Date.now(), new Date().toISOString(), email, threadLink,
    reason, severity, action, urgency, traceId
  ]);
}

function _upsertCustomerAndQueue(parsed, senderEmail, aiDecision, messageId, traceId, controls) {
  var customerId = 'nkr-C-' + Date.now();

  Locking.withScriptLock(function () {
    var existing = DataProvider.findCustomerByEmail(TENANT.SPREADSHEET_ID, senderEmail);
    if (controls.simulation_mode) {
      _writeSimCustomer(parsed, senderEmail, aiDecision, existing, customerId, traceId);
    } else {
      var upsertData = {
        customer_id:   existing ? existing.customer_id : customerId,
        tenant_id:     TENANT.TENANT_ID,
        email:         senderEmail,
        phone:         parsed.phone || (existing ? existing.phone : ''),
        name:          parsed.name  || (existing ? existing.name  : ''),
        first_seen:    existing ? existing.first_seen : new Date().toISOString().slice(0, 10),
        last_inbound:  new Date().toISOString().slice(0, 10),
        readiness:     aiDecision.readiness || 'new',
        trust_score:   existing ? existing.trust_score : 5,
        do_not_contact: false,
        owner_notes:   existing ? existing.owner_notes : ''
      };
      DataProvider.upsertCustomer(TENANT.SPREADSHEET_ID, upsertData);
      customerId = upsertData.customer_id;
    }
  });

  _writeQueueTask(parsed, senderEmail, aiDecision, messageId, customerId, traceId, controls);
}

function _writeSimCustomer(parsed, senderEmail, aiDecision, existing, customerId, traceId) {
  var ss  = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var tab = ss.getSheetByName('Sim_Customers');
  if (!tab) tab = ss.insertSheet('Sim_Customers');
  if (tab.getLastRow() === 0) {
    tab.appendRow(['timestamp', 'action', 'customer_id', 'email', 'name', 'phone',
                   'readiness', 'trace_id']);
  }
  tab.appendRow([
    new Date().toISOString(),
    existing ? 'UPDATE' : 'INSERT',
    existing ? existing.customer_id : customerId,
    senderEmail, parsed.name || '', parsed.phone || '',
    aiDecision.readiness || 'new', traceId
  ]);
}

function _writeQueueTask(parsed, senderEmail, aiDecision, messageId, customerId, traceId, controls) {
  var tabName = controls.simulation_mode ? 'Sim_AutomationQueue' : 'Automation Queue';
  var ss  = SpreadsheetApp.openById(TENANT.SPREADSHEET_ID);
  var tab = ss.getSheetByName(tabName);
  if (!tab) tab = ss.insertSheet(tabName);
  if (tab.getLastRow() === 0) {
    tab.appendRow(['timestamp', 'task_id', 'message_id', 'customer_id', 'email', 'intent',
                   'readiness', 'decision', 'mode', 'confidence', 'event_date',
                   'rental_item', 'status', 'trace_id']);
  }
  tab.appendRow([
    new Date().toISOString(),
    'TASK-' + Date.now(),
    messageId, customerId, senderEmail,
    aiDecision.intent, aiDecision.readiness, aiDecision.decision, aiDecision.mode,
    aiDecision.confidence, parsed.event_date || '', parsed.rental_item || '',
    'PENDING', traceId
  ]);
}

function _logInquiry(messageId, senderEmail, parsed, aiDecision, outcome, traceId) {
  MetricsLogger.log(TENANT.SPREADSHEET_ID, {
    tenantId:     TENANT.TENANT_ID,
    eventType:    'INQUIRY_RECEIVED',
    workerScript: TENANT.WORKER_SCRIPT,
    metadata: {
      messageId: messageId,
      email:     senderEmail,
      intent:    aiDecision.intent,
      mode:      aiDecision.mode,
      outcome:   outcome,
      eventDate: parsed.event_date || ''
    },
    traceId: traceId
  });
}

// ─── Manual Test Function ─────────────────────────────────────────────────────

/**
 * runSimulationTest — paste a real Web3Forms email body here and run this
 * function from the Apps Script editor to test the full pipeline without
 * touching Gmail. Reads simulation_mode from Config_OpsControls.
 */
function runSimulationTest() {
  var testBody = [
    'Name : Jane Smith',
    'Email : jane.smith@example.com',
    'Phone : 902-555-0123',
    'Event Date : July 19, 2026',
    'Event Address : 45 Maple Street, Bridgewater NS',
    'Rental Items : Crown Quest bouncy castle',
    'Duration : 4 hours',
    'Guest Count : 25 kids',
    'Message : Looking for something fun for my daughter\'s 8th birthday!'
  ].join('\n');

  var testThread = {
    getId:        function () { return 'TEST-THREAD-001'; },
    getMessages:  function () { return [_mockMessage(testBody, 'Booking Inquiry')]; },
    getPermalink: function () { return 'https://mail.google.com/test'; }
  };

  var controls = ConfigLoader.getOpsControls(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  var profile  = ConfigLoader.getBusinessProfile(TENANT.SPREADSHEET_ID, TENANT.TENANT_ID);
  _processThread(testThread, controls, profile, Identifiers.traceId());
  console.log('Simulation test complete — check Sim_* tabs in CRM spreadsheet');
}

function _mockMessage(body, subject) {
  return {
    getId:          function () { return 'MSG-SIM-' + Date.now(); },
    getSubject:     function () { return subject; },
    getPlainBody:   function () { return body; },
    getFrom:        function () { return 'Jane Smith <jane.smith@example.com>'; }
  };
}
