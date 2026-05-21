/**
 * Validators — RentalOps Core Library
 *
 * Input validation at system boundaries: email body parsing, context bundle
 * completeness checks, and AI output structure validation.
 *
 * Validation failures return structured error objects — they do not throw.
 * Callers decide whether to route to MANUAL_REVIEW or abort.
 */

var Validators = (function () {

  /**
   * Validate a parsed email context has the minimum fields for quote generation.
   * Returns { valid: bool, missingFields: Array<string> }
   */
  function quoteReadinessCheck(parsedEmail) {
    var required = ['event_date', 'event_address', 'rental_item'];
    var missing = required.filter(function (f) {
      return !parsedEmail[f] || String(parsedEmail[f]).trim() === '';
    });
    return { valid: missing.length === 0, missingFields: missing };
  }

  /**
   * Validate the structure of AI Call #1 output (action decision).
   * Returns { valid: bool, errors: Array<string> }
   */
  function validateAiActionDecision(raw) {
    var errors = [];
    if (!raw || typeof raw !== 'object') {
      return { valid: false, errors: ['AI output is not an object'] };
    }
    var required = ['intent', 'readiness', 'confidence', 'decision', 'mode', 'reason'];
    required.forEach(function (f) {
      if (raw[f] === undefined || raw[f] === null || raw[f] === '') {
        errors.push('Missing required field: ' + f);
      }
    });
    if (raw.confidence !== undefined) {
      var conf = Number(raw.confidence);
      if (isNaN(conf) || conf < 0 || conf > 1) {
        errors.push('confidence must be a number 0–1, got: ' + raw.confidence);
      }
    }
    var validDecisions = ['draft', 'no_draft', 'status_only', 'manual_review'];
    if (raw.decision && validDecisions.indexOf(raw.decision) === -1) {
      errors.push('Invalid decision value: ' + raw.decision);
    }
    var validModes = ['acknowledge', 'quote', 'logistics', 'ask_once', 'escalate'];
    if (raw.mode && validModes.indexOf(raw.mode) === -1) {
      errors.push('Invalid mode value: ' + raw.mode);
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Validate a Context Bundle has the minimum structure before sending to AI.
   */
  function validateContextBundle(bundle) {
    var errors = [];
    if (!bundle.tenant_id)      errors.push('Missing tenant_id');
    if (!bundle.message_id)     errors.push('Missing message_id');
    if (!bundle.sender_email)   errors.push('Missing sender_email');
    if (!bundle.thread_summary) errors.push('Missing thread_summary');
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * Validate an email address format.
   */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  /**
   * Validate a date string is parseable and in the future.
   * Returns { valid: bool, parsed: Date|null, error: string|null }
   */
  function validateFutureDate(dateStr) {
    if (!dateStr) return { valid: false, parsed: null, error: 'No date provided' };
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return { valid: false, parsed: null, error: 'Cannot parse date: ' + dateStr };
    if (d < new Date()) return { valid: false, parsed: d, error: 'Event date is in the past: ' + dateStr };
    return { valid: true, parsed: d, error: null };
  }

  return {
    quoteReadinessCheck:      quoteReadinessCheck,
    validateAiActionDecision: validateAiActionDecision,
    validateContextBundle:    validateContextBundle,
    isValidEmail:             isValidEmail,
    validateFutureDate:       validateFutureDate
  };
})();
