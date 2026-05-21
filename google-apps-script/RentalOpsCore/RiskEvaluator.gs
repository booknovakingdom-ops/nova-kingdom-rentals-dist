/**
 * RiskEvaluator — RentalOps Core Library
 *
 * Evaluates all active risk rules from Config_RiskRules against a
 * Context Bundle (pre-AI) and AI output (post-AI).
 *
 * Returns the highest-severity matching rule's action, or null if none match.
 * All matching rules are returned for logging — only the highest-severity
 * action is applied.
 */

var RiskEvaluator = (function () {

  var SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

  /**
   * Evaluate rules against a combined evaluation context.
   *
   * @param {Array}  rules    Active risk rules from ConfigLoader.getRiskRules()
   * @param {Object} ctx      Flat key-value object containing all evaluable fields.
   *                          Merges: context bundle + AI output + derived flags.
   *                          E.g. { intent, confidence, sender_email,
   *                                 last_sender_is_business, customer_do_not_contact,
   *                                 draft_contains_unlisted_price, ... }
   * @returns {{ triggered: Array, worstAction: string|null, worstSeverity: string|null, notifyOwner: boolean }}
   */
  function evaluate(rules, ctx) {
    var triggered = [];
    rules.forEach(function (rule) {
      if (_matches(rule, ctx)) triggered.push(rule);
    });

    if (!triggered.length) {
      return { triggered: [], worstAction: null, worstSeverity: null, notifyOwner: false };
    }

    triggered.sort(function (a, b) {
      return (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    });

    var worst = triggered[0];
    var notifyOwner = triggered.some(function (r) { return r.notify_owner; });

    return {
      triggered:     triggered,
      worstAction:   worst.risk_action,
      worstSeverity: worst.severity,
      notifyOwner:   notifyOwner
    };
  }

  function _matches(rule, ctx) {
    var field = rule.condition_field;
    var op    = rule.condition_operator;
    var val   = rule.condition_value;
    var ctxVal = ctx[field];

    switch (op) {
      case 'eq':
        return String(ctxVal) === String(val);
      case 'in':
        return val.split(',').map(function (v) { return v.trim(); }).indexOf(String(ctxVal)) !== -1;
      case 'contains':
        return ctxVal && String(ctxVal).toLowerCase().indexOf(String(val).toLowerCase()) !== -1;
      case 'lt':
        return Number(ctxVal) < Number(val);
      case 'lte':
        return Number(ctxVal) <= Number(val);
      case 'is_true':
        return ctxVal === true || ctxVal === 'true' || ctxVal === 'TRUE';
      case 'is_false':
        return ctxVal === false || ctxVal === 'false' || ctxVal === 'FALSE';
      default:
        return false;
    }
  }

  /**
   * Validates that all $ amounts in a draft body exist in the quoteResult.priceBlock.
   * Returns true if a hallucinated price is found (risk rule nkr-RR-010 trigger).
   */
  function draftContainsUnlistedPrice(draftBody, priceBlock) {
    if (!draftBody) return false;
    var dollarAmounts = draftBody.match(/\$[\d,]+\.?\d*/g) || [];
    return dollarAmounts.some(function (match) {
      var num = parseFloat(match.replace(/[$,]/g, ''));
      return priceBlock.indexOf(num) === -1;
    });
  }

  return {
    evaluate:                   evaluate,
    draftContainsUnlistedPrice: draftContainsUnlistedPrice
  };
})();
