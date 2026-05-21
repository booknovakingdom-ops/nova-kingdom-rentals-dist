/**
 * Events — RentalOps Core Library
 *
 * Named event types for the event-driven processing model.
 * Worker scripts build events and pass them to the EventRouter.
 * All event names are constants here — no magic strings in worker scripts.
 */

var Events = (function () {

  // Inbound contact events
  var CONTACT_FORM_RECEIVED              = 'CONTACT_FORM_RECEIVED';
  var QUOTE_REQUEST_RECEIVED             = 'QUOTE_REQUEST_RECEIVED';
  var EMAIL_REPLY_RECEIVED               = 'EMAIL_REPLY_RECEIVED';
  var QUICK_ASSISTANT_INQUIRY_RECEIVED   = 'QUICK_ASSISTANT_INQUIRY_RECEIVED';

  // Booking lifecycle events
  var DEPOSIT_RECEIVED                   = 'DEPOSIT_RECEIVED';
  var BALANCE_RECEIVED                   = 'BALANCE_RECEIVED';
  var BOOKING_CONFIRMED                  = 'BOOKING_CONFIRMED';
  var BOOKING_CANCELLED                  = 'BOOKING_CANCELLED';
  var EVENT_COMPLETED                    = 'EVENT_COMPLETED';

  // Follow-up events
  var DEPOSIT_OVERDUE                    = 'DEPOSIT_OVERDUE';
  var POST_EVENT_FOLLOW_UP               = 'POST_EVENT_FOLLOW_UP';
  var REVIEW_REQUESTED                   = 'REVIEW_REQUESTED';

  // System events
  var MANUAL_OVERRIDE                    = 'MANUAL_OVERRIDE';
  var SIMULATION_RUN                     = 'SIMULATION_RUN';
  var CONTROL_CHANGED                    = 'CONTROL_CHANGED';

  /**
   * Build a canonical event object.
   *
   * @param {string} eventType   One of the constants above
   * @param {Object} payload     Event-specific data
   * @param {Object} meta        { tenantId, workerScript, traceId, timestamp }
   * @returns {Object}
   */
  function build(eventType, payload, meta) {
    return {
      event_type:    eventType,
      payload:       payload   || {},
      tenant_id:     meta.tenantId    || '',
      worker_script: meta.workerScript || '',
      trace_id:      meta.traceId     || '',
      timestamp:     meta.timestamp   || new Date().toISOString()
    };
  }

  return {
    CONTACT_FORM_RECEIVED:            CONTACT_FORM_RECEIVED,
    QUOTE_REQUEST_RECEIVED:           QUOTE_REQUEST_RECEIVED,
    EMAIL_REPLY_RECEIVED:             EMAIL_REPLY_RECEIVED,
    QUICK_ASSISTANT_INQUIRY_RECEIVED: QUICK_ASSISTANT_INQUIRY_RECEIVED,
    DEPOSIT_RECEIVED:                 DEPOSIT_RECEIVED,
    BALANCE_RECEIVED:                 BALANCE_RECEIVED,
    BOOKING_CONFIRMED:                BOOKING_CONFIRMED,
    BOOKING_CANCELLED:                BOOKING_CANCELLED,
    EVENT_COMPLETED:                  EVENT_COMPLETED,
    DEPOSIT_OVERDUE:                  DEPOSIT_OVERDUE,
    POST_EVENT_FOLLOW_UP:             POST_EVENT_FOLLOW_UP,
    REVIEW_REQUESTED:                 REVIEW_REQUESTED,
    MANUAL_OVERRIDE:                  MANUAL_OVERRIDE,
    SIMULATION_RUN:                   SIMULATION_RUN,
    CONTROL_CHANGED:                  CONTROL_CHANGED,
    build:                            build
  };
})();
