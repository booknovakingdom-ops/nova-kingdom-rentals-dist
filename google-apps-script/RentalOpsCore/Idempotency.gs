/**
 * Idempotency — RentalOps Core Library
 *
 * Prevents duplicate processing of the same email/event.
 * All reads and writes are inside a Locking.withScriptLock() call.
 *
 * Protocol:
 *   1. Call check(key) — returns existing record or null
 *   2. If null: call markProcessing(key, ...) immediately (inside same lock)
 *   3. Do work
 *   4. Call markCompleted(key, ...) or markFailed(key, ...)
 *
 * Abandoned lock detection: PROCESSING rows older than STALE_THRESHOLD_MS
 * are treated as abandoned and will be reprocessed.
 */

var Idempotency = (function () {

  var TAB_NAME = 'Ops_IdempotencyLog';
  var STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

  var COL = {
    KEY:          0,
    TENANT_ID:    1,
    STATUS:       2,
    WORKER:       3,
    STARTED_AT:   4,
    COMPLETED_AT: 5,
    RESULT_TYPE:  6,
    BOOKING_ID:   7,
    CUSTOMER_ID:  8,
    DRAFT_ID:     9,
    SKIP_REASON:  10,
    ERROR:        11,
    TRACE_ID:     12
  };

  function _getSheet(spreadsheetId) {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(TAB_NAME);
    if (!sheet) throw new Error('Idempotency: tab not found: ' + TAB_NAME);
    return sheet;
  }

  function _findRow(sheet, key) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.KEY]) === key) return { rowIndex: i + 1, data: data[i] };
    }
    return null;
  }

  function _now() { return new Date().toISOString(); }

  /**
   * Check if a key has already been processed.
   * Returns null if key is new or abandoned (stale PROCESSING).
   * Returns the existing record if COMPLETED, FAILED, or SKIPPED.
   * Must be called INSIDE Locking.withScriptLock().
   */
  function check(spreadsheetId, key) {
    var sheet = _getSheet(spreadsheetId);
    var found = _findRow(sheet, key);
    if (!found) return null;
    var row = found.data;
    var status = String(row[COL.STATUS]);
    if (status === 'PROCESSING') {
      var startedAt = new Date(row[COL.STARTED_AT]);
      var age = Date.now() - startedAt.getTime();
      if (age > STALE_THRESHOLD_MS) {
        // Abandoned — treat as new, will be overwritten by markProcessing
        return null;
      }
      // Active PROCESSING — another run owns this key
      return { status: 'PROCESSING', key: key };
    }
    return { status: status, key: key, resultType: row[COL.RESULT_TYPE], bookingId: row[COL.BOOKING_ID] };
  }

  /**
   * Write PROCESSING status. Must be called INSIDE Locking.withScriptLock()
   * immediately after check() returns null.
   */
  function markProcessing(spreadsheetId, key, tenantId, workerScript, traceId) {
    var sheet = _getSheet(spreadsheetId);
    var found = _findRow(sheet, key);
    var row = [key, tenantId, 'PROCESSING', workerScript, _now(), '', '', '', '', '', '', '', traceId || ''];
    if (found) {
      sheet.getRange(found.rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  }

  /**
   * Update an existing PROCESSING row to COMPLETED.
   * Called after successful processing. Can be outside the initial lock.
   */
  function markCompleted(spreadsheetId, key, resultType, opts) {
    opts = opts || {};
    _updateRow(spreadsheetId, key, {
      status:      'COMPLETED',
      completedAt: _now(),
      resultType:  resultType,
      bookingId:   opts.bookingId   || '',
      customerId:  opts.customerId  || '',
      draftId:     opts.draftId     || '',
      skipReason:  '',
      error:       '',
      traceId:     opts.traceId     || ''
    });
  }

  /**
   * Update an existing PROCESSING row to FAILED.
   */
  function markFailed(spreadsheetId, key, errorMessage, opts) {
    opts = opts || {};
    _updateRow(spreadsheetId, key, {
      status:      'FAILED',
      completedAt: _now(),
      resultType:  'ERROR',
      bookingId:   opts.bookingId || '',
      customerId:  '',
      draftId:     '',
      skipReason:  '',
      error:       errorMessage,
      traceId:     opts.traceId  || ''
    });
  }

  /**
   * Mark as SKIPPED (intentional no-op: blocklist, autoreply, etc).
   */
  function markSkipped(spreadsheetId, key, tenantId, workerScript, skipReason, traceId) {
    var sheet = _getSheet(spreadsheetId);
    var found = _findRow(sheet, key);
    var row = [key, tenantId, 'SKIPPED', workerScript, _now(), _now(), 'NO_DRAFT', '', '', '', skipReason, '', traceId || ''];
    if (found) {
      sheet.getRange(found.rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  }

  function _updateRow(spreadsheetId, key, fields) {
    var sheet = _getSheet(spreadsheetId);
    var found = _findRow(sheet, key);
    if (!found) {
      throw new Error('Idempotency: cannot update — key not found: ' + key);
    }
    var r = found.rowIndex;
    sheet.getRange(r, COL.STATUS + 1).setValue(fields.status);
    sheet.getRange(r, COL.COMPLETED_AT + 1).setValue(fields.completedAt);
    sheet.getRange(r, COL.RESULT_TYPE + 1).setValue(fields.resultType || '');
    sheet.getRange(r, COL.BOOKING_ID + 1).setValue(fields.bookingId  || '');
    sheet.getRange(r, COL.CUSTOMER_ID + 1).setValue(fields.customerId || '');
    sheet.getRange(r, COL.DRAFT_ID + 1).setValue(fields.draftId     || '');
    sheet.getRange(r, COL.SKIP_REASON + 1).setValue(fields.skipReason || '');
    sheet.getRange(r, COL.ERROR + 1).setValue(fields.error        || '');
    if (fields.traceId) sheet.getRange(r, COL.TRACE_ID + 1).setValue(fields.traceId);
  }

  return {
    check:           check,
    markProcessing:  markProcessing,
    markCompleted:   markCompleted,
    markFailed:      markFailed,
    markSkipped:     markSkipped
  };
})();
