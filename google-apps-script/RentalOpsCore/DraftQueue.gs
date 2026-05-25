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
 *   subject | gmail_draft_id | intent | mode | status | trace_id |
 *   source_channel | source_message_id | source_thread_id |
 *   customer_social_id | customer_handle
 *
 * Simulation rows append: simulation_run_id | environment
 *
 * Status values:
 *   PENDING_REVIEW — draft created, awaiting owner send/discard decision
 *   SUPPRESSED     — draft not created (auto_draft_enabled=false or error)
 *
 * Backward-compat: existing sheets with the old schema get new columns
 * appended automatically. Row construction is field-name mapped, not
 * positional, so old data rows are never corrupted.
 *
 * Usage: DraftQueue.enqueue(spreadsheetId, data, tenantId, simulation, simRunId)
 */

var DraftQueue = (function () {

  var HEADERS = [
    'tenant_id', 'queue_id', 'created_at', 'message_id',
    'customer_email', 'subject', 'gmail_draft_id',
    'intent', 'mode', 'status', 'trace_id',
    'source_channel', 'source_message_id', 'source_thread_id',
    'customer_social_id', 'customer_handle'
  ];

  /**
   * Append one draft record.
   * @param {string}  spreadsheetId
   * @param {Object}  data  {
   *   message_id, customer_email, subject, gmail_draft_id, intent, mode,
   *   status, trace_id, source_channel, source_message_id, source_thread_id,
   *   customer_social_id, customer_handle
   * }
   * @param {string}  tenantId
   * @param {boolean} simulation
   * @param {string}  simRunId  Ignored when simulation=false
   * @returns {string}  Generated queue_id
   */
  function enqueue(spreadsheetId, data, tenantId, simulation, simRunId) {
    var tabName = simulation ? 'Sim_DraftQueue' : 'Ops_DraftQueue';
    var allHeaders = simulation
      ? HEADERS.concat(['simulation_run_id', 'environment'])
      : HEADERS;
    var sheet   = _getOrCreateSheet(spreadsheetId, tabName, allHeaders);
    var queueId = 'DQ-' + Date.now() + '-' + _rand4();

    var flat = {
      tenant_id:          tenantId                    || '',
      queue_id:           queueId,
      created_at:         new Date().toISOString(),
      message_id:         data.message_id             || '',
      customer_email:     data.customer_email         || '',
      subject:            data.subject                || '',
      gmail_draft_id:     data.gmail_draft_id         || '',
      intent:             data.intent                 || '',
      mode:               data.mode                   || '',
      status:             data.status                 || 'PENDING_REVIEW',
      trace_id:           data.trace_id               || '',
      source_channel:     data.source_channel         || '',
      source_message_id:  data.source_message_id      || '',
      source_thread_id:   data.source_thread_id       || '',
      customer_social_id: data.customer_social_id     || '',
      customer_handle:    data.customer_handle        || ''
    };
    if (simulation) {
      flat.simulation_run_id = simRunId || '';
      flat.environment       = 'SIMULATION';
    }

    sheet.appendRow(_buildRow(sheet, flat));
    return queueId;
  }

  /**
   * Get or create a sheet, appending any missing columns to existing sheets.
   * New columns are added at the end so existing data rows are never shifted.
   */
  function _getOrCreateSheet(spreadsheetId, tabName, headers) {
    var ss    = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(headers);
      return sheet;
    }
    // Extend existing sheet with any missing columns
    var lastCol      = Math.max(sheet.getLastColumn(), 1);
    var existingHdrs = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var existingSet  = {};
    existingHdrs.forEach(function (h) { if (h) existingSet[String(h).trim()] = true; });
    var toAdd = headers.filter(function (h) { return !existingSet[h]; });
    if (toAdd.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, toAdd.length).setValues([toAdd]);
    }
    return sheet;
  }

  /**
   * Build a row array by reading the sheet's actual header row and mapping
   * field names from the flat data object. Unknown headers get empty string.
   */
  function _buildRow(sheet, flat) {
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return headers.map(function (h) {
      var key = String(h).trim();
      return flat.hasOwnProperty(key) ? (flat[key] !== undefined ? flat[key] : '') : '';
    });
  }

  function _rand4() {
    return Math.floor(Math.random() * 9000 + 1000).toString();
  }

  return { enqueue: enqueue };

})();
