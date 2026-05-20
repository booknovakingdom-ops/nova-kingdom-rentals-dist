/**
 * QuoteEngine — RentalOps Core Library
 *
 * Pure deterministic function. No I/O. No API calls. No sheet reads.
 * All inputs are passed in. Fully unit-testable with mock data.
 *
 * Input:  QuoteInput object (see typedef below)
 * Output: QuoteResult object with full line-item breakdown
 *
 * QuoteInput {
 *   tenantId:          string
 *   lineItems:         Array<{ unitId: string, unitName: string, basePrice: number, hours: number }>
 *   distanceKm:        number   (0 if local)
 *   attendantHours:    number   (0 if none)
 *   paymentMethod:     string   ('cash' | 'etransfer' | 'credit_card')
 *   extensionRequested: boolean
 *   discountPct:       number   (0–1, e.g. 0.10 = 10%)
 *   sillyStringDamage: boolean
 *   businessProfile:   object   (from ConfigLoader.getBusinessProfile)
 *   pricingRules:      Array    (from ConfigLoader.getPricingRules)
 * }
 *
 * QuoteResult {
 *   tenantId:         string
 *   lineItems:        Array<{ unitId, unitName, basePrice, hours, lineTotal }>
 *   subtotal:         number
 *   travelFee:        number
 *   chargeableKm:     number
 *   attendantFee:     number
 *   extensionFee:     number
 *   sillyStringFee:   number
 *   discountAmount:   number
 *   discountPct:      number
 *   requiresApproval: boolean
 *   approvalReasons:  Array<string>
 *   processingFee:    number
 *   quoteTotal:       number
 *   depositAmount:    number
 *   balanceDue:       number
 *   priceBlock:       Array<number>   (all valid $ amounts — used by post-AI grounding check)
 *   warnings:         Array<string>
 * }
 */

var QuoteEngine = (function () {

  function calculate(input) {
    var bp = input.businessProfile;
    var rules = input.pricingRules;
    var result = {
      tenantId:         input.tenantId,
      lineItems:        [],
      subtotal:         0,
      travelFee:        0,
      chargeableKm:     0,
      attendantFee:     0,
      extensionFee:     0,
      sillyStringFee:   0,
      discountAmount:   0,
      discountPct:      input.discountPct || 0,
      requiresApproval: false,
      approvalReasons:  [],
      processingFee:    0,
      quoteTotal:       0,
      depositAmount:    0,
      balanceDue:       0,
      priceBlock:       [],
      warnings:         []
    };

    // 1. Line items
    input.lineItems.forEach(function (item) {
      var lineTotal = item.basePrice;
      result.lineItems.push({
        unitId:    item.unitId,
        unitName:  item.unitName,
        basePrice: item.basePrice,
        hours:     item.hours,
        lineTotal: lineTotal
      });
      result.subtotal += lineTotal;
      result.priceBlock.push(lineTotal);
    });

    // 2. Travel fee
    var distanceKm = input.distanceKm || 0;
    var freeKm = bp.free_travel_km || 15;
    result.chargeableKm = Math.max(0, distanceKm - freeKm);
    if (result.chargeableKm > 0) {
      result.travelFee = _round2(result.chargeableKm * (bp.travel_fee_per_km || 0.72));
    }

    // 3. Extension fee
    if (input.extensionRequested && (bp.extension_fee || 0) > 0) {
      result.extensionFee = bp.extension_fee;
    }

    // 4. Attendant fee
    if (input.attendantHours > 0) {
      result.attendantFee = _round2(input.attendantHours * (bp.attendant_rate_hr || 35));
    }

    // 5. Silly string damage fee
    if (input.sillyStringDamage && (bp.silly_string_fee || 0) > 0) {
      result.sillyStringFee = bp.silly_string_fee;
    }

    // 6. Pre-surcharge total
    var preSurchargeTotal = result.subtotal
      + result.travelFee
      + result.extensionFee
      + result.attendantFee
      + result.sillyStringFee;

    // 7. Discount (applied before surcharge)
    var discountPct = result.discountPct || 0;
    if (discountPct > 0) {
      result.discountAmount = _round2(preSurchargeTotal * discountPct);
      preSurchargeTotal = _round2(preSurchargeTotal - result.discountAmount);
      if (discountPct > (bp.min_discount_approval || 0.10)) {
        result.requiresApproval = true;
        result.approvalReasons.push('Discount of ' + (discountPct * 100).toFixed(0) + '% exceeds the ' + ((bp.min_discount_approval || 0.10) * 100).toFixed(0) + '% approval threshold');
      }
    }

    // 8. Card surcharge (applied after discount, on total)
    if (input.paymentMethod === 'credit_card' || input.paymentMethod === 'card') {
      result.processingFee = _round2(preSurchargeTotal * (bp.card_surcharge_rate || 0.05));
    }

    result.quoteTotal = _round2(preSurchargeTotal + result.processingFee);

    // 9. Deposit and balance
    result.depositAmount = _round2(result.quoteTotal * (bp.deposit_rate || 0.30));
    result.balanceDue    = _round2(result.quoteTotal - result.depositAmount);

    // 10. HST guard
    if (bp.hst_registered) {
      result.warnings.push('ATTENTION: Business profile shows hst_registered = true. Confirm HST treatment before sending quote.');
    }

    // 11. Build full price block for grounding validation
    // Include all $ amounts that are valid to appear in any AI-generated draft
    if (result.travelFee > 0)     result.priceBlock.push(result.travelFee);
    if (result.attendantFee > 0)  result.priceBlock.push(result.attendantFee);
    if (result.extensionFee > 0)  result.priceBlock.push(result.extensionFee);
    if (result.discountAmount > 0) result.priceBlock.push(result.discountAmount);
    if (result.processingFee > 0) result.priceBlock.push(result.processingFee);
    result.priceBlock.push(result.quoteTotal, result.depositAmount, result.balanceDue);
    // Deduplicate
    result.priceBlock = result.priceBlock.filter(function (v, i, a) { return a.indexOf(v) === i; });

    return result;
  }

  function _round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Formats a QuoteResult into human-readable line items string for template rendering.
   */
  function formatLineItems(quoteResult, currency) {
    var sym = currency === 'CAD' ? '$' : '$';
    return quoteResult.lineItems.map(function (item) {
      return item.unitName + ': ' + sym + item.lineTotal.toFixed(2);
    }).join('\n');
  }

  return {
    calculate:       calculate,
    formatLineItems: formatLineItems
  };
})();
