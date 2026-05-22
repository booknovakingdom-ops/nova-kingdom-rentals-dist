/**
 * TestHarness — RentalOps Core Library
 *
 * Lightweight unit test runner for Apps Script. No external test framework needed.
 * Run testAll() from the Apps Script editor to validate the full library.
 *
 * All QuoteEngine tests run without any sheet I/O — mock data passed directly.
 * RiskEvaluator tests similarly use mock rule arrays.
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

  // ─── ContactFormParser Tests ──────────────────────────────────────────────

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
    assertEqual('ContactFormParser: form_type = booking_inquiry', result.form_type, 'booking_inquiry');
    assertEqual('ContactFormParser: name parsed', result.name, 'Jane Smith');
    assertEqual('ContactFormParser: email parsed', result.email, 'jane.smith@example.com');
    assertEqual('ContactFormParser: phone parsed', result.phone, '902-555-0123');
    assertEqual('ContactFormParser: event_date parsed', result.event_date, 'July 19, 2026');
    assertEqual('ContactFormParser: rental_item parsed', result.rental_item, 'Crown Quest');
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
    assertEqual('ContactFormParser: assistant form_type', result.form_type, 'assistant_inquiry');
    assertEqual('ContactFormParser: event_type parsed', result.event_type, 'Birthday Party');
    assertEqual('ContactFormParser: budget parsed', result.budget, '$500');
    assertEqual('ContactFormParser: event_address from location', result.event_address, '12 Oak Ave, Lunenburg NS');
  }

  function testContactFormParser_unknownSubject() {
    var result = ContactFormParser.parse('Name : Test', 'Some Other Form');
    assert('ContactFormParser: unknown subject returns null', result === null);
  }

  // Real production form: "New Nova Kingdom Rentals Booking Inquiry"
  // Body format: label on one line, value on the next line (Web3Forms separate-line format)
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
      "Looking for something fun!"
    ].join('\n');
    var result = ContactFormParser.parse(body, 'New Nova Kingdom Rentals Booking Inquiry');
    assert('ContactFormParser: nkr website form returns non-null', result !== null);
    assertEqual('ContactFormParser: nkr form_type', result.form_type, 'nkr_website_booking');
    assertEqual('ContactFormParser: nkr name', result.name, 'Jane Smith');
    assertEqual('ContactFormParser: nkr email from body', result.email, 'jane.smith@example.com');
    assertEqual('ContactFormParser: nkr phone', result.phone, '902-555-0123');
    assertEqual('ContactFormParser: nkr event_date', result.event_date, 'July 19, 2026');
    assertEqual('ContactFormParser: nkr event_address', result.event_address, '45 Maple Street, Bridgewater NS');
    assertEqual('ContactFormParser: nkr rental_item from PackageInterest', result.rental_item, 'Crown Quest');
    assertEqual('ContactFormParser: nkr guest_count from Guests', result.guest_count, '25');
    assertEqual('ContactFormParser: nkr message from Notes', result.message, 'Looking for something fun!');
  }

  // Verify that parsed.email comes from form body — the Gmail sender is Web3Forms notify address
  function testContactFormParser_nkrWebsiteBooking_emailFromBody() {
    var body = ['Name', 'Bob Jones', 'Email', 'bob@example.com', 'Phone', '902-555-9999',
                'EventDate', 'August 10, 2026', 'EventAddress', '12 Oak Ave',
                'PackageInterest', 'Crown Dino Combo'].join('\n');
    var result = ContactFormParser.parseNkrWebsiteBooking(body);
    assertEqual('ContactFormParser: customer email from form body not notify sender',
      result.email, 'bob@example.com');
    // Caller must use result.email, not the Gmail sender (notify+...@web3forms.com)
    assert('ContactFormParser: result.email is not a web3forms address',
      result.email.indexOf('web3forms.com') === -1);
  }

  function testContactFormParser_firstName() {
    assertEqual('ContactFormParser: firstName extracts first word', ContactFormParser.firstName('Jane Smith'), 'Jane');
    assertEqual('ContactFormParser: firstName handles single name', ContactFormParser.firstName('Harkirat'), 'Harkirat');
    assertEqual('ContactFormParser: firstName handles empty', ContactFormParser.firstName(''), '');
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
  // _matchUnit is defined in nk-contact-intake.js and is global in GAS.
  // These tests use a mock units map identical to the real inventory.

  function _mockUnits() {
    return {
      'nkr-U-001': { unit_id: 'nkr-U-001', unit_name: 'Crown Rush 42',     base_price: 450, default_hours: 4, status: 'coming_soon' },
      'nkr-U-002': { unit_id: 'nkr-U-002', unit_name: 'Crown Quest',        base_price: 240, default_hours: 4, status: 'active'      },
      'nkr-U-003': { unit_id: 'nkr-U-003', unit_name: 'Crown Cascade',      base_price: 260, default_hours: 4, status: 'active'      },
      'nkr-U-005': { unit_id: 'nkr-U-005', unit_name: 'Crown Dino Combo',   base_price: 210, default_hours: 4, status: 'active'      },
      'nkr-U-007': { unit_id: 'nkr-U-007', unit_name: 'Crown Axe Challenge',base_price: 180, default_hours: 4, status: 'active'      }
    };
  }

  function testMatchUnit_exactMatch() {
    var u = _matchUnit('Crown Quest', _mockUnits());
    assert('_matchUnit: exact "Crown Quest" returns Crown Quest', u !== null);
    assertEqual('_matchUnit: exact match unit_id', u && u.unit_id, 'nkr-U-002');
  }

  function testMatchUnit_crownQuestDoesNotMatchCrownRush42() {
    // Bug fix: first-word-only matching used to make "Crown Quest" match "Crown Rush 42"
    // because both start with "Crown". Verify the fix.
    var u = _matchUnit('Crown Quest', _mockUnits());
    assert('_matchUnit: Crown Quest does NOT return Crown Rush 42',
      u === null || u.unit_id !== 'nkr-U-001');
  }

  function testMatchUnit_comingSoonExcluded() {
    // Crown Rush 42 is coming_soon — must never be returned
    var u = _matchUnit('Crown Rush 42', _mockUnits());
    assert('_matchUnit: coming_soon unit is never returned', u === null);
  }

  function testMatchUnit_substringInNeedle() {
    // Needle contains full unit name
    var u = _matchUnit('Crown Dino Combo for toddlers', _mockUnits());
    assert('_matchUnit: full unit name substring match returns correct unit', u !== null);
    assertEqual('_matchUnit: substring match unit_id', u && u.unit_id, 'nkr-U-005');
  }

  function testMatchUnit_nullOrEmpty() {
    assert('_matchUnit: null returns null',  _matchUnit(null, _mockUnits())  === null);
    assert('_matchUnit: empty returns null', _matchUnit('',   _mockUnits()) === null);
  }

  // ─── Subject placeholder sanitization ────────────────────────────────────

  function testSubjectPlaceholder_bookingIdStripped() {
    // When no booking_id is in vars, TemplateRenderer.render returns "[BOOKING_ID]"
    // The worker strips this before creating the draft subject.
    var template = 'Nova Kingdom Rentals Quote — {{booking_id}}';
    var rendered = TemplateRenderer.render(template, { booking_id: '' });
    // Simulate the worker's post-render sanitization
    var subject = rendered
      .replace(/\s*[-—]\s*\[[A-Z_]+\]/g, '')
      .replace(/\[[A-Z_]+\]\s*[-—]?\s*/g, '')
      .trim();
    assertEqual('Subject: [BOOKING_ID] stripped leaving clean title',
      subject, 'Nova Kingdom Rentals Quote');
    assert('Subject: no bracket tokens remain', subject.indexOf('[') === -1);
  }

  // ─── Validators — AI output ───────────────────────────────────────────────

  function testValidators_contextBundle() {
    var good = { tenant_id: 'nkr', message_id: 'MSG-001', sender_email: 'a@b.com', thread_summary: 'test' };
    var bad  = { tenant_id: 'nkr', message_id: 'MSG-001' };
    assert('Validators: complete context bundle passes', Validators.validateContextBundle(good).valid);
    assert('Validators: incomplete bundle fails', !Validators.validateContextBundle(bad).valid);
  }

  // ─── Runner ───────────────────────────────────────────────────────────────

  function testAll() {
    _results = [];
    testQuoteEngine_basicSingleUnit();
    testQuoteEngine_travelFee();
    testQuoteEngine_cardSurcharge();
    testQuoteEngine_discountRequiresApproval();
    testQuoteEngine_smallDiscountNoApproval();
    testQuoteEngine_priceBlockContainsAllAmounts();
    testRiskEvaluator_blocklist();
    testRiskEvaluator_lowConfidence();
    testRiskEvaluator_cleanContext();
    testRiskEvaluator_draftPriceGrounding();
    testValidators_quoteReadiness();
    testValidators_aiOutputValidation();
    testBookingLifecycle_validTransitions();
    testContactFormParser_bookingInquiry();
    testContactFormParser_assistantInquiry();
    testContactFormParser_unknownSubject();
    testContactFormParser_nkrWebsiteBooking();
    testContactFormParser_nkrWebsiteBooking_emailFromBody();
    testContactFormParser_firstName();
    testMatchUnit_exactMatch();
    testMatchUnit_crownQuestDoesNotMatchCrownRush42();
    testMatchUnit_comingSoonExcluded();
    testMatchUnit_substringInNeedle();
    testMatchUnit_nullOrEmpty();
    testSubjectPlaceholder_bookingIdStripped();
    testTemplateRenderer_render();
    testTemplateRenderer_missingPlaceholder();
    testTemplateRenderer_forbiddenPhrases();
    testValidators_contextBundle();

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
    testAll: testAll,
    assert:  assert,
    assertEqual: assertEqual
  };
})();
