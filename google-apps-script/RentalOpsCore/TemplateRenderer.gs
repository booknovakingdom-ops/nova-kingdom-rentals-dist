/**
 * TemplateRenderer — RentalOps Core Library
 *
 * Populates {{placeholder}} variables in message templates with values
 * from the Context Bundle and QuoteResult. AI draft call receives the
 * rendered scaffold — not a blank prompt — which constrains hallucination.
 *
 * Rendering is code-only. AI polishes tone only; it must not change facts.
 */

var TemplateRenderer = (function () {

  /**
   * Render a template body by substituting {{placeholder}} tokens.
   *
   * @param {string} templateBody   Raw template from Config_MessageTemplates
   * @param {Object} vars           Key-value map of substitution variables
   * @returns {string}              Rendered body with all tokens replaced
   */
  function render(templateBody, vars) {
    if (!templateBody) return '';
    return templateBody.replace(/\{\{(\w+)\}\}/g, function (match, key) {
      var val = vars[key];
      if (val === undefined || val === null || val === '') {
        return '[' + key.toUpperCase() + ']'; // Unresolved placeholder is visible
      }
      return String(val);
    });
  }

  /**
   * Builds the standard variable map from a Context Bundle and QuoteResult.
   * All $ amounts come from QuoteResult — never from AI output.
   *
   * @param {Object} contextBundle    Pre-built context bundle
   * @param {Object} quoteResult      Output of QuoteEngine.calculate() or null
   * @param {Object} businessProfile  Output of ConfigLoader.getBusinessProfile()
   * @returns {Object}                Variables map for render()
   */
  function buildVars(contextBundle, quoteResult, businessProfile) {
    var customer = contextBundle.customer || {};
    var booking  = contextBundle.booking  || {};
    var vars = {
      first_name:           customer.first_name || customer.name || '',
      customer_name:        customer.name        || '',
      email:                customer.email       || '',
      phone:                customer.phone       || '',
      event_date:           booking.event_date   || contextBundle.event_date || '',
      event_address:        booking.event_address || contextBundle.event_address || '',
      booking_id:           booking.booking_id   || contextBundle.booking_id || '',
      duration_hours:       booking.duration_hours || '',
      school_name:          contextBundle.organization_name || '',
      missing_field_question: contextBundle.missing_field_question || '',
      cancellation_reason:  contextBundle.cancellation_reason || '',
      payment_instructions: businessProfile.payment_instructions || 'e-transfer to booknovakingdom@gmail.com, or by credit card (+5% surcharge)',
      google_review_url:    businessProfile.google_review_url || ''
    };

    if (quoteResult) {
      vars.quote_line_items   = _formatLineItems(quoteResult);
      vars.travel_fee         = quoteResult.travelFee > 0     ? '$' + quoteResult.travelFee.toFixed(2)    : 'Included';
      vars.attendant_line     = quoteResult.attendantFee > 0  ? 'Attendant: $' + quoteResult.attendantFee.toFixed(2) + '\n' : '';
      vars.subtotal           = '$' + quoteResult.subtotal.toFixed(2);
      vars.card_surcharge_line = quoteResult.processingFee > 0 ? 'Card surcharge (5%): $' + quoteResult.processingFee.toFixed(2) + '\n' : '';
      vars.quote_total        = '$' + quoteResult.quoteTotal.toFixed(2);
      vars.deposit_amount     = '$' + quoteResult.depositAmount.toFixed(2);
      vars.balance_due        = '$' + quoteResult.balanceDue.toFixed(2);
    }

    return vars;
  }

  function _formatLineItems(quoteResult) {
    return quoteResult.lineItems.map(function (item) {
      return item.unitName + ': $' + item.lineTotal.toFixed(2);
    }).join('\n');
  }

  /**
   * Validates a rendered body for forbidden phrases.
   * Returns array of violations (empty = clean).
   */
  var FORBIDDEN_PHRASES = [
    'as an ai',
    'as an artificial intelligence',
    'i am a language model',
    'i cannot confirm',
    'i do not have access',
    'my training data',
    'hst',
    'tax'
  ];

  function checkForbiddenPhrases(body) {
    if (!body) return [];
    var lower = body.toLowerCase();
    return FORBIDDEN_PHRASES.filter(function (phrase) {
      return lower.indexOf(phrase) !== -1;
    });
  }

  return {
    render:               render,
    buildVars:            buildVars,
    checkForbiddenPhrases: checkForbiddenPhrases
  };
})();
