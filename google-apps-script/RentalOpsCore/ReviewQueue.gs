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
 *   tenant_id | queue_id | created_at | message_id |
 *   source_channel | customer_name | customer_email | customer_phone |
 *   customer_social_id | event_date | event_type | rental_item |
 *   event_address | missing_fields | reason | severity |
 *   recommended_owner_action | thread_link | status | trace_id
 *
 * Simulation rows append: simulation_run_id | environment
 *
 * Backward-compat: existing sheets with the old schema get new columns
 * appended automatically. Row construction is field-name mapped, not
 * positional, so old data rows are never corrupted.
 *
 * Usage: ReviewQueue.enqueue(spreadsheetId, data, tenantId, simulation, simRunId)
 */

var ReviewQueue = (function () {

  var HEADERS = [
    'tenant_id', 'queue_id', 'created_at', 'message_id',
    'source_channel', 'customer_name', 'customer_email', 'customer_phone',
    'customer_social_id', 'event_date', 'event_type', 'rental_item',
    'event_address', 'missing_fields', 'reason', 'severity',
    'recommended_owner_action', 'thread_link', 'status', 'trace_id'
  ];

  /**
   * Append one review record.
   * @param {string}  spreadsheetId
   * @param {Object}  data  {
   *   message_id, source_channel, customer_name, customer_email, customer_phone,
   *   customer_social_id, event_date, event_type, rental_item, event_address,
   *   missing_fields, reason, severity, recommended_owner_action,
   *   thread_link, status, trace_id
   *   [email] — backward-compat alias for customer_email
   * }
   * @param {string}  tenantId
   * @param {boolean} simulation
   * @param {string}  simRunId  Ignored when simulation=false
   * @returns {string}  Generated queue_id
   */
  function enqueue(spreadsheetId, data, tenantId, simulation, simRunId) {
    var tabName = simulation ? 'Sim_ReviewQueue' : 'Ops_ReviewQueue';
    var allHeaders = simulation
      ? HEADERS.concat(['simulation_run_id', 'environment'])
      : HEADERS;
    var sheet   = _getOrCreateSheet(spreadsheetId, tabName, allHeaders);
    var queueId = 'RQ-' + Date.now() + '-' + _rand4();

    var flat = {
      tenant_id:                tenantId                               || '',
      queue_id:                 queueId,
      created_at:               new Date().toISOString(),
      message_id:               data.message_id                        || '',
      source_channel:           data.source_channel                    || '',
      customer_name:            data.customer_name                     || '',
      customer_email:           data.customer_email || data.email      || '',
      customer_phone:           data.customer_phone                    || '',
      customer_social_id:       data.customer_social_id                || '',
      event_date:               data.event_date                        || '',
      event_type:               data.event_type                        || '',
      rental_item:              data.rental_item                       || '',
      event_address:            data.event_address                     || '',
      missing_fields:           data.missing_fields                    || '',
      reason:                   data.reason                            || '',
      severity:                 data.severity                          || 'medium',
      recommended_owner_action: data.recommended_owner_action          || '',
      thread_link:              data.thread_link || data.threadLink    || '',
      status:                   data.status                            || 'OPEN',
      trace_id:                 data.trace_id                          || ''
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
