/**
 * InquiryState — RentalOps Core Library
 *
 * Tracks per-thread inquiry stage so the system knows whether to send a
 * first-response details-check draft or a shorter follow-up that asks only
 * remaining missing fields.
 *
 * Live tab:       Ops_InquiryState
 * Simulation tab: Sim_InquiryState
 *
 * Schema (live):
 *   thread_id | tenant_id | customer_email | inquiry_stage |
 *   first_response_draft_created | first_response_draft_created_at |
 *   missing_fields_last_asked | updated_at | trace_id
 *
 * Simulation rows append: simulation_run_id | environment
 *
 * inquiry_stage values (use InquiryState.STAGES constants):
 *   NEW_INQUIRY            — no draft created yet for this thread
 *   AWAITING_MISSING_INFO  — first-response sent, still waiting on some fields
 *   READY_FOR_OWNER_REVIEW — all required fields present, ready to quote
 *   QUOTE_DRAFT_READY      — quote draft has been created
 */

var InquiryState = (function () {

  var LIVE_TAB = 'Ops_InquiryState';
  var SIM_TAB  = 'Sim_InquiryState';

  var HEADERS = [
    'thread_id', 'tenant_id', 'customer_email', 'inquiry_stage',
    'first_response_draft_created', 'first_response_draft_created_at',
    'missing_fields_last_asked', 'updated_at', 'trace_id'
  ];

  var STAGES = {
    NEW_INQUIRY:            'NEW_INQUIRY',
    AWAITING_MISSING_INFO:  'AWAITING_MISSING_INFO',
    READY_FOR_OWNER_REVIEW: 'READY_FOR_OWNER_REVIEW',
    QUOTE_DRAFT_READY:      'QUOTE_DRAFT_READY'
  };

  function _tabName(simulation) {
    return simulation ? SIM_TAB : LIVE_TAB;
  }

  function _getOrCreateSheet(ss, simulation) {
    var name    = _tabName(simulation);
    var headers = simulation ? HEADERS.concat(['simulation_run_id', 'environment']) : HEADERS;
    var sheet   = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
    }
    return sheet;
  }

  /**
   * Return the stored inquiry state for a thread, or null if none exists.
   * @param {string}  spreadsheetId
   * @param {string}  threadId
   * @param {boolean} simulation
   * @returns {Object|null}
   */
  function get(spreadsheetId, threadId, simulation) {
    var ss    = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(_tabName(simulation));
    if (!sheet) return null;
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return null;
    var hdrs  = data[0].map(function (h) { return String(h).trim(); });
    var tidx  = hdrs.indexOf('thread_id');
    if (tidx === -1) return null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][tidx]).trim() === threadId) {
        var obj = {};
        hdrs.forEach(function (h, j) { obj[h] = data[i][j]; });
        return obj;
      }
    }
    return null;
  }

  /**
   * Upsert (update-in-place or append) the inquiry state for a thread.
   * @param {string}  spreadsheetId
   * @param {string}  threadId
   * @param {Object}  data  Fields to write (any subset of HEADERS)
   * @param {boolean} simulation
   * @param {string}  simRunId
   */
  function upsert(spreadsheetId, threadId, data, simulation, simRunId) {
    var ss      = SpreadsheetApp.openById(spreadsheetId);
    var sheet   = _getOrCreateSheet(ss, simulation);
    var raw     = sheet.getDataRange().getValues();
    var hdrs    = raw[0].map(function (h) { return String(h).trim(); });
    var tidx    = hdrs.indexOf('thread_id');
    var now     = new Date().toISOString();

    var row = hdrs.map(function (h) {
      if (h === 'thread_id')        return threadId;
      if (h === 'updated_at')       return now;
      if (h === 'simulation_run_id') return simRunId || '';
      if (h === 'environment')      return simulation ? 'SIMULATION' : 'LIVE';
      return data[h] !== undefined ? data[h] : '';
    });

    // Find existing row and update in-place
    for (var i = 1; i < raw.length; i++) {
      if (String(raw[i][tidx]).trim() === threadId) {
        sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return;
      }
    }
    // Not found — append
    sheet.appendRow(row);
  }

  return {
    get:    get,
    upsert: upsert,
    STAGES: STAGES
  };

})();
