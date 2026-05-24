/**
 * ReviewQueue — RentalOps Core Library
 *
 * Persistent queue for messages requiring human review before a reply is sent.
 * Designed for multi-tenant operation: every row is stamped with tenant_id.
 *
 * Live tab:       Ops_ReviewQueue
 * Simulation tab: Sim_ReviewQueue
 *
 * Schema (live):
 *   tenant_id | queue_id | created_at | message_id | customer_email |
 *   customer_name | reason | severity | thread_link | status | trace_id
 *
 * Simulation rows append: simulation_run_id | environment
 *
 * Usage: ReviewQueue.enqueue(spreadsheetId, data, tenantId, simulation, simRunId)
 */

var ReviewQueue = (function () {

  var HEADERS = [
    'tenant_id', 'queue_id', 'created_at', 'message_id',
    'customer_email', 'customer_name', 'reason', 'severity',
    'thread_link', 'status', 'trace_id'
  ];

  /**
   * Append one review record.
   * @param {string}  spreadsheetId
   * @param {Object}  data  { message_id, email, customer_name, reason, severity, thread_link, status, trace_id }
   * @param {string}  tenantId
   * @param {boolean} simulation
   * @param {string}  simRunId  Ignored when simulation=false
   * @returns {string}  Generated queue_id
   */
  function enqueue(spreadsheetId, data, tenantId, simulation, simRunId) {
    var tabName = simulation ? 'Sim_ReviewQueue' : 'Ops_ReviewQueue';
    var headers = simulation ? HEADERS.concat(['simulation_run_id', 'environment']) : HEADERS;
    var sheet   = _getOrCreateSheet(spreadsheetId, tabName, headers);
    var queueId = 'RQ-' + Date.now() + '-' + _rand4();
    var row = [
      tenantId               || '',
      queueId,
      new Date().toISOString(),
      data.message_id        || '',
      data.email             || '',
      data.customer_name     || '',
      data.reason            || '',
      data.severity          || 'medium',
      data.thread_link       || '',
      data.status            || 'OPEN',
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
