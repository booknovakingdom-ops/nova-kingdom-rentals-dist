/**
 * DataProvider — RentalOps Core Library
 *
 * Abstraction layer over the persistence backend. V1 uses Google Sheets.
 * Future V2 will swap this implementation for Supabase/Postgres with no
 * changes to any business logic above this layer.
 *
 * All CRM reads and writes (Customers, Bookings) go through DataProvider.
 * Config reads go through ConfigLoader (config tables are read-only at runtime).
 *
 * Write operations that modify shared rows (upserts) must be called inside
 * Locking.withScriptLock() by the caller.
 */

var DataProvider = (function () {

  // ─── Customers ────────────────────────────────────────────────────────────

  var CUSTOMERS_TAB = 'Customers';
  var BOOKINGS_TAB  = 'Bookings';

  function _ss(spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  function _tab(spreadsheetId, tabName) {
    var sheet = _ss(spreadsheetId).getSheetByName(tabName);
    if (!sheet) throw new Error('DataProvider: tab not found: ' + tabName);
    return sheet;
  }

  function _sheetToObjects(sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0].map(function (h) { return String(h).trim(); });
    return data.slice(1).map(function (row, i) {
      var obj = { _rowIndex: i + 2 };
      headers.forEach(function (h, j) { obj[h] = row[j]; });
      return obj;
    });
  }

  /**
   * Find a customer by email. Returns first match or null.
   * Must be called inside lock if result is used for a write decision.
   */
  function findCustomerByEmail(spreadsheetId, email) {
    var rows = _sheetToObjects(_tab(spreadsheetId, CUSTOMERS_TAB));
    var norm = String(email).toLowerCase().trim();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].email || '').toLowerCase().trim() === norm) return rows[i];
    }
    return null;
  }

  /**
   * Find a customer by customer_id.
   */
  function findCustomerById(spreadsheetId, customerId) {
    var rows = _sheetToObjects(_tab(spreadsheetId, CUSTOMERS_TAB));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].customer_id || '') === customerId) return rows[i];
    }
    return null;
  }

  /**
   * Upsert a customer row.
   * If customer with same email exists: updates last_inbound and other provided fields.
   * If not: appends a new row.
   * Must be called inside Locking.withScriptLock().
   *
   * @param {string} spreadsheetId
   * @param {Object} customerData   Fields matching Customers tab headers
   * @returns {{ customer_id: string, isNew: boolean }}
   */
  function upsertCustomer(spreadsheetId, customerData) {
    var sheet = _tab(spreadsheetId, CUSTOMERS_TAB);
    var existing = findCustomerByEmail(spreadsheetId, customerData.email);

    if (existing) {
      // Update specific fields — never overwrite owner_notes or trust_score downward
      var updates = {
        last_inbound:  customerData.last_inbound  || existing.last_inbound,
        readiness:     customerData.readiness     || existing.readiness,
        phone:         customerData.phone         || existing.phone,
        name:          customerData.name          || existing.name
      };
      _updateRowFields(sheet, existing._rowIndex, updates);
      return { customer_id: existing.customer_id, isNew: false };
    }

    // New customer
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function (h) { return customerData[h] !== undefined ? customerData[h] : ''; });
    sheet.appendRow(row);
    return { customer_id: customerData.customer_id, isNew: true };
  }

  // ─── Bookings ─────────────────────────────────────────────────────────────

  /**
   * Find a booking by booking_id.
   */
  function findBookingById(spreadsheetId, bookingId) {
    var rows = _sheetToObjects(_tab(spreadsheetId, BOOKINGS_TAB));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].booking_id || '') === bookingId) return rows[i];
    }
    return null;
  }

  /**
   * Find all bookings for a customer_id.
   */
  function findBookingsByCustomer(spreadsheetId, customerId) {
    return _sheetToObjects(_tab(spreadsheetId, BOOKINGS_TAB))
      .filter(function (r) { return String(r.customer_id || '') === customerId; });
  }

  /**
   * Append a new booking row.
   * Must be called inside Locking.withScriptLock().
   */
  function insertBooking(spreadsheetId, bookingData) {
    var sheet = _tab(spreadsheetId, BOOKINGS_TAB);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function (h) { return bookingData[h] !== undefined ? bookingData[h] : ''; });
    sheet.appendRow(row);
    return { booking_id: bookingData.booking_id };
  }

  /**
   * Update specific fields on an existing booking row.
   * Must be called inside Locking.withScriptLock() if field update affects
   * concurrency-sensitive values (e.g. deposit_received, status).
   */
  function updateBooking(spreadsheetId, bookingId, fields) {
    var sheet = _tab(spreadsheetId, BOOKINGS_TAB);
    var existing = findBookingById(spreadsheetId, bookingId);
    if (!existing) throw new Error('DataProvider: booking not found: ' + bookingId);
    _updateRowFields(sheet, existing._rowIndex, fields);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _updateRowFields(sheet, rowIndex, fields) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(function (h, colIdx) {
      if (fields.hasOwnProperty(h) && fields[h] !== undefined) {
        sheet.getRange(rowIndex, colIdx + 1).setValue(fields[h]);
      }
    });
  }

  return {
    findCustomerByEmail:    findCustomerByEmail,
    findCustomerById:       findCustomerById,
    upsertCustomer:         upsertCustomer,
    findBookingById:        findBookingById,
    findBookingsByCustomer: findBookingsByCustomer,
    insertBooking:          insertBooking,
    updateBooking:          updateBooking
  };
})();
