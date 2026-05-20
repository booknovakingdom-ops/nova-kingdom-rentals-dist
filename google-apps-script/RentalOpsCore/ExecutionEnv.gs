/**
 * ExecutionEnv — RentalOps Core Library
 *
 * Single routing layer for ALL operational side effects.
 * In simulation mode: intercepts every write and logs to Sim_Actions.
 * In live mode: executes real Gmail, Sheets, Calendar, notification actions.
 *
 * Rule: worker scripts call ExecutionEnv.* for every write.
 * Nothing writes directly to Gmail, live CRM tabs, or Calendar.
 *
 * Allowed real writes during simulation:
 *   Ops_IdempotencyLog — written by Idempotency module (always real)
 *   Ops_Metrics        — written by MetricsLogger module (always real)
 *   Everything else    — routes to Sim_* tabs or Sim_Actions during simulation
 *
 * What does NOT route through here:
 *   Ops_IdempotencyLog — Idempotency module handles it directly
 *   Config_* tabs      — read-only at runtime
 *
 * Initialization: call ExecutionEnv.init(spreadsheetId, controls) once
 * at the start of each worker run before calling any other method.
 */

var ExecutionEnv = (function () {

  var _simulation      = true;
  var _autoDraftEnabled = false;
  var _spreadsheetId   = '';
  var _tenantId        = '';
  var _initialized     = false;

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Must be called once at the start of every worker run.
   * Reads simulation_mode and auto_draft_enabled from ops controls.
   */
  function init(spreadsheetId, controls, tenantId) {
    _spreadsheetId    = spreadsheetId;
    _tenantId         = tenantId || '';
    _simulation       = !!controls.simulation_mode;
    _autoDraftEnabled = !!controls.auto_draft_enabled;
    _initialized      = true;
  }

  function isSimulation() {
    _assertInit();
    return _simulation;
  }

  function _assertInit() {
    if (!_initialized) throw new Error('ExecutionEnv: call init() before using any side-effect methods');
  }

  // ─── Gmail ────────────────────────────────────────────────────────────────

  /**
   * Apply a Gmail label to a thread.
   * In simulation mode: logs the action, does not touch Gmail.
   */
  function applyGmailLabel(thread, labelName, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('APPLY_LABEL', { threadId: thread.getId(), labelName: labelName }, traceId);
      return;
    }
    try {
      var label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
      label.addToThread(thread);
    } catch (e) {
      console.warn('ExecutionEnv.applyGmailLabel: ' + e.message);
    }
  }

  /**
   * Create a Gmail draft reply.
   * In simulation mode: logs action + full body to Sim_Drafts, returns fake ID.
   * In live mode with auto_draft_enabled = false: suppresses draft, logs reason.
   * In live mode with auto_draft_enabled = true: creates real Gmail draft.
   *
   * @returns {string}  Draft ID (real or simulated), or '' if suppressed.
   */
  function createDraft(toEmail, subject, body, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('CREATE_DRAFT', { toEmail: toEmail, subject: subject, bodyPreview: body.slice(0, 150) }, traceId);
      _simDraftFull(toEmail, subject, body, traceId);
      return 'SIM-DRAFT-' + Date.now();
    }
    if (!_autoDraftEnabled) {
      _simLog('DRAFT_SUPPRESSED', { toEmail: toEmail, reason: 'auto_draft_enabled=false' }, traceId);
      return '';
    }
    try {
      return GmailApp.createDraft(toEmail, subject, body).getId();
    } catch (e) {
      console.error('ExecutionEnv.createDraft: ' + e.message);
      return '';
    }
  }

  // ─── CRM Writes ───────────────────────────────────────────────────────────

  /**
   * Upsert a customer record.
   * In simulation mode: logs action to Sim_Actions only.
   * In live mode: re-reads inside script lock then upserts via DataProvider.
   *
   * @param {Object} data  Customer fields; must include email, tenant_id, customer_id
   * @returns {{ customer_id: string, isNew: boolean }}
   */
  function upsertCustomer(data, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('UPSERT_CUSTOMER', {
        email: data.email, name: data.name, phone: data.phone || '',
        readiness: data.readiness, tenantId: data.tenant_id
      }, traceId);
      return { customer_id: data.customer_id, isNew: false };
    }
    return Locking.withScriptLock(function () {
      return DataProvider.upsertCustomer(_spreadsheetId, data);
    });
  }

  /**
   * Write a queue task row.
   * In simulation mode: writes to Sim_AutomationQueue.
   * In live mode: writes to Automation Queue.
   *
   * @param {Object} data  Queue task fields
   */
  function writeQueueTask(data, traceId) {
    _assertInit();
    var tabName = _simulation ? 'Sim_AutomationQueue' : 'Automation Queue';
    var sheet   = _getOrCreateSheet(tabName, [
      'timestamp', 'task_id', 'message_id', 'customer_id', 'email',
      'intent', 'readiness', 'decision', 'mode', 'confidence',
      'event_date', 'rental_item', 'status', 'trace_id'
    ]);
    sheet.appendRow([
      new Date().toISOString(),
      data.task_id      || '',
      data.message_id   || '',
      data.customer_id  || '',
      data.email        || '',
      data.intent       || '',
      data.readiness    || '',
      data.decision     || '',
      data.mode         || '',
      data.confidence   !== undefined ? data.confidence : '',
      data.event_date   || '',
      data.rental_item  || '',
      data.status       || 'PENDING',
      traceId           || ''
    ]);
  }

  // ─── Observability (always real, not simulation-gated) ───────────────────

  /**
   * Write a manual review row.
   * In simulation mode: writes to Sim_ManualReview (never touches real Manual_Review).
   * In live mode: writes to real Manual_Review.
   * In both modes: logs MANUAL_REVIEW_FLAGGED event to Ops_Metrics (always real).
   *
   * Allowed real writes in simulation: Ops_IdempotencyLog, Ops_Metrics only.
   * Sim_ManualReview is the simulation equivalent of Manual_Review.
   *
   * @param {Object} data  { email, threadLink, reason, severity }
   */
  function writeManualReview(data, traceId) {
    _assertInit();
    var tabName = _simulation ? 'Sim_ManualReview' : 'Manual_Review';
    var sheet   = _getOrCreateSheet(tabName, [
      'manual_review_id', 'timestamp', 'customer_email', 'thread_link',
      'risk_reason', 'severity', 'recommended_owner_action', 'urgency',
      'simulation_mode', 'trace_id'
    ]);
    var urgency = (data.severity === 'critical' || data.severity === 'high') ? 'TODAY' : 'THIS_WEEK';
    var action  = data.severity === 'critical' ? 'Call customer immediately' : 'Review and reply manually';
    sheet.appendRow([
      'MR-' + Date.now(),
      new Date().toISOString(),
      data.email     || '',
      data.threadLink || '',
      data.reason    || '',
      data.severity  || 'medium',
      action,
      urgency,
      _simulation ? 'YES' : 'NO',
      traceId        || ''
    ]);

    // Always log to Ops_Metrics — metrics are real in both modes
    MetricsLogger.log(_spreadsheetId, {
      tenantId:     _tenantId,
      eventType:    'MANUAL_REVIEW_FLAGGED',
      workerScript: 'ExecutionEnv',
      metadata:     { email: data.email, reason: data.reason, severity: data.severity,
                      simulation: _simulation },
      traceId:      traceId || ''
    });

    // In simulation mode, also record in Sim_Actions for the unified side-effect log
    if (_simulation) {
      _simLog('WRITE_MANUAL_REVIEW', {
        tab: tabName, email: data.email, reason: data.reason, severity: data.severity
      }, traceId);
    }
  }

  // ─── Future stubs (Calendar, Notifications) ───────────────────────────────
  // These are not used by Contact Intake. Stubbed here so the interface is
  // complete and worker scripts never call Calendar/notifications directly.

  function createCalendarEvent(eventData, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('CREATE_CALENDAR_EVENT', eventData, traceId);
      return 'SIM-CAL-' + Date.now();
    }
    // Live implementation added in Phase 1b when Calendar integration is enabled
    throw new Error('ExecutionEnv.createCalendarEvent: live implementation not yet deployed');
  }

  function sendNotification(data, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('SEND_NOTIFICATION', data, traceId);
      return;
    }
    // Future: push notification, SMS, or Slack integration
    console.log('ExecutionEnv.sendNotification: not yet implemented in live mode');
  }

  // ─── Simulation output ───────────────────────────────────────────────────

  /**
   * Append a row to Sim_Actions — the single record of all intercepted side effects.
   * Readable summary for reviewing what WOULD have happened in live mode.
   */
  function _simLog(actionType, payload, traceId) {
    var sheet = _getOrCreateSheet('Sim_Actions', [
      'timestamp', 'action_type', 'summary', 'payload_json', 'trace_id'
    ]);
    var summary = _summarize(actionType, payload);
    sheet.appendRow([
      new Date().toISOString(),
      actionType,
      summary,
      JSON.stringify(payload),
      traceId || ''
    ]);
  }

  /**
   * Write full draft body to Sim_Drafts for human review.
   * Sim_Actions contains only a preview; this tab has the complete text.
   */
  function _simDraftFull(toEmail, subject, body, traceId) {
    var sheet = _getOrCreateSheet('Sim_Drafts', [
      'timestamp', 'to_email', 'subject', 'full_body', 'trace_id'
    ]);
    sheet.appendRow([new Date().toISOString(), toEmail, subject, body, traceId || '']);
  }

  function _summarize(actionType, payload) {
    switch (actionType) {
      case 'APPLY_LABEL':      return 'Label "' + payload.labelName + '" on thread ' + payload.threadId;
      case 'CREATE_DRAFT':     return 'Draft to ' + payload.toEmail + ' — ' + payload.subject;
      case 'DRAFT_SUPPRESSED': return 'Draft suppressed (' + payload.reason + ') for ' + payload.toEmail;
      case 'UPSERT_CUSTOMER':  return (payload.email || '') + ' — readiness: ' + (payload.readiness || '?');
      case 'CREATE_CALENDAR_EVENT': return 'Calendar: ' + (payload.title || '') + ' on ' + (payload.date || '');
      case 'SEND_NOTIFICATION': return 'Notify: ' + (payload.type || '') + ' to ' + (payload.recipient || '');
      default:                 return JSON.stringify(payload).slice(0, 80);
    }
  }

  function _getOrCreateSheet(tabName, headers) {
    var ss    = SpreadsheetApp.openById(_spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(headers);
    }
    return sheet;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init:               init,
    isSimulation:       isSimulation,
    applyGmailLabel:    applyGmailLabel,
    createDraft:        createDraft,
    upsertCustomer:     upsertCustomer,
    writeQueueTask:     writeQueueTask,
    writeManualReview:  writeManualReview,
    createCalendarEvent: createCalendarEvent,
    sendNotification:   sendNotification
  };
})();
