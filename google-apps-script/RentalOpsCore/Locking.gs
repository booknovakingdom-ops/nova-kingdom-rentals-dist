/**
 * Locking — RentalOps Core Library
 *
 * Thin wrapper around Apps Script LockService. All counter reads,
 * idempotency checks, and Customers tab upserts go through here.
 *
 * Lock timeout: 10 seconds. If lock cannot be acquired, throws — caller
 * must catch and log to Ops_Metrics with event_type ERROR.
 */

var Locking = (function () {

  var LOCK_TIMEOUT_MS = 10000;

  /**
   * Acquires the script-level lock, executes fn(), releases lock.
   * Returns the return value of fn().
   * Throws if lock cannot be acquired within LOCK_TIMEOUT_MS.
   */
  function withScriptLock(fn) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_TIMEOUT_MS);
    } catch (e) {
      throw new Error('Locking: could not acquire script lock within ' + LOCK_TIMEOUT_MS + 'ms. Concurrent run likely. Aborting.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Acquires a user-level lock (per-user isolation). Use for per-user
   * operations if multi-user deployment is ever needed. For now, script
   * lock is preferred for all CRM writes.
   */
  function withUserLock(fn) {
    var lock = LockService.getUserLock();
    try {
      lock.waitLock(LOCK_TIMEOUT_MS);
    } catch (e) {
      throw new Error('Locking: could not acquire user lock within ' + LOCK_TIMEOUT_MS + 'ms.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  return {
    withScriptLock: withScriptLock,
    withUserLock:   withUserLock
  };
})();
