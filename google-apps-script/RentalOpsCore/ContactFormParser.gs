/**
 * ContactFormParser — RentalOps Core Library
 *
 * Parses Web3Forms plain-text email bodies for NKR contact forms.
 *
 * Supported formats:
 *   Format A — "Label : Value" on a single line (legacy forms)
 *   Format B — Label on one line, value on the next (current live form)
 *              Blank lines between pairs are tolerated.
 *              Multi-line values (Notes/Message) are accumulated.
 *              Web3Forms footer sections are stripped before parsing.
 *
 * Supported subjects:
 *   "Booking Inquiry"                          — legacy contact page form
 *   "Quick Event Assistant Inquiry"            — chatbot follow-up form
 *   "New Nova Kingdom Rentals Booking Inquiry" — current live website form
 *
 * NOTE: The email/name/phone in the parsed result are the CUSTOMER's fields
 * from the form body. The Gmail sender may be notify+...@web3forms.com —
 * callers MUST use parsed.email as the customer email, never the Gmail sender.
 *
 * Utilities exported for use by nk-contact-intake.js:
 *   ContactFormParser.isWeb3FormsNotifySender(email)
 *   ContactFormParser.containsUnresolvedPlaceholders(text)
 *   ContactFormParser.validateRequiredForDraft(parsed, customerEmail)
 */

var ContactFormParser = (function () {

  // ─── Web3Forms footer stop-words ─────────────────────────────────────────────
  // Body text from these lines onward is ignored — it is Web3Forms boilerplate,
  // not customer-submitted form data.

  var W3F_FOOTER_MARKERS = [
    'visitor ip',
    'report spam',
    'manage notifications',
    'this e-mail was sent from',
    'powered by'
  ];

  // ─── Known label set (all field names Web3Forms may use as labels) ────────────
  // Covers both the current quote-cart form and the contact page form.
  // Normalised to snake_case for fast lookup.

  var KNOWN_LABELS_RAW = [
    // Meta / routing
    'Business', 'InquiryType', 'Inquiry Type', 'Inquiry_Type',
    // Customer identity
    'Name', 'FullName', 'Full Name', 'YourName', 'Your Name', 'FromName', 'From Name',
    'Email', 'EmailAddress', 'Email Address', 'YourEmail', 'Your Email', 'ReplyTo', 'Reply To',
    'Phone', 'PhoneNumber', 'Phone Number', 'Mobile', 'YourPhone', 'Your Phone',
    'PreferredContact', 'Preferred Contact',
    // Event timing
    'EventDate', 'Event Date', 'Date', 'PreferredDate', 'Preferred Date',
    'StartTime', 'Start Time', 'EndTime', 'End Time',
    // Event location
    'EventAddress', 'Event Address', 'Address', 'Location',
    'EventLocation', 'Event Location', 'DeliveryAddress', 'Delivery Address',
    'City', 'Province', 'PostalCode', 'Postal Code',
    // Event details
    'EventType', 'Event Type', 'TypeOfEvent', 'Type Of Event', 'Occasion',
    'Guests', 'GuestCount', 'Guest Count', 'NumberOfGuests', 'Number Of Guests',
    'Attendees', 'HowManyGuests', 'How Many Guests',
    // Rental / package interest
    'PackageInterest', 'Package Interest',
    'RentalItem', 'Rental Item', 'RentalItems', 'Rental Items',
    'InterestedIn', 'Interested In', 'Unit', 'Units', 'WhichUnit', 'Which Unit',
    'SelectedItems', 'Selected Items',
    // Setup / logistics
    'SetupSurface', 'Setup Surface', 'Surface', 'SurfaceType', 'Surface Type',
    'IndoorOutdoor', 'Indoor Outdoor', 'Indoor/Outdoor',
    'PowerDistanceToOutlet', 'Power Distance To Outlet',
    'PowerAccess', 'Power Access', 'PowerNeedsReview', 'Power Needs Review',
    'WaterAccess', 'Water Access',
    // Pricing summary
    'Subtotal', 'EstimatedTotal', 'Estimated Total',
    // Delivery
    'DeliveryLookupSource', 'Delivery Lookup Source',
    'DeliveryDistanceKm', 'Delivery Distance Km',
    'DeliveryDurationOneWay', 'Delivery Duration One Way',
    'DistanceFeeEstimate', 'Distance Fee Estimate',
    'StaffTravelFeeEstimate', 'Staff Travel Fee Estimate',
    'CombinedDeliveryEstimate', 'Combined Delivery Estimate',
    // Sandbag
    'SandbagUnitCount', 'Sandbag Unit Count',
    'SandbagEstimate', 'Sandbag Estimate',
    'SandbagManualReview', 'Sandbag Manual Review',
    // Attendants
    'AttendantsRequired', 'Attendants Required',
    'AttendantCount', 'Attendant Count',
    'AttendantHours', 'Attendant Hours',
    'AttendantEstimate', 'Attendant Estimate',
    // Notes / misc
    'Notes', 'Message', 'AdditionalNotes', 'Additional Notes',
    'OtherInfo', 'Other Info', 'AnythingElse', 'Anything Else',
    'Disclaimer',
    // Legacy contact / assistant forms
    'Event Duration', 'Duration', 'EventDuration', 'HowLong', 'How Long',
    'Budget', 'EstimatedBudget', 'Estimated Budget', 'YourBudget', 'Your Budget',
    'AssistantResponse', 'Assistant Response',
    'ChatbotResponse', 'Chatbot Response',
    'AiResponse', 'Ai Response',
    'AssistantSummary', 'Assistant Summary'
  ];

  // Build a Set (object) of normalised keys for O(1) lookup.
  var _labelKeySet = (function () {
    var s = {};
    KNOWN_LABELS_RAW.forEach(function (l) {
      s[_normaliseKey(l)] = true;
    });
    return s;
  }());

  // ─── Key normalisation ─────────────────────────────────────────────────────

  function _normaliseKey(raw) {
    return raw
      .replace(/:$/, '')
      .trim()
      // CamelCase → insert underscore before each uppercase letter
      .replace(/([A-Z])/g, function (m, p1, offset) {
        return (offset > 0 ? '_' : '') + p1.toLowerCase();
      })
      .toLowerCase()
      .replace(/[\s/]+/g, '_')
      .replace(/_+/g, '_');
  }

  // ─── Footer detection ──────────────────────────────────────────────────────

  function _isFooterLine(line) {
    var lower = line.toLowerCase();
    for (var i = 0; i < W3F_FOOTER_MARKERS.length; i++) {
      if (lower.indexOf(W3F_FOOTER_MARKERS[i]) !== -1) return true;
    }
    return false;
  }

  // ─── Format A: "Label : Value" on a single line ─────────────────────────────
  // Used by legacy forms. Stops at footer. Skips footer lines.

  function _rawParse(body) {
    var result = {};
    if (!body) return result;
    var lines = body.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (_isFooterLine(line)) break;
      var idx = line.indexOf(':');
      if (idx === -1) continue;
      var key = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
      var val = line.slice(idx + 1).trim();
      if (key && val) result[key] = val;
    }
    return result;
  }

  // ─── Format B: Label on one line, value on the next ───────────────────────
  //
  // Algorithm:
  //   1. Strip body at first footer marker.
  //   2. Walk lines. If a line normalises to a known label key → it is a label.
  //      Flush any accumulated value for the previous label, start a new one.
  //   3. If a line is not a known label and we have a current label → append
  //      it to the current value (handles multi-line Notes/Message).
  //   4. Blank lines are skipped but do NOT end a multi-line value.
  //
  // This replaces the fragile i+=2 fixed-step loop that misparses bodies
  // with blank lines between pairs or multi-line values.

  function _rawParseSeparateLines(body) {
    var result = {};
    if (!body) return result;

    var lines = body.split('\n');
    var currentKey  = null;
    var currentVals = [];

    function _flush() {
      if (currentKey && currentVals.length) {
        result[currentKey] = currentVals.join(' ').trim();
      }
      currentKey  = null;
      currentVals = [];
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      // Stop at Web3Forms footer
      if (_isFooterLine(line)) break;

      // Skip blank lines (they appear between label/value pairs in real emails)
      if (!line) continue;

      var normKey = _normaliseKey(line);
      if (_labelKeySet[normKey]) {
        // This line is a known label
        _flush();
        currentKey = normKey;
      } else if (currentKey) {
        // This line is a value (or continuation of a multi-line value)
        currentVals.push(line);
      }
      // Lines before the first known label are silently ignored
    }
    _flush();

    return result;
  }

  // ─── Shared field picker ───────────────────────────────────────────────────

  function _pick(raw, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var k = _normaliseKey(candidates[i]);
      if (raw[k] !== undefined && raw[k] !== '') return raw[k];
    }
    return '';
  }

  // ─── Parser A: "Booking Inquiry" (legacy "Label : Value" format) ────────────

  function parseBookingInquiry(body) {
    var raw = _rawParse(body);
    var parsed = {
      form_type:      'booking_inquiry',
      name:           _pick(raw, ['name', 'full_name', 'your_name']),
      email:          _pick(raw, ['email', 'email_address', 'your_email']),
      phone:          _pick(raw, ['phone', 'phone_number', 'mobile', 'your_phone']),
      event_date:     _pick(raw, ['event_date', 'date', 'event_date_/_time', 'date_of_event']),
      event_address:  _pick(raw, ['event_address', 'address', 'location', 'event_location', 'delivery_address']),
      rental_item:    _pick(raw, ['rental_items', 'rental_item', 'interested_in', 'unit', 'units', 'which_unit', 'package_interest']),
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
      'rental_items','rental_item','interested_in','unit','units','which_unit','package_interest',
      'duration','event_duration','rental_duration','how_long',
      'guest_count','guests','number_of_guests','attendees','how_many_guests',
      'message','additional_notes','notes','other_info','anything_else'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Parser B: "Quick Event Assistant Inquiry" (legacy "Label : Value") ─────

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
      rental_item:        _pick(raw, ['interested_in', 'rental_items', 'units', 'which_unit', 'package_interest']),
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
      'interested_in','rental_items','units','which_unit','package_interest',
      'message','additional_info','notes','other_details',
      'assistant_response','chatbot_response','ai_response','assistant_summary'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Parser C: "New Nova Kingdom Rentals Booking Inquiry" ──────────────────
  // Current live website form (both contact page and quote-cart).
  // Body format: label on one line, value on the next, blank lines between pairs.
  // Fields submitted by contact page form:
  //   Business, InquiryType, Name, EventDate, EventAddress, EventType,
  //   Guests, PackageInterest, Phone, Email, PreferredContact, Notes
  // Additional fields from quote-cart form:
  //   StartTime, EndTime, City, Province, PostalCode, SetupSurface,
  //   PowerDistanceToOutlet, PowerNeedsReview, WaterAccess, SelectedItems,
  //   Subtotal, DeliveryLookupSource, DeliveryDistanceKm, ... (see quote-cart.mjs)

  function parseNkrWebsiteBooking(body) {
    var raw = _rawParseSeparateLines(body);
    var parsed = {
      form_type:      'nkr_website_booking',
      name:           _pick(raw, ['name', 'full_name', 'your_name', 'from_name']),
      email:          _pick(raw, ['email', 'email_address', 'your_email', 'reply_to']),
      phone:          _pick(raw, ['phone', 'phone_number', 'mobile', 'your_phone']),
      event_date:     _pick(raw, ['event_date', 'date', 'preferred_date']),
      start_time:     _pick(raw, ['start_time']),
      end_time:       _pick(raw, ['end_time']),
      event_address:  _pick(raw, ['event_address', 'address', 'location', 'event_location', 'delivery_address']),
      city:           _pick(raw, ['city']),
      province:       _pick(raw, ['province']),
      postal_code:    _pick(raw, ['postal_code']),
      event_type:     _pick(raw, ['event_type', 'inquiry_type', 'type_of_event', 'occasion']),
      guest_count:    _pick(raw, ['guests', 'guest_count', 'number_of_guests', 'attendees']),
      rental_item:    _pick(raw, ['package_interest', 'selected_items', 'rental_item', 'rental_items', 'interested_in', 'unit', 'units']),
      setup_surface:  _pick(raw, ['setup_surface', 'surface', 'surface_type']),
      power_access:   _pick(raw, ['power_distance_to_outlet', 'power_access']),
      water_access:   _pick(raw, ['water_access']),
      message:        _pick(raw, ['notes', 'message', 'additional_notes', 'other_info', 'anything_else']),
      extra:          {}
    };
    var known = [
      'business', 'inquiry_type', 'name', 'full_name', 'your_name', 'from_name',
      'email', 'email_address', 'your_email', 'reply_to',
      'phone', 'phone_number', 'mobile', 'your_phone',
      'event_date', 'date', 'preferred_date', 'start_time', 'end_time',
      'event_address', 'address', 'location', 'event_location', 'delivery_address',
      'city', 'province', 'postal_code',
      'event_type', 'type_of_event', 'occasion',
      'guests', 'guest_count', 'number_of_guests', 'attendees',
      'package_interest', 'selected_items', 'rental_item', 'rental_items', 'interested_in', 'unit', 'units',
      'setup_surface', 'surface', 'surface_type', 'indoor_outdoor',
      'power_distance_to_outlet', 'power_access', 'power_needs_review',
      'water_access',
      'preferred_contact',
      'notes', 'message', 'additional_notes', 'other_info', 'anything_else',
      'subtotal', 'estimated_total',
      'delivery_lookup_source', 'delivery_distance_km', 'delivery_duration_one_way',
      'distance_fee_estimate', 'staff_travel_fee_estimate', 'combined_delivery_estimate',
      'sandbag_unit_count', 'sandbag_estimate', 'sandbag_manual_review',
      'attendants_required', 'attendant_count', 'attendant_hours', 'attendant_estimate',
      'disclaimer'
    ];
    Object.keys(raw).forEach(function (k) {
      if (known.indexOf(k) === -1) parsed.extra[k] = raw[k];
    });
    return parsed;
  }

  // ─── Dispatcher ──────────────────────────────────────────────────────────────

  /**
   * Dispatch to the correct parser based on the email subject.
   * Returns null for unrecognised subjects — caller routes to MANUAL_REVIEW.
   */
  function parse(body, formSubject) {
    var subj = String(formSubject || '').trim();
    if (subj === 'Booking Inquiry')                          return parseBookingInquiry(body);
    if (subj === 'Quick Event Assistant Inquiry')            return parseAssistantInquiry(body);
    if (subj === 'New Nova Kingdom Rentals Booking Inquiry') return parseNkrWebsiteBooking(body);
    return null;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  /**
   * Returns the first word of a full name string.
   */
  function firstName(fullName) {
    if (!fullName) return '';
    return String(fullName).trim().split(/\s+/)[0];
  }

  /**
   * Returns true if the email looks like a Web3Forms system sender.
   * These are never valid customer reply-to addresses.
   */
  function isWeb3FormsNotifySender(email) {
    var e = String(email || '').toLowerCase().trim();
    return e.indexOf('@web3forms.com') !== -1 ||
           /^notify\+/.test(e) ||
           /^no-reply@/.test(e) ||
           /^noreply@/.test(e);
  }

  /**
   * Scans text for unresolved template placeholders.
   * Returns an array of found placeholder strings, empty array if clean.
   *
   * Blocked patterns:
   *   [ALL_CAPS_TOKEN]   — TemplateRenderer unfilled placeholder
   *   {{anything}}       — unfilled Mustache-style token
   *   literal "undefined" or "null" as standalone words
   */
  function containsUnresolvedPlaceholders(text) {
    if (!text) return [];
    var found = [];
    var str = String(text);

    // [ALL_CAPS_TOKEN] — must have at least two chars, all caps + underscore
    var bracketRe = /\[[A-Z][A-Z_]{1,}\]/g;
    var m;
    while ((m = bracketRe.exec(str)) !== null) {
      if (found.indexOf(m[0]) === -1) found.push(m[0]);
    }

    // {{anything}}
    var doubleCurlyRe = /\{\{[^}]+\}\}/g;
    while ((m = doubleCurlyRe.exec(str)) !== null) {
      if (found.indexOf(m[0]) === -1) found.push(m[0]);
    }

    // Literal "undefined" or "null" as word tokens
    if (/\bundefined\b/.test(str)) found.push('undefined');
    if (/\bnull\b/.test(str)) found.push('null');

    return found;
  }

  /**
   * Validate that a parsed result and customer email are safe to draft for.
   * Returns { valid: bool, issues: string[] }.
   *
   * Hard failures (never create draft):
   *   - customerEmail is missing or has no @ sign
   *   - customerEmail matches a Web3Forms notify/noreply pattern
   */
  function validateRequiredForDraft(parsed, customerEmail) {
    var issues = [];
    var email = String(customerEmail || '').trim();

    if (!email || email.indexOf('@') === -1) {
      issues.push('missing_customer_email');
    } else if (isWeb3FormsNotifySender(email)) {
      issues.push('web3forms_notify_email_as_recipient');
    }

    return { valid: issues.length === 0, issues: issues };
  }

  return {
    parse:                        parse,
    parseBookingInquiry:          parseBookingInquiry,
    parseAssistantInquiry:        parseAssistantInquiry,
    parseNkrWebsiteBooking:       parseNkrWebsiteBooking,
    firstName:                    firstName,
    isWeb3FormsNotifySender:      isWeb3FormsNotifySender,
    containsUnresolvedPlaceholders: containsUnresolvedPlaceholders,
    validateRequiredForDraft:     validateRequiredForDraft
  };
})();
