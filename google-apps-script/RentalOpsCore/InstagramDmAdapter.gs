/**
 * InstagramDmAdapter — RentalOps Core Library
 *
 * Placeholder stub for future Instagram DM integration.
 * All functions throw 'not yet implemented' until the Instagram
 * API connection is built and approved by the owner.
 *
 * Same constraints as MetaMessengerAdapter:
 *   - No live API calls
 *   - No tokens or secrets stored here
 *   - No auto-send; drafts only
 *
 * When Instagram DM integration is implemented:
 *   normalizeInstagramDm must return the same normalized shape as
 *   IntakeNormalizer.normalizeWebformGmail() — source_channel = 'instagram_dm'
 */

var InstagramDmAdapter = (function () {

  function normalizeInstagramDm(payload) {
    throw new Error(
      'InstagramDmAdapter.normalizeInstagramDm: not yet implemented. ' +
      'Instagram DM integration is pending owner approval.'
    );
  }

  function createInstagramReplyDraft(normalizedInquiry) {
    throw new Error(
      'InstagramDmAdapter.createInstagramReplyDraft: not yet implemented. ' +
      'Instagram DM integration is pending owner approval.'
    );
  }

  function sendInstagramReplyAfterApproval(approvalId) {
    throw new Error(
      'InstagramDmAdapter.sendInstagramReplyAfterApproval: not yet implemented. ' +
      'Instagram DM integration is pending owner approval.'
    );
  }

  return {
    normalizeInstagramDm:            normalizeInstagramDm,
    createInstagramReplyDraft:       createInstagramReplyDraft,
    sendInstagramReplyAfterApproval: sendInstagramReplyAfterApproval
  };

})();
