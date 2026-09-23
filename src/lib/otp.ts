/**
 * OTP storage contract.
 *
 * PROJECT.md §10 sketches the Day 2 implementation (`requestOtp` /
 * `verifyOtp` backed by the real Fast2SMS `route=otp` call). Day 1 needs only
 * the shared conventions below, so that both auth routes agree on the Redis
 * key and the TTL instead of duplicating them.
 */

/** OTP lifetime in Redis, in seconds (PROJECT.md: 5 minutes). */
export const OTP_TTL_SECONDS = 300;

/**
 * Day 1 fixed fake OTP — no SMS is sent yet. Day 2 deletes this constant and
 * generates a random 6-digit code inside `requestOtp()`.
 */
export const DEV_FAKE_OTP = "123456";

/** Redis key holding the pending OTP for a normalized phone number. */
export function otpKey(phoneNumber: string): string {
  return `otp:${phoneNumber}`;
}
