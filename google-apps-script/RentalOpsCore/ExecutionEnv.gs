/**
 * ExecutionEnv — RentalOps Core Library
 *
 * Single routing layer for ALL operational side effects.
 * In simulation mode: intercepts every write and logs to Sim_* tabs.
 * In live mode: executes real Gmail, Sheets, Calendar, notification actions.
 *
 * Rule: worker scripts call ExecutionEnv.* for every write.
 * Nothing writes directly to Gmail, live CRM tabs, or Calendar.
 *
 * Allowed real writes during simulation (exactly two):
 *   Ops_IdempotencyLog — Idempotency module (always real)
 *   Ops_Metrics        — MetricsLogger module (always real)
 *
 * All simulation artifacts are stamped with:
 *   trace_id, simulation_run_id, tenant_id, environment = SIMULATION
 *
 * Initialization: call ExecutionEnv.init(spreadsheetId, controls, tenantId)
 * once at the start of each worker run before calling any other method.
 */

var ExecutionEnv = (function () {

  var _simulation      = true;
  var _autoDraftEnabled = false;
  var _spreadsheetId   = '';
  var _tenantId        = '';
  var _simRunId        = '';
  var _initialized     = false;

  // Sim_ tabs that clearSimTabs() is permitted to reset (whitelist — never wildcard)
  var SIM_TABS = ['Sim_Actions', 'Sim_Drafts', 'Sim_AutomationQueue', 'Sim_ManualReview'];

  // ─── Initialization ───────────────────────────────────────────────────────

  /**
   * Must be called once at the start of every worker run.
   * Generates a unique simulation_run_id when simulation_mode = true.
   */
  function init(spreadsheetId, controls, tenantId) {
    _spreadsheetId    = spreadsheetId;
    _tenantId         = tenantId || '';
    _simulation       = !!controls.simulation_mode;
    _autoDraftEnabled = !!controls.auto_draft_enabled;
    _simRunId         = _simulation ? ('SIM-RUN-' + Date.now() + '-' + _rand4()) : '';
    _initialized      = true;
  }

  function isSimulation() {
    _assertInit();
    return _simulation;
  }

  function getSimRunId() {
    _assertInit();
    return _simRunId;
  }

  /**
   * Returns simulation context object for merging into MetricsLogger metadata.
   * In live mode returns empty object (no stamps needed on real metrics).
   * Usage: MetricsLogger.log(id, { ..., metadata: ExecutionEnv.stampMetadata({...}) })
   */
  function stampMetadata(existingMetadata) {
    _assertInit();
    var base = existingMetadata || {};
    if (!_simulation) return base;
    return Object.assign({}, base, {
      simulation_run_id: _simRunId,
      tenant_id:         _tenantId,
      environment:       'SIMULATION'
    });
  }

  function _assertInit() {
    if (!_initialized) throw new Error('ExecutionEnv: call init() before using any side-effect methods');
  }

  // ─── Gmail ────────────────────────────────────────────────────────────────

  /**
   * Apply a Gmail label to a thread.
   * In simulation: logs to Sim_Actions, does not touch Gmail.
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
   * Simulation: logs to Sim_Actions + full body to Sim_Drafts.
   * Live + auto_draft_enabled=false: suppresses, logs to Sim_Actions.
   * Live + auto_draft_enabled=true: creates real Gmail draft.
   *
   * @returns {string}  Draft ID or '' if suppressed.
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
   * Simulation: logs to Sim_Actions only.
   * Live: re-reads inside script lock then upserts via DataProvider.
   *
   * @returns {{ customer_id: string, isNew: boolean }}
   */
  function upsertCustomer(data, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('UPSERT_CUSTOMER', {
        email:     data.email,
        name:      data.name,
        phone:     data.phone    || '',
        readiness: data.readiness,
        tenantId:  data.tenant_id
      }, traceId);
      return { customer_id: data.customer_id, isNew: false };
    }
    return Locking.withScriptLock(function () {
      return DataProvider.upsertCustomer(_spreadsheetId, data);
    });
  }

  /**
   * Write a queue task row.
   * Simulation: writes to Sim_AutomationQueue with simulation stamps.
   * Live: writes to Automation Queue.
   */
  function writeQueueTask(data, traceId) {
    _assertInit();
    var tabName = _simulation ? 'Sim_AutomationQueue' : 'Automation Queue';
    var headers = [
      'timestamp', 'task_id', 'message_id', 'customer_id', 'email',
      'intent', 'readiness', 'decision', 'mode', 'confidence',
      'event_date', 'rental_item', 'status', 'trace_id'
    ];
    if (_simulation) headers = headers.concat(['simulation_run_id', 'tenant_id', 'environment']);
    var sheet = _getOrCreateSheet(tabName, headers);
    var row = [
      new Date().toISOString(),
      data.task_id     || '',
      data.message_id  || '',
      data.customer_id || '',
      data.email       || '',
      data.intent      || '',
      data.readiness   || '',
      data.decision    || '',
      data.mode        || '',
      data.confidence  !== undefined ? data.confidence : '',
      data.event_date  || '',
      data.rental_item || '',
      data.status      || 'PENDING',
      traceId          || ''
    ];
    if (_simulation) row = row.concat([_simRunId, _tenantId, 'SIMULATION']);
    sheet.appendRow(row);
  }

  /**
   * Write a manual review row.
   * Simulation: writes to Sim_ManualReview with simulation stamps.
   * Live: writes to real Manual_Review.
   * Both modes: logs MANUAL_REVIEW_FLAGGED to Ops_Metrics with simulation stamps.
   */
  function writeManualReview(data, traceId) {
    _assertInit();
    var tabName = _simulation ? 'Sim_ManualReview' : 'Manual_Review';
    var headers = [
      'manual_review_id', 'timestamp', 'customer_email', 'thread_link',
      'risk_reason', 'severity', 'recommended_owner_action', 'urgency', 'trace_id'
    ];
    if (_simulation) headers = headers.concat(['simulation_run_id', 'tenant_id', 'environment']);
    var sheet   = _getOrCreateSheet(tabName, headers);
    var urgency = (data.severity === 'critical' || data.severity === 'high') ? 'TODAY' : 'THIS_WEEK';
    var action  = data.severity === 'critical' ? 'Call customer immediately' : 'Review and reply manually';
    var row = [
      'MR-' + Date.now(),
      new Date().toISOString(),
      data.email      || '',
      data.threadLink || '',
      data.reason     || '',
      data.severity   || 'medium',
      action,
      urgency,
      traceId         || ''
    ];
    if (_simulation) row = row.concat([_simRunId, _tenantId, 'SIMULATION']);
    sheet.appendRow(row);

    // Always log to Ops_Metrics — real in both modes, includes simulation stamps
    MetricsLogger.log(_spreadsheetId, {
      tenantId:     _tenantId,
      eventType:    'MANUAL_REVIEW_FLAGGED',
      workerScript: 'ExecutionEnv',
      metadata:     stampMetadata({ email: data.email, reason: data.reason, severity: data.severity }),
      traceId:      traceId || ''
    });

    // In simulation, also record in Sim_Actions for the unified side-effect log
    if (_simulation) {
      _simLog('WRITE_MANUAL_REVIEW', {
        tab: tabName, email: data.email, reason: data.reason, severity: data.severity
      }, traceId);
    }
  }

  // ─── Future stubs (Calendar, Notifications) ───────────────────────────────

  function createCalendarEvent(eventData, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('CREATE_CALENDAR_EVENT', eventData, traceId);
      return 'SIM-CAL-' + Date.now();
    }
    throw new Error('ExecutionEnv.createCalendarEvent: live implementation not yet deployed');
  }

  function sendNotification(data, traceId) {
    _assertInit();
    if (_simulation) {
      _simLog('SEND_NOTIFICATION', data, traceId);
      return;
    }
    console.log('ExecutionEnv.sendNotification: not yet implemented in live mode');
  }

  // ─── Simulation reset ─────────────────────────────────────────────────────

  /**
   * Purge all data rows from Sim_* tabs, preserving header rows.
   * Whitelist-based — only clears the four tabs listed in SIM_TABS.
   * Never touches any real operational tab.
   * Safe to call between test runs.
   *
   * @returns {Array<string>}  Names of tabs that were cleared.
   */
  function clearSimTabs() {
    _assertInit();
    var ss      = SpreadsheetApp.openById(_spreadsheetId);
    var cleared = [];
    SIM_TABS.forEach(function (tabName) {
      var sheet = ss.getSheetByName(tabName);
      if (sheet && sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
        cleared.push(tabName);
      }
    });
    console.log('ExecutionEnv.clearSimTabs: cleared [' + cleared.join(', ') + ']');
    // Log the purge to Ops_Metrics so there's always a record
    MetricsLogger.log(_spreadsheetId, {
      tenantId:     _tenantId,
      eventType:    'SIMULATION_RUN',
      workerScript: 'ExecutionEnv',
      metadata:     { action: 'CLEAR_SIM_TABS', tabsCleared: cleared },
      traceId:      ''
    });
    return cleared;
  }

  // ─── Simulation output helpers ────────────────────────────────────────────

  function _simLog(actionType, payload, traceId) {
    var sheet = _getOrCreateSheet('Sim_Actions', [
      'timestamp', 'action_type', 'summary', 'payload_json',
      'trace_id', 'simulation_run_id', 'tenant_id', 'environment'
    ]);
    sheet.appendRow([
      new Date().toISOString(),
      actionType,
      _summarize(actionType, payload),
      JSON.stringify(payload),
      traceId   || '',
      _simRunId,
      _tenantId,
      'SIMULATION'
    ]);
  }

  function _simDraftFull(toEmail, subject, body, traceId) {
    var sheet = _getOrCreateSheet('Sim_Drafts', [
      'timestamp', 'to_email', 'subject', 'full_body',
      'trace_id', 'simulation_run_id', 'tenant_id', 'environment'
    ]);
    sheet.appendRow([
      new Date().toISOString(), toEmail, subject, body,
      traceId || '', _simRunId, _tenantId, 'SIMULATION'
    ]);
  }

  function _summarize(actionType, payload) {
    switch (actionType) {
      case 'APPLY_LABEL':           return 'Label "' + payload.labelName + '" → thread ' + payload.threadId;
      case 'CREATE_DRAFT':          return 'Draft → ' + payload.toEmail + ' | ' + payload.subject;
      case 'DRAFT_SUPPRESSED':      return 'Draft suppressed (' + payload.reason + ') for ' + payload.toEmail;
      case 'UPSERT_CUSTOMER':       return payload.email + ' | readiness: ' + (payload.readiness || '?');
      case 'WRITE_MANUAL_REVIEW':   return payload.email + ' | ' + payload.severity + ' | ' + (payload.reason || '').slice(0, 60);
      case 'CREATE_CALENDAR_EVENT': return 'Calendar: ' + (payload.title || '') + ' on ' + (payload.date || '');
      case 'SEND_NOTIFICATION':     return 'Notify: ' + (payload.type || '') + ' → ' + (payload.recipient || '');
      default:                      return JSON.stringify(payload).slice(0, 80);
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

  function _rand4() {
    return Math.floor(Math.random() * 9000 + 1000).toString();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init:               init,
    isSimulation:       isSimulation,
    getSimRunId:        getSimRunId,
    stampMetadata:      stampMetadata,
    applyGmailLabel:    applyGmailLabel,
    createDraft:        createDraft,
    upsertCustomer:     upsertCustomer,
    writeQueueTask:     writeQueueTask,
    writeManualReview:  writeManualReview,
    createCalendarEvent: createCalendarEvent,
    sendNotification:   sendNotification,
    clearSimTabs:       clearSimTabs
  };
})();
