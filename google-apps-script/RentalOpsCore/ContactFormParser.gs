/**
 * ContactFormParser — RentalOps Core Library
 *
 * Parses Web3Forms plain-text email bodies for NKR contact forms.
 * Each form subject has its own parse function.
 *
 * Supported formats:
 *   "Label : Value" on a single line  (existing Booking Inquiry / Quick Event Assistant forms)
 *   Label on one line, value on the next line (New Nova Kingdom Rentals Booking Inquiry)
 *
 * Supported subjects:
 *   "Booking Inquiry"                          — legacy contact page form
 *   "Quick Event Assistant Inquiry"            — chatbot follow-up form
 *   "New Nova Kingdom Rentals Booking Inquiry" — current live website contact form
 *
 * NOTE: The email/name/phone in the parsed result are the CUSTOMER's fields
 * from the form body. The Gmail sender may be notify+...@web3forms.com —
 * callers must use parsed.email as the customer email, not the Gmail sender.
 */

var ContactFormParser = (function () {

  // ─── Format A: "Label : Value" on a single line ────────────────────────────

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

  // ─── Format B: Label on one line, value on the next line ─────────────────
  // Used by "New Nova Kingdom Rentals Booking Inquiry".
  // CamelCase labels (e.g. EventDate) are normalised to snake_case (event_date).
  // Blank lines are removed before pairing. Trailing colons on labels are stripped.

  function _rawParseSeparateLines(body) {
    var result = {};
    if (!body) return result;
    var lines = body.split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0; });
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var rawKey = lines[i].replace(/:$/, '').trim();
      // CamelCase → snake_case: insert '_' before each uppercase letter (except the first)
      var key = rawKey
        .replace(/([A-Z])/g, function (m, p1, offset) {
          return (offset > 0 ? '_' : '') + p1.toLowerCase();
        })
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
      var val = lines[i + 1];
      if (key && val) result[key] = val;
    }
    return result;
  }

  // ─── Shared key normaliser ────────────────────────────────────────────────

  function _pick(raw, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var k = candidates[i].toLowerCase().replace(/\s+/g, '_');
      if (raw[k] !== undefined && raw[k] !== '') return raw[k];
    }
    return '';
  }

  // ─── Parser A: "Booking Inquiry" (legacy "Label : Value" format) ──────────

  function parseBookingInquiry(body) {
    var raw = _rawParse(body);
    var parsed = {
      form_type:      'booking_inquiry',
      name:           _pick(raw, ['name', 'full_name', 'your_name']),
      email:          _pick(raw, ['email', 'email_address', 'your_email']),
      phone:          _pick(raw, ['phone', 'phone_number', 'mobile', 'your_phone']),
      event_date:     _pick(raw, ['event_date', 'date', 'event_date_/_time', 'date_of_event']),
      event_address:  _pick(raw, ['event_address', 'address', 'location', 'event_location', 'delivery_address']),
      rental_item:    _pick(raw, ['rental_items', 'rental_item', 'interested_in', 'unit', 'units', 'which_unit']),
      event_duration: _pick(raw, ['duration', 'event_duration', 'rental_duration', 'how_long']),
      guest_count:    _pick(raw, ['guest_count', 'guests', 'number_of_guests', 'attendees', 'how_many_guests']),
      message:        _pick(raw, ['message', 'additional_notes', 'notes', 'other_info', 'anything_else']),
      extra:          {}
    };
    var known = [
      'name','full_name','your_name','email','email_address','your_email',
      'phone','phone_number','mobile','your_phone',
      'event_date','date','event_date_/_time','date_of_event',
      'event_address','address','location','event_location','delivery_address',
      'rental_items','rental_item','interested_in','unit','units','which_unit',
      'duration','event_duration','rental_duration','how_long',
      'guest_count','guests','number_of_guests','attendees','how_many_guests',
      'message','additional_notes','notes','other_info','anything_else'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Parser B: "Quick Event Assistant Inquiry" (legacy "Label : Value") ───

  function parseAssistantInquiry(body) {
    var raw = _rawParse(body);
    var parsed = {
      form_type:          'assistant_inquiry',
      name:               _pick(raw, ['name', 'full_name', 'your_name']),
      email:              _pick(raw, ['email', 'email_address']),
      phone:              _pick(raw, ['phone', 'phone_number', 'mobile']),
      event_type:         _pick(raw, ['event_type', 'type_of_event', 'occasion']),
      event_date:         _pick(raw, ['event_date', 'date', 'preferred_date']),
      event_address:      _pick(raw, ['location', 'event_location', 'address', 'event_address']),
      guest_count:        _pick(raw, ['number_of_guests', 'guest_count', 'guests', 'how_many']),
      budget:             _pick(raw, ['budget', 'estimated_budget', 'your_budget']),
      rental_item:        _pick(raw, ['interested_in', 'rental_items', 'units', 'which_unit']),
      message:            _pick(raw, ['message', 'additional_info', 'notes', 'other_details']),
      assistant_response: _pick(raw, ['assistant_response', 'chatbot_response', 'ai_response', 'assistant_summary']),
      extra:              {}
    };
    var known = [
      'name','full_name','your_name','email','email_address',
      'phone','phone_number','mobile',
      'event_type','type_of_event','occasion',
      'event_date','date','preferred_date',
      'location','event_location','address','event_address',
      'number_of_guests','guest_count','guests','how_many',
      'budget','estimated_budget','your_budget',
      'interested_in','rental_items','units','which_unit',
      'message','additional_info','notes','other_details',
      'assistant_response','chatbot_response','ai_response','assistant_summary'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Parser C: "New Nova Kingdom Rentals Booking Inquiry" ─────────────────
  // Current live website form. Body uses label-on-one-line / value-on-next-line format.
  // Fields: Business, InquiryType, Name, EventDate, EventAddress, EventType,
  //         Guests, PackageInterest, Phone, Email, PreferredContact, Notes

  function parseNkrWebsiteBooking(body) {
    var raw = _rawParseSeparateLines(body);
    var parsed = {
      form_type:     'nkr_website_booking',
      name:          _pick(raw, ['name', 'full_name', 'your_name']),
      email:         _pick(raw, ['email', 'email_address', 'your_email']),
      phone:         _pick(raw, ['phone', 'phone_number', 'mobile', 'your_phone']),
      event_date:    _pick(raw, ['event_date', 'date', 'preferred_date']),
      event_address: _pick(raw, ['event_address', 'address', 'location', 'event_location']),
      event_type:    _pick(raw, ['event_type', 'inquiry_type', 'type_of_event', 'occasion']),
      guest_count:   _pick(raw, ['guests', 'guest_count', 'number_of_guests', 'attendees']),
      rental_item:   _pick(raw, ['package_interest', 'rental_item', 'rental_items', 'interested_in', 'unit', 'units']),
      message:       _pick(raw, ['notes', 'message', 'additional_notes', 'other_info', 'anything_else']),
      extra:         {}
    };
    var known = [
      'business', 'inquiry_type', 'name', 'full_name', 'your_name',
      'email', 'email_address', 'your_email',
      'phone', 'phone_number', 'mobile', 'your_phone',
      'event_date', 'date', 'preferred_date',
      'event_address', 'address', 'location', 'event_location',
      'event_type', 'type_of_event', 'occasion',
      'guests', 'guest_count', 'number_of_guests', 'attendees',
      'package_interest', 'rental_item', 'rental_items', 'interested_in', 'unit', 'units',
      'preferred_contact',
      'notes', 'message', 'additional_notes', 'other_info', 'anything_else'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Dispatcher ───────────────────────────────────────────────────────────

  /**
   * Dispatch to the correct parser based on form subject.
   * Returns null if subject is not handled by this parser — caller routes to MANUAL_REVIEW.
   */
  function parse(body, formSubject) {
    var subj = String(formSubject || '').trim();
    if (subj === 'Booking Inquiry')                          return parseBookingInquiry(body);
    if (subj === 'Quick Event Assistant Inquiry')            return parseAssistantInquiry(body);
    if (subj === 'New Nova Kingdom Rentals Booking Inquiry') return parseNkrWebsiteBooking(body);
    return null;
  }

  /**
   * Extract first name from a full name string.
   */
  function firstName(fullName) {
    if (!fullName) return '';
    return String(fullName).trim().split(/\s+/)[0];
  }

  return {
    parse:                  parse,
    parseBookingInquiry:    parseBookingInquiry,
    parseAssistantInquiry:  parseAssistantInquiry,
    parseNkrWebsiteBooking: parseNkrWebsiteBooking,
    firstName:              firstName
  };
})();
