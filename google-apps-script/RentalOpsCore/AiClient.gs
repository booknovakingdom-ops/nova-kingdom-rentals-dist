/**
 * AiClient — RentalOps Core Library
 *
 * Thin wrapper around the Anthropic Claude API via UrlFetchApp.
 * API key must be stored in Script Properties under the key name
 * specified in TENANT.ANTHROPIC_KEY_PROPERTY.
 *
 * Two calls only:
 *   classify() — AI Call #1: intent + readiness + action decision (Haiku, JSON only)
 *   draftReply() — AI Call #2: polish a pre-rendered scaffold (Sonnet)
 *
 * Both calls enforce JSON output at the prompt level. If parsing fails,
 * the error is returned as a structured failure — callers route to MANUAL_REVIEW.
 */

var AiClient = (function () {

  var API_URL = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2023-06-01';

  function _apiKey(keyPropertyName) {
    var key = PropertiesService.getScriptProperties().getProperty(keyPropertyName);
    if (!key) throw new Error('AiClient: API key not found in Script Properties: ' + keyPropertyName);
    return key;
  }

  function _call(model, systemPrompt, userContent, maxTokens, keyPropertyName) {
    var payload = {
      model: model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-api-key': _apiKey(keyPropertyName),
        'anthropic-version': API_VERSION
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(API_URL, options);
    var code = response.getResponseCode();
    var raw  = response.getContentText();
    if (code !== 200) {
      throw new Error('AiClient: API error ' + code + ': ' + raw.slice(0, 200));
    }
    var parsed = JSON.parse(raw);
    return parsed.content && parsed.content[0] ? parsed.content[0].text : '';
  }

  /**
   * AI Call #1 — classify intent, readiness, and action decision.
   *
   * Returns a structured result object. On parse failure, returns
   * { error: true, raw: '...', decision: 'manual_review' }.
   *
   * @param {Object} contextBundle   Pre-built context bundle (will be JSON-stringified)
   * @param {string} model           e.g. controls.ai_model_classify
   * @param {string} keyPropertyName Script Properties key for API key
   * @returns {Object}
   */
  function classify(contextBundle, model, keyPropertyName) {
    var systemPrompt = [
      'You are a booking classification engine for a party inflatable rental business.',
      'You receive a structured context bundle describing an inbound customer message.',
      '',
      'Respond ONLY with a valid JSON object. No prose. No markdown. No explanation.',
      'The JSON must have exactly these fields:',
      '  intent: one of [quote_or_availability, school_or_community_event,',
      '    existing_booking_question, customer_inquiry, deposit_or_payment,',
      '    agreement_or_waiver, customer_thank_you, negotiation_or_discount,',
      '    reschedule_existing_booking, cancellation_request, referral_introduction,',
      '    out_of_office_autoreply, abusive, legal_threat, injury_incident, non_business]',
      '  readiness: one of [new, engaged, quoted, negotiating, booked, paid, completed, dormant, dnc]',
      '  confidence: number 0.0–1.0',
      '  missing_fields: array of strings (fields needed for a quote that are absent)',
      '  risk_signals: array of strings (anything unusual or concerning)',
      '  decision: one of [draft, no_draft, status_only, manual_review]',
      '  mode: one of [acknowledge, quote, logistics, ask_once, escalate]',
      '  reason: one sentence explaining the decision',
      '',
      'Rules:',
      '- NEVER invent prices or dates — those come from the context bundle only',
      '- If confidence < 0.75 set decision = manual_review',
      '- If intent is out_of_office_autoreply set decision = no_draft',
      '- If intent is legal_threat or injury_incident set decision = manual_review and mode = escalate',
      '- If customer_thank_you set decision = status_only',
      '- For quote mode: only if event_date AND event_address AND rental_item are all present',
      '- If any required quote field is missing: mode = ask_once, list only the single most important missing field',
    ].join('\n');

    var userContent = JSON.stringify(contextBundle);
    var raw = _call(model, systemPrompt, userContent, 512, keyPropertyName);

    try {
      // Strip any accidental markdown fences
      var cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      return { error: true, raw: raw.slice(0, 500), decision: 'manual_review',
               mode: 'escalate', reason: 'AI output could not be parsed as JSON', confidence: 0 };
    }
  }

  /**
   * AI Call #2 — polish a pre-rendered draft scaffold.
   *
   * The scaffold already contains all facts (prices, dates, names) filled in by
   * TemplateRenderer. AI's only job is to improve sentence flow and warmth
   * without changing any facts.
   *
   * Returns the polished body text string, or throws on API error.
   *
   * @param {string} scaffold        Rendered template body (from TemplateRenderer.render)
   * @param {Object} contextBundle   Used for grounding constraints
   * @param {string} model           e.g. controls.ai_model_draft
   * @param {string} keyPropertyName Script Properties key for API key
   * @returns {string}
   */
  function draftReply(scaffold, contextBundle, model, keyPropertyName) {
    var systemPrompt = [
      'You are polishing a pre-written customer email reply for a party inflatable rental business.',
      'The scaffold below already contains all correct facts: names, prices, dates, totals.',
      '',
      'Your ONLY job: improve sentence flow, warmth, and natural tone.',
      'You must NOT change any facts, prices, dates, or action items.',
      'You must NOT add any information not in the scaffold.',
      'You must NOT mention AI, language models, or automation.',
      'You must NOT add HST or any taxes.',
      'You must NOT invent or change any dollar amounts.',
      'The reply must sound like it came from Harkirat personally — warm, direct, human.',
      '',
      'Return ONLY the polished email body. No subject line. No explanation. No markdown.',
      'The reply must end with the signature already present in the scaffold.',
    ].join('\n');

    var userContent = 'Scaffold to polish:\n\n' + scaffold;
    return _call(model, systemPrompt, userContent, 1024, keyPropertyName);
  }

  return {
    classify:   classify,
    draftReply: draftReply
  };
})();
