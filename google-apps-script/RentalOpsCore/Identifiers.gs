/**
 * Identifiers — RentalOps Core Library
 *
 * Generates all system IDs. Counter-based IDs (booking IDs) are generated
 * inside a LockService lock to prevent race conditions.
 *
 * This replaces the unprotected generateBookingId_() in nk-quote-intake.js
 * which has a known race condition (reads counter, scans tabs, writes counter
 * with no lock — concurrent runs can assign duplicate IDs).
 */

var Identifiers = (function () {

  /**
   * Generates the next booking ID in format {PREFIX}-{YYYY}-{NNN}.
   * Reads and increments the counter in System tab B2 inside a script lock.
   *
   * @param {string} spreadsheetId
   * @param {string} prefix  e.g. 'NK'
   * @returns {string}  e.g. 'NK-2026-016'
   */
  function nextBookingId(spreadsheetId, prefix) {
    return Locking.withScriptLock(function () {
      var ss = SpreadsheetApp.openById(spreadsheetId);
      var systemSheet = ss.getSheetByName('System');
      if (!systemSheet) throw new Error('Identifiers: System tab not found');

      var counterCell = systemSheet.getRange('B2');
      var raw = String(counterCell.getValue()); // e.g. "NK-2026:015"
      var year = new Date().getFullYear();
      var currentNum = 0;

      // Parse existing counter — supports "PREFIX-YYYY:NNN" format
      var match = raw.match(/(\d{4}):(\d+)/);
      if (match && parseInt(match[1]) === year) {
        currentNum = parseInt(match[2]);
      }
      // If counter is from a different year, reset to 0
      var next = currentNum + 1;
      var nextStr = prefix + '-' + year + '-' + _pad3(next);
      counterCell.setValue(prefix + '-' + year + ':' + _pad3(next));
      return nextStr;
    });
  }

  /**
   * Generates a trace ID for correlating log entries across a single run.
   * Format: TRC-{timestamp_ms}-{random_4}
   */
  function traceId() {
    return 'TRC-' + Date.now() + '-' + _rand4();
  }

  /**
   * Generates a metric row ID.
   * Format: MET-{timestamp_ms}-{random_4}
   */
  function metricId() {
    return 'MET-' + Date.now() + '-' + _rand4();
  }

  /**
   * Generates a booking lifecycle log row ID.
   * Format: BLL-{timestamp_ms}-{random_4}
   */
  function lifecycleLogId() {
    return 'BLL-' + Date.now() + '-' + _rand4();
  }

  function _pad3(n) {
    return ('00' + n).slice(-3);
  }

  function _rand4() {
    return Math.floor(Math.random() * 9000 + 1000).toString();
  }

  return {
    nextBookingId:    nextBookingId,
    traceId:          traceId,
    metricId:         metricId,
    lifecycleLogId:   lifecycleLogId
  };
})();
