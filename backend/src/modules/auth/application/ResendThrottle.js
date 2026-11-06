'use strict';

const { TooManyRequestsError } = require('../../../shared/errors');

const RESEND_THROTTLE_MESSAGE =
  'Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
// A ceiling on tracked keys. Without it an attacker could grow the map by inventing
// emails: the key space is caller controlled, the memory is not.
const DEFAULT_MAX_KEYS = 10000;

/**
 * Sliding-window attempt limiter for the verification resend endpoint.
 *
 * Why it lives in the application layer and not in the router: the limit is a business
 * rule ("how many emails may one person provoke"), so it has to be provable without
 * HTTP, and the endpoint's anti-enumeration contract depends on it (see below).
 *
 * The clock is injected so the window expiry is testable without sleeping.
 */
class ResendThrottle {
  constructor({
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    windowMs = DEFAULT_WINDOW_MS,
    now = () => Date.now(),
    maxKeys = DEFAULT_MAX_KEYS,
    message = RESEND_THROTTLE_MESSAGE
  } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }

    if (!Number.isFinite(windowMs) || windowMs < 1) {
      throw new RangeError('windowMs must be a positive number');
    }

    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
    this.message = message;
    this.attempts = new Map();
  }

  /**
   * Records one attempt for `key`, or throws if the window is already full.
   *
   * The caller must pass a normalized key. Every attempt counts, whether or not the
   * account exists: the endpoint answers the same way for unknown and registered
   * emails, so a limiter that only counted real accounts would turn the 429 itself
   * into an existence oracle.
   *
   * A blocked attempt is *not* recorded. Counting rejections would push the window
   * forward on every retry and turn a temporary block into a permanent one.
   */
  consume(key) {
    const at = this.now();
    const recent = this.recentFor(key, at);

    if (recent.length >= this.maxAttempts) {
      throw new TooManyRequestsError(this.message, {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((recent[0] + this.windowMs - at) / 1000)
        )
      });
    }

    if (!this.attempts.has(key)) {
      this.prune(at);

      if (this.attempts.size >= this.maxKeys) {
        // The store is full of counters that are still inside their window. Failing
        // closed here is deliberate: evicting a live counter would reset someone
        // else's window, and a flood of invented addresses could then revive the
        // quota of an address that was already blocked. Refusing the untracked key
        // keeps the limit honest; the cost of reaching this state is itself the
        // flood that an IP-level limiter is meant to absorb (see
        // skills/rate-limiting.md).
        throw new TooManyRequestsError(this.message, {
          retryAfterSeconds: Math.ceil(this.windowMs / 1000)
        });
      }
    }

    recent.push(at);
    this.attempts.set(key, recent);

    return { remaining: this.maxAttempts - recent.length };
  }

  recentFor(key, at) {
    const stamps = this.attempts.get(key);

    if (!stamps) {
      return [];
    }

    return stamps.filter((stamp) => stamp + this.windowMs > at);
  }

  /**
   * Drops counters whose whole window has expired.
   *
   * It never removes a live counter: `consume` refuses an untracked key once the store
   * is full, so the map cannot exceed `maxKeys` and nothing here has to be evicted.
   */
  prune(at) {
    for (const [key, stamps] of this.attempts) {
      const last = stamps[stamps.length - 1];
      if (last === undefined || last + this.windowMs <= at) {
        this.attempts.delete(key);
      }
    }
  }
}

module.exports = {
  ResendThrottle,
  RESEND_THROTTLE_MESSAGE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_WINDOW_MS
};
