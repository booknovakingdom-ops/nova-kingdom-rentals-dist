/**
 * DraftQueue — RentalOps Core Library
 *
 * Persistent queue tracking every Gmail draft created by the system.
 * Supports multi-tenant operation: every row is stamped with tenant_id.
 *
 * Live tab:       Ops_DraftQueue
 * Simulation tab: Sim_DraftQueue
 *
 * Schema (live):
 *   tenant_id | queue_id | created_at | message_id | customer_email |
 *   subject | gmail_draft_id | intent | mode | status | trace_id
 *
 * Simulation rows append: simulation_run_id | environment
 *
 * Status values:
 *   PENDING_REVIEW — draft created, awaiting owner send/discard decision
 *   SUPPRESSED     — draft not created (auto_draft_enabled=false or error)
 *
 * Usage: DraftQueue.enqueue(spreadsheetId, data, tenantId, simulation, simRunId)
 */

var DraftQueue = (function () {

  var HEADERS = [
    'tenant_id', 'queue_id', 'created_at', 'message_id',
    'customer_email', 'subject', 'gmail_draft_id',
    'intent', 'mode', 'status', 'trace_id'
  ];

  /**
   * Append one draft record.
   * @param {string}  spreadsheetId
   * @param {Object}  data  { message_id, customer_email, subject, gmail_draft_id, intent, mode, status, trace_id }
   * @param {string}  tenantId
   * @param {boolean} simulation
   * @param {string}  simRunId  Ignored when simulation=false
   * @returns {string}  Generated queue_id
   */
  function enqueue(spreadsheetId, data, tenantId, simulation, simRunId) {
    var tabName = simulation ? 'Sim_DraftQueue' : 'Ops_DraftQueue';
    var headers = simulation ? HEADERS.concat(['simulation_run_id', 'environment']) : HEADERS;
    var sheet   = _getOrCreateSheet(spreadsheetId, tabName, headers);
    var queueId = 'DQ-' + Date.now() + '-' + _rand4();
    var row = [
      tenantId               || '',
      queueId,
      new Date().toISOString(),
      data.message_id        || '',
      data.customer_email    || '',
      data.subject           || '',
      data.gmail_draft_id    || '',
      data.intent            || '',
      data.mode              || '',
      data.status            || 'PENDING_REVIEW',
      data.trace_id          || ''
    ];
    if (simulation) row = row.concat([simRunId || '', 'SIMULATION']);
    sheet.appendRow(row);
    return queueId;
  }

  function _getOrCreateSheet(spreadsheetId, tabName, headers) {
    var ss    = SpreadsheetApp.openById(spreadsheetId);
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

  return { enqueue: enqueue };

})();
