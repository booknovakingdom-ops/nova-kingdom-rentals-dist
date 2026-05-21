/**
 * ContactFormParser — RentalOps Core Library
 *
 * Parses Web3Forms plain-text email bodies for NKR contact forms.
 * Each form subject has its own parse function.
 *
 * Web3Forms format: "Field Label : Value\nField Label : Value\n..."
 *
 * Returns a normalized object with consistent field names regardless
 * of which form was submitted. Unknown fields are preserved in `extra`.
 *
 * Supported subjects:
 *   "Booking Inquiry"              — contact page booking form
 *   "Quick Event Assistant Inquiry" — chatbot follow-up form
 *   "Quote Request"                — website quote form (handled by nk-quote-intake.js)
 */

var ContactFormParser = (function () {

  /**
   * Parse a Web3Forms email body into a key-value map.
   * Returns raw map — use parseBookingInquiry() or parseAssistantInquiry()
   * for normalized output.
   */
  function _rawParse(body) {
    var result = {};
    if (!body) return result;
    var lines = body.split('\n');
    lines.forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx === -1) return;
      var key = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
      var val = line.slice(idx + 1).trim();
      if (key && val) result[key] = val;
    });
    return result;
  }

  /**
   * Normalize raw keys — Web3Forms labels can vary slightly between form versions.
   * Returns the value of the first matching key, or ''.
   */
  function _pick(raw, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var k = candidates[i].toLowerCase().replace(/\s+/g, '_');
      if (raw[k] !== undefined && raw[k] !== '') return raw[k];
    }
    return '';
  }

  /**
   * Parse "Booking Inquiry" form body.
   *
   * @param {string} body  Plain-text email body from Web3Forms
   * @returns {Object}     Normalized parsed fields
   */
  function parseBookingInquiry(body) {
    var raw = _rawParse(body);
    var parsed = {
      form_type:     'booking_inquiry',
      name:          _pick(raw, ['name', 'full_name', 'your_name']),
      email:         _pick(raw, ['email', 'email_address', 'your_email']),
      phone:         _pick(raw, ['phone', 'phone_number', 'mobile', 'your_phone']),
      event_date:    _pick(raw, ['event_date', 'date', 'event_date_/_time', 'date_of_event']),
      event_address: _pick(raw, ['event_address', 'address', 'location', 'event_location', 'delivery_address']),
      rental_item:   _pick(raw, ['rental_items', 'rental_item', 'interested_in', 'unit', 'units', 'which_unit']),
      event_duration:_pick(raw, ['duration', 'event_duration', 'rental_duration', 'how_long']),
      guest_count:   _pick(raw, ['guest_count', 'guests', 'number_of_guests', 'attendees', 'how_many_guests']),
      message:       _pick(raw, ['message', 'additional_notes', 'notes', 'other_info', 'anything_else']),
      extra:         {}
    };
    // Preserve unrecognized fields
    var known = ['name','full_name','your_name','email','email_address','your_email','phone','phone_number',
                 'mobile','your_phone','event_date','date','event_date_/_time','date_of_event',
                 'event_address','address','location','event_location','delivery_address',
                 'rental_items','rental_item','interested_in','unit','units','which_unit',
                 'duration','event_duration','rental_duration','how_long',
                 'guest_count','guests','number_of_guests','attendees','how_many_guests',
                 'message','additional_notes','notes','other_info','anything_else'];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  /**
   * Parse "Quick Event Assistant Inquiry" form body.
   *
   * @param {string} body  Plain-text email body from Web3Forms
   * @returns {Object}     Normalized parsed fields
   */
  function parseAssistantInquiry(body) {
    var raw = _rawParse(body);
    var parsed = {
      form_type:      'assistant_inquiry',
      name:           _pick(raw, ['name', 'full_name', 'your_name']),
      email:          _pick(raw, ['email', 'email_address']),
      phone:          _pick(raw, ['phone', 'phone_number', 'mobile']),
      event_type:     _pick(raw, ['event_type', 'type_of_event', 'occasion']),
      event_date:     _pick(raw, ['event_date', 'date', 'preferred_date']),
      event_address:  _pick(raw, ['location', 'event_location', 'address', 'event_address']),
      guest_count:    _pick(raw, ['number_of_guests', 'guest_count', 'guests', 'how_many']),
      budget:         _pick(raw, ['budget', 'estimated_budget', 'your_budget']),
      rental_item:    _pick(raw, ['interested_in', 'rental_items', 'units', 'which_unit']),
      message:        _pick(raw, ['message', 'additional_info', 'notes', 'other_details']),
      assistant_response: _pick(raw, ['assistant_response', 'chatbot_response', 'ai_response', 'assistant_summary']),
      extra:          {}
    };
    var known = ['name','full_name','your_name','email','email_address','phone','phone_number','mobile',
                 'event_type','type_of_event','occasion','event_date','date','preferred_date',
                 'location','event_location','address','event_address','number_of_guests',
                 'guest_count','guests','how_many','budget','estimated_budget','your_budget',
                 'interested_in','rental_items','units','which_unit','message','additional_info',
                 'notes','other_details','assistant_response','chatbot_response','ai_response','assistant_summary'];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  /**
   * Dispatch to the correct parser based on form subject.
   * Returns null if subject is not handled by this parser.
   */
  function parse(body, formSubject) {
    var subj = String(formSubject || '').trim();
    if (subj === 'Booking Inquiry') return parseBookingInquiry(body);
    if (subj === 'Quick Event Assistant Inquiry') return parseAssistantInquiry(body);
    return null; // Caller routes to MANUAL_REVIEW
  }

  /**
   * Extract first name from a full name string.
   */
  function firstName(fullName) {
    if (!fullName) return '';
    return String(fullName).trim().split(/\s+/)[0];
  }

  return {
    parse:                 parse,
    parseBookingInquiry:   parseBookingInquiry,
    parseAssistantInquiry: parseAssistantInquiry,
    firstName:             firstName
  };
})();
