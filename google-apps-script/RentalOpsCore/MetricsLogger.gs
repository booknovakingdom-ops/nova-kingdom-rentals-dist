/**
 * MetricsLogger — RentalOps Core Library
 *
 * Append-only event logger. Writes to Ops_Metrics tab.
 * Fire-and-forget — logging failures should not crash the main processing flow.
 * Wrap in try/catch at call site if needed.
 */

var MetricsLogger = (function () {

  var TAB_NAME = 'Ops_Metrics';

  function _getSheet(spreadsheetId) {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(TAB_NAME);
    if (!sheet) throw new Error('MetricsLogger: tab not found: ' + TAB_NAME);
    return sheet;
  }

  /**
   * Log a single metrics event.
   *
   * @param {string} spreadsheetId
   * @param {Object} event
   * @param {string} event.tenantId
   * @param {string} event.eventType      One of the registered event_type values
   * @param {string} event.workerScript
   * @param {string} [event.bookingId]
   * @param {string} [event.customerId]
   * @param {number} [event.value]
   * @param {string} [event.unit]
   * @param {Object} [event.metadata]     Will be JSON-stringified
   * @param {string} [event.traceId]
   */
  function log(spreadsheetId, event) {
    try {
      var sheet = _getSheet(spreadsheetId);
      var metaStr = event.metadata ? JSON.stringify(event.metadata) : '';
      sheet.appendRow([
        Identifiers.metricId(),
        event.tenantId      || '',
        event.eventType     || '',
        event.bookingId     || '',
        event.customerId    || '',
        event.workerScript  || '',
        event.value         !== undefined ? event.value : '',
        event.unit          || '',
        metaStr,
        event.traceId       || '',
        new Date().toISOString()
      ]);
    } catch (e) {
      // Logging failure must never crash the main flow
      console.error('MetricsLogger.log failed: ' + e.message);
    }
  }

  /**
   * Convenience: log an error event.
   */
  function logError(spreadsheetId, tenantId, workerScript, errorMessage, traceId) {
    log(spreadsheetId, {
      tenantId:     tenantId,
      eventType:    'ERROR',
      workerScript: workerScript,
      metadata:     { error: errorMessage },
      traceId:      traceId || ''
    });
  }

  return {
    log:      log,
    logError: logError
  };
})();
