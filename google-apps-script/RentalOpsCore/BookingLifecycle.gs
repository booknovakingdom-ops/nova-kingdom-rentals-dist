/**
 * BookingLifecycle — RentalOps Core Library
 *
 * Formal state machine for booking and customer lifecycle transitions.
 * All state changes go through this module and are logged to Ops_BookingLifecycleLog.
 *
 * Valid states and transitions are defined in 11_booking_lifecycle_log.json.
 */

var BookingLifecycle = (function () {

  var TAB_NAME = 'Ops_BookingLifecycleLog';

  var VALID_TRANSITIONS = {
    'new':         ['engaged', 'dormant', 'dnc'],
    'engaged':     ['quoted', 'dormant', 'dnc'],
    'quoted':      ['negotiating', 'booked', 'dormant', 'dnc'],
    'negotiating': ['booked', 'dormant', 'dnc'],
    'booked':      ['paid', 'cancelled'],
    'paid':        ['completed', 'cancelled'],
    'completed':   [],
    'dormant':     ['engaged'],
    'dnc':         [],
    'cancelled':   []
  };

  var GUARDS = {
    'booked':    function (ctx) {
      if (!ctx.depositReceived) throw new Error('BookingLifecycle: cannot transition to BOOKED — deposit not received');
    },
    'paid':      function (ctx) {
      if (!ctx.balanceReceived) throw new Error('BookingLifecycle: cannot transition to PAID — balance not received');
    },
    'completed': function (ctx) {
      if (!ctx.eventDate) throw new Error('BookingLifecycle: cannot transition to COMPLETED — event_date not set');
      var eventDate = new Date(ctx.eventDate);
      if (eventDate > new Date()) throw new Error('BookingLifecycle: cannot transition to COMPLETED — event_date is in the future');
    }
  };

  function _getSheet(spreadsheetId) {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(TAB_NAME);
    if (!sheet) throw new Error('BookingLifecycle: tab not found: ' + TAB_NAME);
    return sheet;
  }

  /**
   * Validate and record a state transition.
   *
   * @param {string} spreadsheetId
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} params.entityType    'booking' | 'customer' | 'asset' | 'config'
   * @param {string} params.entityId      booking_id, customer_id, asset_id, or control_id
   * @param {string} params.fromState     Current state (null for initial creation)
   * @param {string} params.toState       Target state
   * @param {string} params.transitionEvent  What triggered this (e.g. 'DEPOSIT_RECEIVED')
   * @param {string} params.triggeredBy   'system' | 'harkirat' | worker script name
   * @param {Object} [params.guardContext]  Context passed to guards (depositReceived, etc.)
   * @param {string} [params.notes]
   * @param {string} [params.bookingId]
   * @param {string} [params.customerId]
   * @param {string} [params.traceId]
   */
  function transition(spreadsheetId, params) {
    var from = params.fromState;
    var to   = params.toState;

    // Validate transition
    if (from && VALID_TRANSITIONS[from]) {
      if (VALID_TRANSITIONS[from].indexOf(to) === -1) {
        throw new Error('BookingLifecycle: invalid transition ' + from + ' → ' + to + ' for entity ' + params.entityId);
      }
    }

    // Run guard if defined
    if (GUARDS[to] && params.guardContext) {
      GUARDS[to](params.guardContext);
    }

    // Append log row
    var sheet = _getSheet(spreadsheetId);
    sheet.appendRow([
      Identifiers.lifecycleLogId(),
      params.tenantId       || '',
      params.bookingId      || '',
      params.customerId     || '',
      params.entityType     || '',
      params.entityId       || '',
      from  || '',
      to    || '',
      params.transitionEvent || '',
      params.triggeredBy    || 'system',
      params.notes          || '',
      params.traceId        || '',
      new Date().toISOString()
    ]);

    return { success: true, from: from, to: to, entityId: params.entityId };
  }

  /**
   * Returns true if a transition from → to is valid per the state machine.
   */
  function isValidTransition(from, to) {
    if (!from) return true; // initial creation always valid
    return VALID_TRANSITIONS[from] && VALID_TRANSITIONS[from].indexOf(to) !== -1;
  }

  return {
    transition:        transition,
    isValidTransition: isValidTransition,
    VALID_TRANSITIONS: VALID_TRANSITIONS
  };
})();
