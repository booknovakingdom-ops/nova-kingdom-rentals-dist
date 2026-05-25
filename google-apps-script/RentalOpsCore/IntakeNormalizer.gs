/**
 * IntakeNormalizer — RentalOps Core Library
 *
 * Channel-agnostic inquiry normalizer.
 * Converts channel-specific raw payloads into a standard normalized object
 * used throughout the intake pipeline for routing, validation, and queue writes.
 *
 * Supported normalizers:
 *   normalizeWebformGmail(params) — Web3Forms email parsed by ContactFormParser
 *
 * Future channel normalizers (not yet implemented):
 *   MetaMessengerAdapter.normalizeMetaMessage()
 *   InstagramDmAdapter.normalizeInstagramDm()
 *
 * Normalized object shape:
 *   source_channel       string  'webform_gmail' | 'meta_messenger' | 'instagram_dm'
 *   source_message_id    string  Gmail message ID or platform message ID
 *   source_thread_id     string  Gmail thread ID or platform conversation ID
 *   customer_email       string  validated email or ''
 *   customer_name        string  full name from form or ''
 *   customer_phone       string  phone from form or ''
 *   customer_social_id   string  platform user ID (Meta/IG only) or ''
 *   customer_handle      string  @handle (Meta/IG only) or ''
 *   event_date           string  parsed event date or ''
 *   event_type           string  birthday party, corporate, etc. or ''
 *   rental_item          string  item/package name from form or ''
 *   event_address        string  full address or ''
 *   guest_count          string  from form or ''
 *   start_time           string  from form or ''
 *   setup_surface        string  from form or ''
 *   power_access         string  from form or ''
 *   water_access         string  from form or ''
 *   notes                string  any additional notes from form or ''
 *   missing_fields       array   populated by caller after detection
 */

var IntakeNormalizer = (function () {

  /**
   * Normalize a Web3Forms Gmail inquiry.
   * @param {Object} params  Fields from ContactFormParser.parse() plus message/thread IDs and validated email.
   * @returns {Object}  Normalized inquiry object.
   */
  function normalizeWebformGmail(params) {
    var p = params || {};
    return {
      source_channel:     'webform_gmail',
      source_message_id:  p.message_id    || '',
      source_thread_id:   p.thread_id     || '',
      customer_email:     p.email         || '',
      customer_name:      p.name          || '',
      customer_phone:     p.phone         || '',
      customer_social_id: '',
      customer_handle:    '',
      event_date:         p.event_date    || '',
      event_type:         p.event_type    || '',
      rental_item:        p.rental_item   || '',
      event_address:      p.event_address || '',
      guest_count:        p.guest_count   || '',
      start_time:         p.start_time    || '',
      setup_surface:      p.setup_surface || '',
      power_access:       p.power_access  || '',
      water_access:       p.water_access  || '',
      notes:              p.notes         || '',
      missing_fields:     []
    };
  }

  /**
   * Returns true if the normalized inquiry has enough data to attempt a first draft.
   * Requires: customer_email, customer_name (or customer_handle), event_date, rental_item.
   * Does NOT require event_address or guest_count — those are asked in the first response.
   *
   * Used as a deterministic override: if AI returned no_draft or status_only but this
   * returns true, the pipeline forces a 'draft' decision instead of routing to manual review.
   *
   * @param {Object} normalized  Output of normalizeWebformGmail() or equivalent.
   * @returns {boolean}
   */
  function hasSufficientDataForDraft(normalized) {
    var n = normalized || {};
    return !!(
      n.customer_email &&
      (n.customer_name || n.customer_handle) &&
      n.event_date &&
      n.rental_item
    );
  }

  return {
    normalizeWebformGmail:     normalizeWebformGmail,
    hasSufficientDataForDraft: hasSufficientDataForDraft
  };

})();
