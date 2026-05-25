/**
 * TestHarness — RentalOps Core Library
 *
 * Lightweight unit test runner for Apps Script. No external test framework needed.
 * Run testAll() from the Apps Script editor to validate the full library.
 *
 * All tests are I/O-free (no Gmail, no Sheets reads/writes).
 * Mock data is passed directly to each function under test.
 */

var TestHarness = (function () {

  var _results = [];

  function assert(description, condition) {
    _results.push({ description: description, passed: !!condition });
    if (!condition) console.warn('FAIL: ' + description);
  }

  function assertEqual(description, actual, expected) {
    var passed = JSON.stringify(actual) === JSON.stringify(expected);
    _results.push({ description: description, passed: passed, actual: actual, expected: expected });
    if (!passed) console.warn('FAIL: ' + description + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }

  function _mockBusinessProfile() {
    return {
      tenant_id:            'nkr',
      deposit_rate:         0.30,
      free_travel_km:       15,
      travel_fee_per_km:    0.72,
      card_surcharge_rate:  0.05,
      attendant_rate_hr:    35,
      wind_limit_kmh:       38,
      silly_string_fee:     500,
      extension_fee:        60,
      min_discount_approval: 0.10,
      hst_registered:       false
    };
  }

  // ─── QuoteEngine Tests ────────────────────────────────────────────────────

  function testQuoteEngine_basicSingleUnit() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 0, attendantHours: 0, paymentMethod: 'etransfer',
      extensionRequested: false, discountPct: 0, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assertEqual('QuoteEngine: basic single unit subtotal', r.subtotal, 240);
    assertEqual('QuoteEngine: no travel fee within free km', r.travelFee, 0);
    assertEqual('QuoteEngine: no card surcharge on etransfer', r.processingFee, 0);
    assertEqual('QuoteEngine: quote total = subtotal', r.quoteTotal, 240);
    assertEqual('QuoteEngine: deposit = 30%', r.depositAmount, 72);
    assertEqual('QuoteEngine: balance = 70%', r.balanceDue, 168);
  }

  function testQuoteEngine_travelFee() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 30, attendantHours: 0, paymentMethod: 'etransfer',
      extensionRequested: false, discountPct: 0, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assertEqual('QuoteEngine: chargeable km = 30 - 15', r.chargeableKm, 15);
    assertEqual('QuoteEngine: travel fee = 15 * 0.72', r.travelFee, 10.80);
    assertEqual('QuoteEngine: total with travel', r.quoteTotal, 250.80);
  }

  function testQuoteEngine_cardSurcharge() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 0, attendantHours: 0, paymentMethod: 'credit_card',
      extensionRequested: false, discountPct: 0, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assertEqual('QuoteEngine: card surcharge = 5% of 240', r.processingFee, 12);
    assertEqual('QuoteEngine: total with card surcharge', r.quoteTotal, 252);
  }

  function testQuoteEngine_discountRequiresApproval() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 0, attendantHours: 0, paymentMethod: 'etransfer',
      extensionRequested: false, discountPct: 0.15, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assert('QuoteEngine: 15% discount triggers approval flag', r.requiresApproval);
    assertEqual('QuoteEngine: discount amount = 15% of 240', r.discountAmount, 36);
    assertEqual('QuoteEngine: total after 15% discount', r.quoteTotal, 204);
  }

  function testQuoteEngine_smallDiscountNoApproval() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 0, attendantHours: 0, paymentMethod: 'etransfer',
      extensionRequested: false, discountPct: 0.05, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assert('QuoteEngine: 5% discount does NOT require approval', !r.requiresApproval);
  }

  function testQuoteEngine_priceBlockContainsAllAmounts() {
    var input = {
      tenantId: 'nkr',
      lineItems: [{ unitId: 'nkr-U-002', unitName: 'Crown Quest', basePrice: 240, hours: 4 }],
      distanceKm: 30, attendantHours: 2, paymentMethod: 'credit_card',
      extensionRequested: false, discountPct: 0, sillyStringDamage: false,
      businessProfile: _mockBusinessProfile(), pricingRules: []
    };
    var r = QuoteEngine.calculate(input);
    assert('QuoteEngine: priceBlock contains lineItem amount', r.priceBlock.indexOf(240) !== -1);
    assert('QuoteEngine: priceBlock contains travel fee', r.priceBlock.indexOf(r.travelFee) !== -1);
    assert('QuoteEngine: priceBlock contains quote total', r.priceBlock.indexOf(r.quoteTotal) !== -1);
    assert('QuoteEngine: priceBlock contains deposit', r.priceBlock.indexOf(r.depositAmount) !== -1);
  }

  // ─── RiskEvaluator Tests ──────────────────────────────────────────────────

  function testRiskEvaluator_blocklist() {
    var rules = [
      { rule_id: 'nkr-RR-007', condition_field: 'sender_email', condition_operator: 'in',
        condition_value: 'smilesandchucklesbrookfield@gmail.com', risk_action: 'no_draft',
        severity: 'critical', notify_owner: false }
    ];
    var ctx = { sender_email: 'smilesandchucklesbrookfield@gmail.com', confidence: 0.9 };
    var result = RiskEvaluator.evaluate(rules, ctx);
    assert('RiskEvaluator: blocklist email triggers no_draft', result.worstAction === 'no_draft');
    assertEqual('RiskEvaluator: blocklist severity = critical', result.worstSeverity, 'critical');
  }

  function testRiskEvaluator_lowConfidence() {
    var rules = [
      { rule_id: 'nkr-RR-006', condition_field: 'confidence', condition_operator: 'lt',
        condition_value: '0.75', risk_action: 'manual_review',
        severity: 'medium', notify_owner: false }
    ];
    var ctx = { confidence: 0.60 };
    var result = RiskEvaluator.evaluate(rules, ctx);
    assert('RiskEvaluator: low confidence triggers manual_review', result.worstAction === 'manual_review');
  }

  function testRiskEvaluator_cleanContext() {
    var rules = [
      { rule_id: 'nkr-RR-007', condition_field: 'sender_email', condition_operator: 'in',
        condition_value: 'smilesandchucklesbrookfield@gmail.com', risk_action: 'no_draft',
        severity: 'critical', notify_owner: false }
    ];
    var ctx = { sender_email: 'normal.customer@example.com', confidence: 0.9 };
    var result = RiskEvaluator.evaluate(rules, ctx);
    assert('RiskEvaluator: clean context returns null action', result.worstAction === null);
    assertEqual('RiskEvaluator: no triggered rules', result.triggered.length, 0);
  }

  function testRiskEvaluator_draftPriceGrounding() {
    var priceBlock = [240, 10.80, 250.80, 75.24, 175.56];
    var cleanDraft = 'Your quote total is $250.80. Deposit: $75.24.';
    var badDraft   = 'Your quote total is $299.00. Deposit: $89.70.';
    assert('RiskEvaluator: clean draft passes grounding check', !RiskEvaluator.draftContainsUnlistedPrice(cleanDraft, priceBlock));
    assert('RiskEvaluator: hallucinated price fails grounding check', RiskEvaluator.draftContainsUnlistedPrice(badDraft, priceBlock));
  }

  // ─── Validators Tests ─────────────────────────────────────────────────────

  function testValidators_quoteReadiness() {
    var complete   = { event_date: '2026-07-12', event_address: '123 Main St', rental_item: 'Crown Quest' };
    var incomplete = { event_date: '2026-07-12', rental_item: 'Crown Quest' };
    assert('Validators: complete email passes readiness', Validators.quoteReadinessCheck(complete).valid);
    assert('Validators: missing address fails readiness', !Validators.quoteReadinessCheck(incomplete).valid);
    assertEqual('Validators: missing field = address', Validators.quoteReadinessCheck(incomplete).missingFields, ['event_address']);
  }

  function testValidators_aiOutputValidation() {
    var good = { intent: 'quote_or_availability', readiness: 'new', confidence: 0.9,
                 missing_fields: [], risk_signals: [], decision: 'draft', mode: 'quote', reason: 'All fields present' };
    var bad  = { intent: 'quote_or_availability', confidence: 1.5, decision: 'fly_away' };
    assert('Validators: valid AI output passes', Validators.validateAiActionDecision(good).valid);
    assert('Validators: invalid AI output fails', !Validators.validateAiActionDecision(bad).valid);
  }

  // ─── BookingLifecycle Tests ───────────────────────────────────────────────

  function testBookingLifecycle_validTransitions() {
    assert('Lifecycle: new → engaged is valid',   BookingLifecycle.isValidTransition('new', 'engaged'));
    assert('Lifecycle: quoted → booked is valid',  BookingLifecycle.isValidTransition('quoted', 'booked'));
    assert('Lifecycle: completed → anything invalid', !BookingLifecycle.isValidTransition('completed', 'new'));
    assert('Lifecycle: dnc → anything invalid',   !BookingLifecycle.isValidTransition('dnc', 'engaged'));
    assert('Lifecycle: null from is valid (creation)', BookingLifecycle.isValidTransition(null, 'new'));
  }

  // ─── ContactFormParser — legacy format tests ──────────────────────────────

  function testContactFormParser_bookingInquiry() {
    var body = [
      'Name : Jane Smith',
      'Email : jane.smith@example.com',
      'Phone : 902-555-0123',
      'Event Date : July 19, 2026',
      'Event Address : 45 Maple Street, Bridgewater NS',
      'Rental Items : Crown Quest',
      'Duration : 4 hours',
      'Guest Count : 25 kids',
      'Message : Birthday party fun!'
    ].join('\n');
    var result = ContactFormParser.parse(body, 'Booking Inquiry');
    assertEqual('Parser-A: form_type = booking_inquiry', result.form_type, 'booking_inquiry');
    assertEqual('Parser-A: name parsed', result.name, 'Jane Smith');
    assertEqual('Parser-A: email parsed', result.email, 'jane.smith@example.com');
    assertEqual('Parser-A: event_date parsed', result.event_date, 'July 19, 2026');
    assertEqual('Parser-A: rental_item parsed', result.rental_item, 'Crown Quest');
  }

  function testContactFormParser_assistantInquiry() {
    var body = [
      'Name : Bob Jones',
      'Email : bob@example.com',
      'Event Type : Birthday Party',
      'Event Date : August 10, 2026',
      'Location : 12 Oak Ave, Lunenburg NS',
      'Number of Guests : 40',
      'Budget : $500',
      'Message : Looking for something big'
    ].join('\n');
    var result = ContactFormParser.parse(body, 'Quick Event Assistant Inquiry');
    assertEqual('Parser-B: assistant form_type', result.form_type, 'assistant_inquiry');
    assertEqual('Parser-B: event_type parsed', result.event_type, 'Birthday Party');
    assertEqual('Parser-B: budget parsed', result.budget, '$500');
    assertEqual('Parser-B: event_address from location', result.event_address, '12 Oak Ave, Lunenburg NS');
  }

  function testContactFormParser_unknownSubject() {
    var result = ContactFormParser.parse('Name : Test', 'Some Other Form');
    assert('Parser: unknown subject returns null', result === null);
  }

  // ─── Test REAL: Exact Gmail body from message 19e52011aa6334c4 ───────────
  // This is the verbatim production body that exposed the parser failure.
  // Web3Forms sender: notify+yqgbgi@web3forms.com
  // Includes: intro text before first label, blank optional fields (Guests,
  // PreferredContact, Notes), Web3Forms footer line.

  function testParser_realGmailBody() {
    var body = [
      'Hello,',
      '',
      'A new form has been submitted on your website. Details below.',
      '',
      'Business',
      '',
      'Nova Kingdom Rentals',
      '',
      'InquiryType',
      '',
      'Availability request only - booking not guaranteed until manually confirmed',
      '',
      'Name',
      '',
      'Nova Kingdom',
      '',
      'EventDate',
      '',
      '2026-05-28',
      '',
      'EventAddress',
      '',
      '119 lakeview circle',
      '',
      'EventType',
      '',
      'School event',
      '',
      'Guests',
      '',
      'PackageInterest',
      '',
      'Crown Dino Combo',
      '',
      'Phone',
      '',
      '9023996167',
      '',
      'Email',
      '',
      'booknovakingdom@gmail.com',
      '',
      'PreferredContact',
      '',
      'Notes',
      '',
      'Visitor IP: 1.2.3.4'
    ].join('\n');

    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assert('RealBody: result is non-null', result !== null);
    assertEqual('RealBody: name',          result.name,          'Nova Kingdom');
    assertEqual('RealBody: email',         result.email,         'booknovakingdom@gmail.com');
    assertEqual('RealBody: phone',         result.phone,         '9023996167');
    assertEqual('RealBody: event_date',    result.event_date,    '2026-05-28');
    assertEqual('RealBody: event_address', result.event_address, '119 lakeview circle');
    assertEqual('RealBody: event_type',    result.event_type,    'School event');
    assertEqual('RealBody: rental_item',   result.rental_item,   'Crown Dino Combo');
    assertEqual('RealBody: guest_count blank', result.guest_count,       '');
    assertEqual('RealBody: preferred_contact blank', result.extra && result.extra['preferred_contact'], undefined);
    assertEqual('RealBody: message blank', result.message, '');

    // parseDebug must show email label was detected
    var dbg = ContactFormParser.parseDebug(body, 'New Nova Kingdom Rentals Booking Inquiry');
    assert('RealBody: email label detected by parseDebug', dbg.emailDetected);
    assertEqual('RealBody: email value from parseDebug', dbg.emailValue, 'booknovakingdom@gmail.com');

    // Safety: customer email must NOT be a web3forms address
    assert('RealBody: extracted email is not web3forms sender',
      !ContactFormParser.isWeb3FormsNotifySender(result.email));

    // Validate draft recipient is safe
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('RealBody: draft validation passes for real customer email', check.valid);
  }

  // ─── Test REAL (inline): exact body format confirmed from live Gmail ────────
  // Web3Forms sends camelCase key  :  value pairs on a single line.
  // Empty fields (guests  :) must stay blank and must NOT swallow next field.

  function testParser_realGmailBodyInline() {
    var body = [
      'business  : Nova Kingdom Rentals',
      'inquiryType  : Availability request only - booking not guaranteed until manually confirmed',
      'name  : Nova Kingdom',
      'eventDate  : 2026-05-28',
      'eventAddress  : 119 lakeview circle',
      'eventType  : School event',
      'guests  :',
      'packageInterest  : Crown Dino Combo',
      'phone  : 9023996167',
      'email  : booknovakingdom@gmail.com',
      'preferredContact  :',
      'notes  :'
    ].join('\n');

    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assert('Inline: result is non-null', result !== null);
    assertEqual('Inline: name',          result.name,          'Nova Kingdom');
    assertEqual('Inline: email',         result.email,         'booknovakingdom@gmail.com');
    assertEqual('Inline: phone',         result.phone,         '9023996167');
    assertEqual('Inline: event_date',    result.event_date,    '2026-05-28');
    assertEqual('Inline: event_address', result.event_address, '119 lakeview circle');
    assertEqual('Inline: event_type',    result.event_type,    'School event');
    assertEqual('Inline: rental_item',   result.rental_item,   'Crown Dino Combo');
    assertEqual('Inline: guest_count blank',   result.guest_count, '');
    assertEqual('Inline: message blank',       result.message,     '');

    // parseDebug must detect email label and report inline format
    var dbg = ContactFormParser.parseDebug(body, 'New Nova Kingdom Rentals Booking Inquiry');
    assert('Inline: emailDetected by parseDebug',     dbg.emailDetected);
    assertEqual('Inline: emailValue from parseDebug', dbg.emailValue, 'booknovakingdom@gmail.com');
    var emailEntry = dbg.labelsFound.filter(function(l){ return l.normKey === 'email'; })[0];
    assert('Inline: email label detected as inline format', emailEntry && emailEntry.format === 'inline');

    // Safety checks
    assert('Inline: email is not web3forms sender',
      !ContactFormParser.isWeb3FormsNotifySender(result.email));
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Inline: draft validation passes', check.valid);
  }

  // ─── Test A: Separate-line format with blank lines between pairs ──────────
  // This is the real production format sent by Web3Forms.

  function testParser_A_separateLineWithBlankLines() {
    var body = [
      'Business',
      'Nova Kingdom Rentals',
      '',
      'InquiryType',
      'Birthday Party',
      '',
      'Name',
      'Jane Smith',
      '',
      'EventDate',
      'July 19, 2026',
      '',
      'EventAddress',
      '45 Maple Street, Bridgewater NS',
      '',
      'Guests',
      '25',
      '',
      'PackageInterest',
      'Crown Island Combo',
      '',
      'Phone',
      '902-555-0123',
      '',
      'Email',
      'jane.smith@example.com',
      '',
      'Notes',
      "Fun birthday party for kids!"
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assert('Test-A: result is non-null', result !== null);
    assertEqual('Test-A: name parsed across blank lines', result.name, 'Jane Smith');
    assertEqual('Test-A: email parsed across blank lines', result.email, 'jane.smith@example.com');
    assertEqual('Test-A: event_date parsed across blank lines', result.event_date, 'July 19, 2026');
    assertEqual('Test-A: event_address parsed', result.event_address, '45 Maple Street, Bridgewater NS');
    assertEqual('Test-A: rental_item from PackageInterest', result.rental_item, 'Crown Island Combo');
    assertEqual('Test-A: guest_count', result.guest_count, '25');
  }

  // ─── Test B: Separate-line format with blank optional fields ─────────────

  function testParser_B_separateLineWithMissingOptionalFields() {
    var body = [
      'Business',
      'Nova Kingdom Rentals',
      '',
      'Name',
      'Alice Brown',
      '',
      'Email',
      'alice@example.com',
      '',
      'Phone',
      '',
      '',
      'EventDate',
      'August 5, 2026',
      '',
      'EventAddress',
      '10 River Road, Chester NS',
      '',
      'PackageInterest',
      'Crown Axe Challenge',
      '',
      'Notes',
      'No specific notes.'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-B: name parsed', result.name, 'Alice Brown');
    assertEqual('Test-B: email parsed', result.email, 'alice@example.com');
    assertEqual('Test-B: event_date parsed', result.event_date, 'August 5, 2026');
    // Phone is blank — parser skips it, field should be empty string
    assert('Test-B: blank phone field does not break parser', result.phone === '' || result.phone === undefined);
    assertEqual('Test-B: rental_item parsed', result.rental_item, 'Crown Axe Challenge');
  }

  // ─── Test C: Colon format ("Label: Value" on one line) ────────────────────

  function testParser_C_colonFormat() {
    var body = [
      'Name : Sam Wilson',
      'Email : sam@example.com',
      'Phone : 902-111-2222',
      'Event Date : September 1, 2026',
      'Event Address : 99 Pine St, Lunenburg NS',
      'Rental Items : Crown Kick Darts',
      'Guest Count : 40',
      'Message : Outdoor school event'
    ].join('\n');
    var result = ContactFormParser.parse(body, 'Booking Inquiry');
    assertEqual('Test-C: name', result.name, 'Sam Wilson');
    assertEqual('Test-C: email', result.email, 'sam@example.com');
    assertEqual('Test-C: rental_item', result.rental_item, 'Crown Kick Darts');
    assertEqual('Test-C: event_address', result.event_address, '99 Pine St, Lunenburg NS');
  }

  // ─── Test D: Mixed format (colon labels in a separate-line body) ──────────
  // Some values contain colons (e.g. time "3:00 PM"). Parser must not split on them.

  function testParser_D_valueContainingColon() {
    var body = [
      'Business',
      'Nova Kingdom Rentals',
      '',
      'Name',
      'Chris Lee',
      '',
      'Email',
      'chris@example.com',
      '',
      'StartTime',
      '2:00 PM',
      '',
      'EndTime',
      '6:00 PM',
      '',
      'PackageInterest',
      '360 Video Booth'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-D: start_time with colon in value', result.start_time, '2:00 PM');
    assertEqual('Test-D: end_time with colon in value', result.end_time, '6:00 PM');
    assertEqual('Test-D: rental_item = 360 Video Booth', result.rental_item, '360 Video Booth');
  }

  // ─── Test E: Missing email in form body ───────────────────────────────────

  function testParser_E_missingEmail() {
    var body = [
      'Name',
      'Ghost User',
      '',
      'Phone',
      '902-000-0000',
      '',
      'EventDate',
      'October 1, 2026'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-E: email is empty when not provided', result.email, '');
    assertEqual('Test-E: name still parsed', result.name, 'Ghost User');
  }

  // ─── Test F: Invalid email format ─────────────────────────────────────────

  function testParser_F_invalidEmail() {
    var result = ContactFormParser.parseNkrWebsiteBooking(
      ['Name', 'Bad Email User', '', 'Email', 'notanemail'].join('\n')
    );
    // Parser captures it — the intake worker validates email has '@'
    assert('Test-F: parser captures value even if invalid format', result.email === 'notanemail');
    // Validate utility correctly rejects it
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Test-F: validateRequiredForDraft rejects email without @', !check.valid);
    assert('Test-F: missing_customer_email issue reported', check.issues.indexOf('missing_customer_email') !== -1);
  }

  // ─── Test G: Web3Forms notify sender — customer email in body ─────────────

  function testParser_G_web3formsNotifySender_validBodyEmail() {
    var body = ['Name', 'Bob Jones', '', 'Email', 'bob@example.com', '',
                'EventDate', 'August 10, 2026', '', 'PackageInterest', 'Crown Dino Combo'].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-G: customer email comes from body', result.email, 'bob@example.com');
    assert('Test-G: body email is not a web3forms address',
      !ContactFormParser.isWeb3FormsNotifySender(result.email));

    // Simulate the intake worker's email resolution
    var gmailSender    = 'notify+xyz@web3forms.com';
    var customerEmail  = '';
    if (result.email && result.email.indexOf('@') !== -1 &&
        !ContactFormParser.isWeb3FormsNotifySender(result.email)) {
      customerEmail = result.email;
    }
    assertEqual('Test-G: worker uses body email, not gmail sender', customerEmail, 'bob@example.com');
    assert('Test-G: gmail sender is blocked', ContactFormParser.isWeb3FormsNotifySender(gmailSender));
  }

  // ─── Test H: Web3Forms notify sender — no email in body ──────────────────

  function testParser_H_web3formsNotifySender_noBodyEmail() {
    var body = ['Name', 'Unknown Person', '', 'EventDate', 'August 10, 2026'].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-H: email is empty', result.email, '');

    // Simulate intake worker — both body email and gmail sender are invalid
    var gmailSender   = 'notify+xyz@web3forms.com';
    var customerEmail = '';
    if (result.email && result.email.indexOf('@') !== -1 &&
        !ContactFormParser.isWeb3FormsNotifySender(result.email)) {
      customerEmail = result.email;
    }
    if (!customerEmail && !ContactFormParser.isWeb3FormsNotifySender(gmailSender)) {
      customerEmail = gmailSender;
    }
    assertEqual('Test-H: no valid customer email found', customerEmail, '');
    // Correct outcome: route to NEEDS_REVIEW, no draft created
  }

  // ─── Test I: Crown Quest must NOT match Crown Rush 42 ────────────────────

  function testMatchUnit_I_crownQuestNotCrownRush42() {
    var units = _mockUnits();
    var u = _matchUnit('Crown Quest', units);
    assert('Test-I: Crown Quest returns a match', u !== null);
    assert('Test-I: Crown Quest returns Crown Quest, not Crown Rush 42',
      u === null || u.unit_name === 'Crown Quest');
    assert('Test-I: Crown Quest unit_id is nkr-U-002',
      u === null || u.unit_id === 'nkr-U-002');
  }

  // ─── Test J: Crown Dino Combo matches correctly ───────────────────────────

  function testMatchUnit_J_crownDinoCombo() {
    var units = _mockUnits();
    var u = _matchUnit('Crown Dino Combo', units);
    assert('Test-J: Crown Dino Combo matches', u !== null);
    assertEqual('Test-J: Crown Dino Combo unit_id', u && u.unit_id, 'nkr-U-005');
  }

  // ─── Test K: 360 Video Booth matches correctly ────────────────────────────

  function testMatchUnit_K_360VideoBooth() {
    var units = _mockUnits();
    var u = _matchUnit('360 Video Booth', units);
    assert('Test-K: 360 Video Booth matches', u !== null);
    assertEqual('Test-K: 360 Video Booth unit_id', u && u.unit_id, 'nkr-U-360');
  }

  // ─── Test L: Unresolved placeholders block draft creation ────────────────

  function testContactFormParser_L_unresolvedPlaceholdersBlockDraft() {
    var cleanBody   = 'Hi Jane, your event is July 19. Please confirm you need Crown Quest.';
    var bracketBody = 'Hi Jane, your event date is [EVENT_DATE]. Items: [QUOTE_LINE_ITEMS].';
    var curlyBody   = 'Hi {{first_name}}, your event is {{event_date}}.';
    var undefinedBody = 'Your booking: undefined items for null guests.';

    assertEqual('Test-L: clean body has no placeholders',
      ContactFormParser.containsUnresolvedPlaceholders(cleanBody).length, 0);

    var bracketTokens = ContactFormParser.containsUnresolvedPlaceholders(bracketBody);
    assert('Test-L: [EVENT_DATE] detected', bracketTokens.indexOf('[EVENT_DATE]') !== -1);
    assert('Test-L: [QUOTE_LINE_ITEMS] detected', bracketTokens.indexOf('[QUOTE_LINE_ITEMS]') !== -1);

    var curlyTokens = ContactFormParser.containsUnresolvedPlaceholders(curlyBody);
    assert('Test-L: {{first_name}} detected', curlyTokens.indexOf('{{first_name}}') !== -1);
    assert('Test-L: {{event_date}} detected', curlyTokens.indexOf('{{event_date}}') !== -1);

    var undefTokens = ContactFormParser.containsUnresolvedPlaceholders(undefinedBody);
    assert('Test-L: standalone undefined detected', undefTokens.indexOf('undefined') !== -1);
    assert('Test-L: standalone null detected', undefTokens.indexOf('null') !== -1);
  }

  // ─── Test M: Complete quote form fields — draft validation passes ──────────

  function testContactFormParser_M_completeQuoteFormDraftValidation() {
    var body = [
      'Name', 'Maria Gonzalez', '', 'Email', 'maria@example.com', '',
      'Phone', '902-333-4444', '', 'EventDate', 'July 25, 2026', '',
      'EventAddress', '55 Kings Way, Bridgewater NS', '',
      'PackageInterest', 'Crown Island Combo', '', 'Guests', '30'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    var check  = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Test-M: complete form passes draft validation', check.valid);
    assertEqual('Test-M: no issues', check.issues.length, 0);
    assertEqual('Test-M: email extracted', result.email, 'maria@example.com');
    assertEqual('Test-M: rental_item extracted', result.rental_item, 'Crown Island Combo');
    assertEqual('Test-M: event_date extracted', result.event_date, 'July 25, 2026');
  }

  // ─── Test N: Missing event date — parser captures what's there ────────────
  // The draft builder adds event_date to missing_fields; AI uses ask_once mode.

  function testContactFormParser_N_missingEventDate() {
    var body = [
      'Name', 'Dave Park', '', 'Email', 'dave@example.com', '',
      'PackageInterest', 'Crown Kick Darts', '', 'Guests', '20'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-N: name parsed', result.name, 'Dave Park');
    assertEqual('Test-N: event_date is empty when not provided', result.event_date, '');
    assertEqual('Test-N: rental_item parsed', result.rental_item, 'Crown Kick Darts');
    // Draft validation still passes if email is valid — the missing_fields list
    // is passed to AI so it asks only for what is missing
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Test-N: valid email still passes draft validation gate', check.valid);
  }

  // ─── Test O: Missing rental item — parser captures what's there ───────────

  function testContactFormParser_O_missingRentalItem() {
    var body = [
      'Name', 'Sara Chen', '', 'Email', 'sara@example.com', '',
      'EventDate', 'August 20, 2026', '', 'EventAddress', '5 Oak Ave, Mahone Bay NS'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-O: rental_item empty when not provided', result.rental_item, '');
    assertEqual('Test-O: event_date parsed', result.event_date, 'August 20, 2026');
    // Intake worker will set mode=ask_once and add rental_item to missing_fields
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Test-O: valid email passes gate; missing item handled by AI mode', check.valid);
  }

  // ─── Test P: General inquiry (no rental item or date) ─────────────────────

  function testContactFormParser_P_generalInquiry() {
    var body = [
      'Name', 'Tom Baker', '', 'Email', 'tom@example.com', '',
      'Notes', 'Just wondering what you offer for school events.'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Test-P: name parsed', result.name, 'Tom Baker');
    assertEqual('Test-P: email parsed', result.email, 'tom@example.com');
    assertEqual('Test-P: rental_item empty', result.rental_item, '');
    assertEqual('Test-P: event_date empty', result.event_date, '');
    assertEqual('Test-P: message captured', result.message, 'Just wondering what you offer for school events.');
    // Email is valid — routing decision is up to AI classification (general_question)
    var check = ContactFormParser.validateRequiredForDraft(result, result.email);
    assert('Test-P: general inquiry with valid email passes gate', check.valid);
  }

  // ─── Web3Forms footer stripping ───────────────────────────────────────────

  function testParser_footerStripped() {
    var body = [
      'Name',
      'Footer Test User',
      '',
      'Email',
      'footer@example.com',
      '',
      'Visitor IP: 1.2.3.4',
      'Report Spam: https://web3forms.com/spam',
      'This e-mail was sent from a contact form on Nova Kingdom Rentals'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('Footer: name parsed before footer', result.name, 'Footer Test User');
    assertEqual('Footer: email parsed before footer', result.email, 'footer@example.com');
    // Footer lines should not appear as parsed fields
    assert('Footer: visitor_ip not in result', result.extra['visitor_ip'] === undefined);
  }

  // ─── Multi-line Notes parsing ─────────────────────────────────────────────

  function testParser_multilineNotes() {
    var body = [
      'Name',
      'Multiline User',
      '',
      'Email',
      'multi@example.com',
      '',
      'Notes',
      'First line of notes.',
      'Second line of notes.',
      'Third line.'
    ].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assert('MultilineNotes: message contains all three lines joined',
      result.message && result.message.indexOf('First line') !== -1 &&
      result.message.indexOf('Second line') !== -1 &&
      result.message.indexOf('Third line') !== -1);
  }

  // ─── isWeb3FormsNotifySender ──────────────────────────────────────────────

  function testParser_isWeb3FormsNotifySender() {
    assert('W3F: notify+xyz@web3forms.com is blocked',
      ContactFormParser.isWeb3FormsNotifySender('notify+xyz@web3forms.com'));
    assert('W3F: anyname@web3forms.com is blocked',
      ContactFormParser.isWeb3FormsNotifySender('admin@web3forms.com'));
    assert('W3F: no-reply@ prefix is blocked',
      ContactFormParser.isWeb3FormsNotifySender('no-reply@somesite.com'));
    assert('W3F: noreply@ prefix is blocked',
      ContactFormParser.isWeb3FormsNotifySender('noreply@somesite.com'));
    assert('W3F: real customer email is NOT blocked',
      !ContactFormParser.isWeb3FormsNotifySender('customer@gmail.com'));
    assert('W3F: business email is NOT blocked',
      !ContactFormParser.isWeb3FormsNotifySender('booknovakingdom@gmail.com'));
  }

  // ─── validateRequiredForDraft ─────────────────────────────────────────────

  function testParser_validateRequiredForDraft() {
    var parsed = {};
    var r1 = ContactFormParser.validateRequiredForDraft(parsed, 'customer@example.com');
    assert('ValidateDraft: valid email passes', r1.valid);

    var r2 = ContactFormParser.validateRequiredForDraft(parsed, '');
    assert('ValidateDraft: empty email fails', !r2.valid);
    assert('ValidateDraft: missing_customer_email issue', r2.issues.indexOf('missing_customer_email') !== -1);

    var r3 = ContactFormParser.validateRequiredForDraft(parsed, 'notify+abc@web3forms.com');
    assert('ValidateDraft: web3forms notify email fails', !r3.valid);
    assert('ValidateDraft: web3forms_notify_email_as_recipient issue',
      r3.issues.indexOf('web3forms_notify_email_as_recipient') !== -1);

    var r4 = ContactFormParser.validateRequiredForDraft(parsed, 'noemail');
    assert('ValidateDraft: email without @ fails', !r4.valid);
  }

  // ─── ContactFormParser legacy tests ──────────────────────────────────────

  function testContactFormParser_nkrWebsiteBooking() {
    var body = [
      'Business',
      'Nova Kingdom Rentals',
      'InquiryType',
      'Birthday Party',
      'Name',
      'Jane Smith',
      'EventDate',
      'July 19, 2026',
      'EventAddress',
      '45 Maple Street, Bridgewater NS',
      'EventType',
      'Kids Birthday',
      'Guests',
      '25',
      'PackageInterest',
      'Crown Quest',
      'Phone',
      '902-555-0123',
      'Email',
      'jane.smith@example.com',
      'PreferredContact',
      'Email',
      'Notes',
      'Looking for something fun!'
    ].join('\n');
    var result = ContactFormParser.parse(body, 'New Nova Kingdom Rentals Booking Inquiry');
    assert('NKR-C: result non-null', result !== null);
    assertEqual('NKR-C: form_type', result.form_type, 'nkr_website_booking');
    assertEqual('NKR-C: name', result.name, 'Jane Smith');
    assertEqual('NKR-C: email from body', result.email, 'jane.smith@example.com');
    assertEqual('NKR-C: event_date', result.event_date, 'July 19, 2026');
    assertEqual('NKR-C: rental_item from PackageInterest', result.rental_item, 'Crown Quest');
    assertEqual('NKR-C: guest_count from Guests', result.guest_count, '25');
    assertEqual('NKR-C: message from Notes', result.message, 'Looking for something fun!');
  }

  function testContactFormParser_nkrWebsiteBooking_emailFromBody() {
    var body = ['Name', 'Bob Jones', 'Email', 'bob@example.com', 'Phone', '902-555-9999',
                'EventDate', 'August 10, 2026', 'EventAddress', '12 Oak Ave',
                'PackageInterest', 'Crown Dino Combo'].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('NKR-C: customer email from body not notify sender', result.email, 'bob@example.com');
    assert('NKR-C: result.email is not a web3forms address',
      !ContactFormParser.isWeb3FormsNotifySender(result.email));
  }

  function testContactFormParser_firstName() {
    assertEqual('firstName: extracts first word', ContactFormParser.firstName('Jane Smith'), 'Jane');
    assertEqual('firstName: handles single name', ContactFormParser.firstName('Harkirat'), 'Harkirat');
    assertEqual('firstName: handles empty', ContactFormParser.firstName(''), '');
  }

  // ─── TemplateRenderer Tests ───────────────────────────────────────────────

  function testTemplateRenderer_render() {
    var template = 'Hi {{first_name}}, your quote total is {{quote_total}}.';
    var vars = { first_name: 'Jane', quote_total: '$240.00' };
    var result = TemplateRenderer.render(template, vars);
    assertEqual('TemplateRenderer: substitutes known placeholders', result,
      'Hi Jane, your quote total is $240.00.');
  }

  function testTemplateRenderer_missingPlaceholder() {
    var template = 'Hi {{first_name}}, date: {{event_date}}.';
    var result = TemplateRenderer.render(template, { first_name: 'Jane' });
    assert('TemplateRenderer: missing placeholder renders as [EVENT_DATE]',
      result.indexOf('[EVENT_DATE]') !== -1);
  }

  function testTemplateRenderer_forbiddenPhrases() {
    var clean = 'Thanks for your interest in our inflatables!';
    var bad   = 'As an AI language model, I cannot confirm availability.';
    assertEqual('TemplateRenderer: clean draft has no forbidden phrases',
      TemplateRenderer.checkForbiddenPhrases(clean).length, 0);
    assert('TemplateRenderer: AI disclosure phrase detected',
      TemplateRenderer.checkForbiddenPhrases(bad).length > 0);
  }

  // ─── _matchUnit Tests ─────────────────────────────────────────────────────

  function _mockUnits() {
    return {
      'nkr-U-001': { unit_id: 'nkr-U-001', unit_name: 'Crown Rush 42',         base_price: 450, default_hours: 4, status: 'coming_soon' },
      'nkr-U-002': { unit_id: 'nkr-U-002', unit_name: 'Crown Quest',            base_price: 240, default_hours: 4, status: 'active'      },
      'nkr-U-003': { unit_id: 'nkr-U-003', unit_name: 'Crown Cascade',          base_price: 260, default_hours: 4, status: 'active'      },
      'nkr-U-004': { unit_id: 'nkr-U-004', unit_name: 'Crown Island Combo',     base_price: 310, default_hours: 8, status: 'active'      },
      'nkr-U-005': { unit_id: 'nkr-U-005', unit_name: 'Crown Dino Combo',       base_price: 210, default_hours: 8, status: 'active'      },
      'nkr-U-006': { unit_id: 'nkr-U-006', unit_name: 'Crown Kick Darts',       base_price: 160, default_hours: 8, status: 'active'      },
      'nkr-U-007': { unit_id: 'nkr-U-007', unit_name: 'Crown Axe Challenge',    base_price: 180, default_hours: 8, status: 'active'      },
      'nkr-U-008': { unit_id: 'nkr-U-008', unit_name: 'Crown Carnival Challenge',base_price: 270, default_hours: 8, status: 'active'     },
      'nkr-U-360': { unit_id: 'nkr-U-360', unit_name: '360 Video Booth',        base_price: 249, default_hours: 1, status: 'active'      }
    };
  }

  function testMatchUnit_exactMatch() {
    var u = _matchUnit('Crown Quest', _mockUnits());
    assert('_matchUnit: exact Crown Quest returns match', u !== null);
    assertEqual('_matchUnit: exact match unit_id', u && u.unit_id, 'nkr-U-002');
  }

  function testMatchUnit_crownQuestDoesNotMatchCrownRush42() {
    var u = _matchUnit('Crown Quest', _mockUnits());
    assert('_matchUnit: Crown Quest does NOT return Crown Rush 42',
      u === null || u.unit_id !== 'nkr-U-001');
  }

  function testMatchUnit_comingSoonExcluded() {
    var u = _matchUnit('Crown Rush 42', _mockUnits());
    assert('_matchUnit: coming_soon unit is never returned', u === null);
  }

  function testMatchUnit_substringInNeedle() {
    var u = _matchUnit('Crown Dino Combo for toddlers', _mockUnits());
    assert('_matchUnit: full unit name substring match returns correct unit', u !== null);
    assertEqual('_matchUnit: substring match unit_id', u && u.unit_id, 'nkr-U-005');
  }

  function testMatchUnit_nullOrEmpty() {
    assert('_matchUnit: null returns null',  _matchUnit(null, _mockUnits())  === null);
    assert('_matchUnit: empty returns null', _matchUnit('',   _mockUnits()) === null);
  }

  function testMatchUnit_360VideoBooth() {
    var u = _matchUnit('360 Video Booth', _mockUnits());
    assert('_matchUnit: 360 Video Booth matches', u !== null);
    assertEqual('_matchUnit: 360 Video Booth unit_id', u && u.unit_id, 'nkr-U-360');
  }

  function testMatchUnit_crownCarnivalChallenge() {
    var u = _matchUnit('Crown Carnival Challenge', _mockUnits());
    assert('_matchUnit: Crown Carnival Challenge matches', u !== null);
    assertEqual('_matchUnit: Crown Carnival Challenge unit_id', u && u.unit_id, 'nkr-U-008');
  }

  function testMatchUnit_crownIslandCombo() {
    var u = _matchUnit('Crown Island Combo', _mockUnits());
    assert('_matchUnit: Crown Island Combo matches', u !== null);
    assertEqual('_matchUnit: Crown Island Combo unit_id', u && u.unit_id, 'nkr-U-004');
  }

  // ─── Subject placeholder sanitization ────────────────────────────────────

  function testSubjectPlaceholder_bookingIdStripped() {
    var template = 'Nova Kingdom Rentals Quote — {{booking_id}}';
    var rendered = TemplateRenderer.render(template, { booking_id: '' });
    var subject = rendered
      .replace(/\s*[-—]\s*\[[A-Z_]+\]/g, '')
      .replace(/\[[A-Z_]+\]\s*[-—]?\s*/g, '')
      .trim();
    assertEqual('Subject: [BOOKING_ID] stripped leaving clean title',
      subject, 'Nova Kingdom Rentals Quote');
    assert('Subject: no bracket tokens remain', subject.indexOf('[') === -1);
  }

  // ─── Validators — context bundle ──────────────────────────────────────────

  function testValidators_contextBundle() {
    var good = { tenant_id: 'nkr', message_id: 'MSG-001', sender_email: 'a@b.com', thread_summary: 'test' };
    var bad  = { tenant_id: 'nkr', message_id: 'MSG-001' };
    assert('Validators: complete context bundle passes', Validators.validateContextBundle(good).valid);
    assert('Validators: incomplete bundle fails', !Validators.validateContextBundle(bad).valid);
  }

  // ─── InquiryState module guard ────────────────────────────────────────────

  function testInquiryState_moduleApi() {
    assert('InquiryState: module defined', typeof InquiryState !== 'undefined');
    assert('InquiryState: get is a function', typeof InquiryState.get === 'function');
    assert('InquiryState: upsert is a function', typeof InquiryState.upsert === 'function');
    assert('InquiryState: STAGES defined', typeof InquiryState.STAGES === 'object');
    assert('InquiryState: STAGES.NEW_INQUIRY defined', !!InquiryState.STAGES.NEW_INQUIRY);
    assert('InquiryState: STAGES.AWAITING_MISSING_INFO defined', !!InquiryState.STAGES.AWAITING_MISSING_INFO);
    assert('InquiryState: STAGES.READY_FOR_OWNER_REVIEW defined', !!InquiryState.STAGES.READY_FOR_OWNER_REVIEW);
    assert('InquiryState: STAGES.QUOTE_DRAFT_READY defined', !!InquiryState.STAGES.QUOTE_DRAFT_READY);
  }

  // ─── _detectMissingFields tests ───────────────────────────────────────────

  function testDetectMissingFields_emptyParsed() {
    var missing = _detectMissingFields({});
    assert('MissingFields: event_date missing when blank', missing.indexOf('event_date') !== -1);
    assert('MissingFields: event_address missing when blank', missing.indexOf('event_address') !== -1);
    assert('MissingFields: rental_item missing when blank', missing.indexOf('rental_item') !== -1);
    assert('MissingFields: guest_count missing when blank', missing.indexOf('guest_count') !== -1);
    assert('MissingFields: setup_surface missing when blank', missing.indexOf('setup_surface') !== -1);
    assert('MissingFields: power_access missing when blank', missing.indexOf('power_access') !== -1);
  }

  function testDetectMissingFields_allCriticalPresent() {
    var parsed = {
      event_date: 'July 19, 2026', event_address: '45 Maple St', rental_item: 'Crown Quest',
      guest_count: '25', start_time: '10:00 AM', setup_surface: 'grass', power_access: 'yes'
    };
    var missing = _detectMissingFields(parsed);
    assert('MissingFields: event_date not missing', missing.indexOf('event_date') === -1);
    assert('MissingFields: event_address not missing', missing.indexOf('event_address') === -1);
    assert('MissingFields: rental_item not missing', missing.indexOf('rental_item') === -1);
    assert('MissingFields: guest_count not missing', missing.indexOf('guest_count') === -1);
    assert('MissingFields: returns empty or short array', missing.length === 0);
  }

  function testDetectMissingFields_partiallyFilled() {
    var parsed = {
      event_date: 'August 5, 2026', event_address: '', rental_item: 'Crown Dino Combo',
      guest_count: '', start_time: '', setup_surface: '', power_access: ''
    };
    var missing = _detectMissingFields(parsed);
    assert('MissingFields: event_address in missing', missing.indexOf('event_address') !== -1);
    assert('MissingFields: guest_count in missing', missing.indexOf('guest_count') !== -1);
    assert('MissingFields: event_date NOT in missing (provided)', missing.indexOf('event_date') === -1);
    assert('MissingFields: rental_item NOT in missing (provided)', missing.indexOf('rental_item') === -1);
  }

  function testDetectMissingFields_waterItemAddsWaterAccess() {
    var parsed = { event_date: 'June 1', event_address: '10 St', rental_item: 'Water Splash Zone',
                   guest_count: '20', start_time: '11am', setup_surface: 'grass', power_access: 'yes',
                   water_access: '' };
    var missing = _detectMissingFields(parsed);
    assert('MissingFields: water_access added for water item', missing.indexOf('water_access') !== -1);
  }

  function testDetectMissingFields_nonWaterItemNoWaterAccess() {
    var parsed = { event_date: 'June 1', event_address: '10 St', rental_item: 'Crown Quest',
                   guest_count: '20', start_time: '11am', setup_surface: 'grass', power_access: 'yes' };
    var missing = _detectMissingFields(parsed);
    assert('MissingFields: water_access NOT added for non-water item', missing.indexOf('water_access') === -1);
  }

  // ─── _buildFirstResponseBody tests ───────────────────────────────────────

  function testFirstResponseBody_containsEventDetailsHeader() {
    var body = _buildFirstResponseBody('Jane', { event_date: 'July 1' }, ['event_address']);
    assert('FirstResponse: contains "event details we received"',
      body.toLowerCase().indexOf('event details we received') !== -1);
  }

  function testFirstResponseBody_showsProvidedEventDate() {
    var body = _buildFirstResponseBody('Jane',
      { event_date: 'July 19, 2026', event_address: '45 Maple St', rental_item: 'Crown Quest',
        guest_count: '25', setup_surface: 'grass', power_access: 'yes', start_time: '10am' }, []);
    assert('FirstResponse: provided event_date appears in body', body.indexOf('July 19, 2026') !== -1);
    assert('FirstResponse: provided event_address appears in body', body.indexOf('45 Maple St') !== -1);
    assert('FirstResponse: provided rental_item appears in body', body.indexOf('Crown Quest') !== -1);
  }

  function testFirstResponseBody_showsNotProvidedForBlanks() {
    var body = _buildFirstResponseBody('Jane', {}, ['event_date', 'event_address', 'rental_item']);
    assert('FirstResponse: shows "Not provided" for missing fields', body.indexOf('Not provided') !== -1);
  }

  function testFirstResponseBody_listsMissingQuestions() {
    var missing = ['event_date', 'setup_surface'];
    var body = _buildFirstResponseBody('Jane', {}, missing);
    assert('FirstResponse: asks event_date question',
      body.indexOf('What date is your event') !== -1);
    assert('FirstResponse: asks setup_surface question',
      body.toLowerCase().indexOf('surface') !== -1);
  }

  function testFirstResponseBody_noMissingFieldsNoQuestions() {
    var body = _buildFirstResponseBody('Jane',
      { event_date: 'July 1', event_address: '45 St', rental_item: 'Crown Quest',
        guest_count: '20', start_time: '10am', setup_surface: 'grass', power_access: 'yes' }, []);
    assert('FirstResponse: no numbered questions when all present',
      body.indexOf('1.') === -1);
    assert('FirstResponse: says will prepare quote',
      body.toLowerCase().indexOf('preliminary quote') !== -1);
  }

  function testFirstResponseBody_noBookingConfirmation() {
    var body = _buildFirstResponseBody('Jane', {}, ['event_date']);
    var lower = body.toLowerCase();
    assert('FirstResponse: no "booking is confirmed"', lower.indexOf('booking is confirmed') === -1);
    assert('FirstResponse: no "you are booked"', lower.indexOf('you are booked') === -1);
    assert('FirstResponse: no "we guarantee availability"', lower.indexOf('we guarantee availability') === -1);
    assert('FirstResponse: says "not a booking confirmation"',
      lower.indexOf('not a booking confirmation') !== -1);
  }

  function testFirstResponseBody_noAvailabilityGuarantee() {
    var body = _buildFirstResponseBody('Jane', {}, []);
    var lower = body.toLowerCase();
    assert('FirstResponse: no "guarantee availability"', lower.indexOf('guarantee availability') === -1);
    assert('FirstResponse: no "availability confirmed"', lower.indexOf('availability confirmed') === -1);
    assert('FirstResponse: uses "will review availability"',
      lower.indexOf('will review availability') !== -1);
  }

  function testFirstResponseBody_passesCheckForbiddenPhrases() {
    var body = _buildFirstResponseBody('Jane',
      { event_date: 'July 1', event_address: '10 St', rental_item: 'Crown Quest' }, ['guest_count']);
    var hits = TemplateRenderer.checkForbiddenPhrases(body);
    assertEqual('FirstResponse: passes forbidden phrase check', hits.length, 0);
  }

  // ─── _buildFollowUpBody tests ─────────────────────────────────────────────

  function testFollowUpBody_doesNotRepeatFullChecklist() {
    var body = _buildFollowUpBody('Jane', ['setup_surface']);
    var lower = body.toLowerCase();
    assert('FollowUp: does NOT contain "event details we received"',
      lower.indexOf('event details we received') === -1);
    assert('FollowUp: does NOT list all event fields',
      lower.indexOf('event date:') === -1);
  }

  function testFollowUpBody_onlyAsksMissingFields() {
    var body = _buildFollowUpBody('Jane', ['setup_surface', 'power_access']);
    assert('FollowUp: asks setup_surface', body.toLowerCase().indexOf('surface') !== -1);
    assert('FollowUp: asks power_access', body.toLowerCase().indexOf('power') !== -1);
    assert('FollowUp: does NOT ask event_date', body.indexOf('What date is your event') === -1);
  }

  function testFollowUpBody_noRemainingMissing() {
    var body = _buildFollowUpBody('Jane', []);
    assert('FollowUp: no numbered questions when nothing missing', body.indexOf('1.') === -1);
    assert('FollowUp: says will prepare quote', body.toLowerCase().indexOf('preliminary quote') !== -1);
  }

  function testFollowUpBody_noBookingConfirmation() {
    var body = _buildFollowUpBody('Jane', ['setup_surface']);
    var lower = body.toLowerCase();
    assert('FollowUp: no "booking is confirmed"', lower.indexOf('booking is confirmed') === -1);
    assert('FollowUp: no "guarantee availability"', lower.indexOf('guarantee availability') === -1);
  }

  function testFollowUpBody_passesCheckForbiddenPhrases() {
    var body = _buildFollowUpBody('Jane', ['event_date', 'setup_surface']);
    var hits = TemplateRenderer.checkForbiddenPhrases(body);
    assertEqual('FollowUp: passes forbidden phrase check', hits.length, 0);
  }

  // ─── ReviewQueue module guard ─────────────────────────────────────────────

  function testReviewQueue_moduleApi() {
    assert('ReviewQueue: module is defined', typeof ReviewQueue !== 'undefined');
    assert('ReviewQueue: enqueue is a function', typeof ReviewQueue.enqueue === 'function');
  }

  // ─── DraftQueue module guard ──────────────────────────────────────────────

  function testDraftQueue_moduleApi() {
    assert('DraftQueue: module is defined', typeof DraftQueue !== 'undefined');
    assert('DraftQueue: enqueue is a function', typeof DraftQueue.enqueue === 'function');
  }

  // ─── ExecutionEnv live-gate safety tests ──────────────────────────────────

  function testExecutionEnv_liveGatePreventsLiveDraftsByDefault() {
    // Init with live config but do NOT call allowLiveGmailDrafts()
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
    assert('ExecutionEnv live gate: wouldCreateLiveDraft=false without allowLiveGmailDrafts',
      ExecutionEnv.wouldCreateLiveDraft() === false);
    // Restore safe state
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: true, auto_draft_enabled: false }, TENANT.TENANT_ID);
  }

  function testExecutionEnv_allowLiveGmailDraftsUnlocksGate() {
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
    ExecutionEnv.allowLiveGmailDrafts();
    assert('ExecutionEnv live gate: wouldCreateLiveDraft=true after allowLiveGmailDrafts',
      ExecutionEnv.wouldCreateLiveDraft() === true);
    // Restore safe state
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: true, auto_draft_enabled: false }, TENANT.TENANT_ID);
  }

  function testExecutionEnv_initResetsLiveGate() {
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
    ExecutionEnv.allowLiveGmailDrafts();
    // Re-init should reset the gate
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: false, auto_draft_enabled: true }, TENANT.TENANT_ID);
    assert('ExecutionEnv live gate: re-init resets to false',
      ExecutionEnv.wouldCreateLiveDraft() === false);
    // Restore safe state
    ExecutionEnv.init(TENANT.SPREADSHEET_ID,
      { simulation_mode: true, auto_draft_enabled: false }, TENANT.TENANT_ID);
  }

  // ─── Test Runner ──────────────────────────────────────────────────────────

  function testAll() {
    _results = [];

    // QuoteEngine
    testQuoteEngine_basicSingleUnit();
    testQuoteEngine_travelFee();
    testQuoteEngine_cardSurcharge();
    testQuoteEngine_discountRequiresApproval();
    testQuoteEngine_smallDiscountNoApproval();
    testQuoteEngine_priceBlockContainsAllAmounts();

    // RiskEvaluator
    testRiskEvaluator_blocklist();
    testRiskEvaluator_lowConfidence();
    testRiskEvaluator_cleanContext();
    testRiskEvaluator_draftPriceGrounding();

    // Validators
    testValidators_quoteReadiness();
    testValidators_aiOutputValidation();
    testValidators_contextBundle();

    // BookingLifecycle
    testBookingLifecycle_validTransitions();

    // ContactFormParser — real Gmail body (production regression tests)
    testParser_realGmailBody();
    testParser_realGmailBodyInline();

    // ContactFormParser — legacy
    testContactFormParser_bookingInquiry();
    testContactFormParser_assistantInquiry();
    testContactFormParser_unknownSubject();
    testContactFormParser_nkrWebsiteBooking();
    testContactFormParser_nkrWebsiteBooking_emailFromBody();
    testContactFormParser_firstName();

    // ContactFormParser — broad matrix (Tests A–P)
    testParser_A_separateLineWithBlankLines();
    testParser_B_separateLineWithMissingOptionalFields();
    testParser_C_colonFormat();
    testParser_D_valueContainingColon();
    testParser_E_missingEmail();
    testParser_F_invalidEmail();
    testParser_G_web3formsNotifySender_validBodyEmail();
    testParser_H_web3formsNotifySender_noBodyEmail();
    testContactFormParser_L_unresolvedPlaceholdersBlockDraft();
    testContactFormParser_M_completeQuoteFormDraftValidation();
    testContactFormParser_N_missingEventDate();
    testContactFormParser_O_missingRentalItem();
    testContactFormParser_P_generalInquiry();
    testParser_footerStripped();
    testParser_multilineNotes();
    testParser_isWeb3FormsNotifySender();
    testParser_validateRequiredForDraft();

    // _matchUnit — Tests I, J, K + full set
    testMatchUnit_exactMatch();
    testMatchUnit_I_crownQuestNotCrownRush42();
    testMatchUnit_J_crownDinoCombo();
    testMatchUnit_K_360VideoBooth();
    testMatchUnit_crownQuestDoesNotMatchCrownRush42();
    testMatchUnit_comingSoonExcluded();
    testMatchUnit_substringInNeedle();
    testMatchUnit_nullOrEmpty();
    testMatchUnit_360VideoBooth();
    testMatchUnit_crownCarnivalChallenge();
    testMatchUnit_crownIslandCombo();

    // TemplateRenderer
    testTemplateRenderer_render();
    testTemplateRenderer_missingPlaceholder();
    testTemplateRenderer_forbiddenPhrases();

    // InquiryState module guard
    testInquiryState_moduleApi();

    // _detectMissingFields
    testDetectMissingFields_emptyParsed();
    testDetectMissingFields_allCriticalPresent();
    testDetectMissingFields_partiallyFilled();
    testDetectMissingFields_waterItemAddsWaterAccess();
    testDetectMissingFields_nonWaterItemNoWaterAccess();

    // _buildFirstResponseBody
    testFirstResponseBody_containsEventDetailsHeader();
    testFirstResponseBody_showsProvidedEventDate();
    testFirstResponseBody_showsNotProvidedForBlanks();
    testFirstResponseBody_listsMissingQuestions();
    testFirstResponseBody_noMissingFieldsNoQuestions();
    testFirstResponseBody_noBookingConfirmation();
    testFirstResponseBody_noAvailabilityGuarantee();
    testFirstResponseBody_passesCheckForbiddenPhrases();

    // _buildFollowUpBody
    testFollowUpBody_doesNotRepeatFullChecklist();
    testFollowUpBody_onlyAsksMissingFields();
    testFollowUpBody_noRemainingMissing();
    testFollowUpBody_noBookingConfirmation();
    testFollowUpBody_passesCheckForbiddenPhrases();

    // ReviewQueue / DraftQueue module guards
    testReviewQueue_moduleApi();
    testDraftQueue_moduleApi();

    // ExecutionEnv live-gate safety
    testExecutionEnv_liveGatePreventsLiveDraftsByDefault();
    testExecutionEnv_allowLiveGmailDraftsUnlocksGate();
    testExecutionEnv_initResetsLiveGate();

    // Subject placeholder
    testSubjectPlaceholder_bookingIdStripped();

    var passed = _results.filter(function (r) { return r.passed; }).length;
    var total  = _results.length;
    var failed = _results.filter(function (r) { return !r.passed; });

    var summary = 'TestHarness: ' + passed + '/' + total + ' tests passed.';
    if (failed.length) {
      summary += '\nFailed:\n' + failed.map(function (r) { return '  ✗ ' + r.description; }).join('\n');
    }
    console.log(summary);
    Logger.log(summary);
    return { passed: passed, total: total, failed: failed };
  }

  return {
    testAll:     testAll,
    assert:      assert,
    assertEqual: assertEqual
  };
})();
