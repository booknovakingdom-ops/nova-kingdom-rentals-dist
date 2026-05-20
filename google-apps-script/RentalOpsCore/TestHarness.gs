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
