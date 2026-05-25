/**
 * MetaMessengerAdapter — RentalOps Core Library
 *
 * Placeholder stub for future Meta Messenger integration.
 * All functions throw 'not yet implemented' until the Meta API
 * connection is built and approved by the owner.
 *
 * DO NOT:
 *   - Call Meta APIs in this file
 *   - Store OAuth tokens or credentials here
 *   - Add secrets or API keys
 *   - Auto-send any Meta replies (drafts only, same rule as Gmail)
 *
 * When Meta Messenger integration is implemented:
 *   1. Replace stub bodies with real Meta Graph API calls
 *   2. Add OAuth flow via Script Properties (token storage only)
 *   3. normalizeMetaMessage must return the same normalized shape as
 *      IntakeNormalizer.normalizeWebformGmail() — source_channel = 'meta_messenger'
 *   4. sendMetaReplyAfterApproval must require an explicit approval record
 *   5. Never call GmailApp.sendEmail or Meta send API without owner approval
 */

var MetaMessengerAdapter = (function () {

  function normalizeMetaMessage(payload) {
    throw new Error(
      'MetaMessengerAdapter.normalizeMetaMessage: not yet implemented. ' +
      'Meta Messenger integration is pending owner approval.'
    );
  }

  function createMetaReplyDraft(normalizedInquiry) {
    throw new Error(
      'MetaMessengerAdapter.createMetaReplyDraft: not yet implemented. ' +
      'Meta Messenger integration is pending owner approval.'
    );
  }

  function sendMetaReplyAfterApproval(approvalId) {
    throw new Error(
      'MetaMessengerAdapter.sendMetaReplyAfterApproval: not yet implemented. ' +
      'Meta Messenger integration is pending owner approval.'
    );
  }

  return {
    normalizeMetaMessage:       normalizeMetaMessage,
    createMetaReplyDraft:       createMetaReplyDraft,
    sendMetaReplyAfterApproval: sendMetaReplyAfterApproval
  };

})();
