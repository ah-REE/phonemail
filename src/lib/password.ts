import bcrypt from "bcryptjs";

import { getRedis } from "@/lib/redis";

/**
 * Password login (Phase 0) — an ADDED convenience path.
 *
 * The spec's password clause is a fallback clause, and OTP stays primary: this
 * module only adds a second way in. Nothing here touches the OTP flow, and an
 * account with no `passwordHash` simply has no password yet — the login screen
 * offers to set one through the OTP the user already knows.
 *
 * The brute-force guard deliberately REPEATS the pattern lib/otp.ts already uses
 * (a per-number counter in Redis with a TTL) rather than inventing a second
 * scheme. The keys are separate, because a pending OTP and a login attempt are
 * different states with different lifetimes.
 */

/** Short enough to type on a phone, long enough to matter. */
export const PASSWORD_MIN_LENGTH = 8;
/** Failed logins allowed before the number is locked for the window. */
export const PASSWORD_MAX_ATTEMPTS = 5;
/** How long the counter (and therefore the lockout) lives. */
export const PASSWORD_LOCK_SECONDS = 300;

export function passwordAttemptsKey(phoneNumber: string): string {
  return `pw-attempts:${phoneNumber}`;
}

/** Why a password was rejected, ready to return to the client. */
export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `A password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > 128) {
    return "A password can be at most 128 characters.";
  }
  return null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Seconds left before a locked number may try again, or 0 when it is free.
 * The lock is the counter's own TTL, so it expires on its own — there is no
 * separate unlock step to forget.
 */
export async function passwordLockSecondsLeft(phoneNumber: string): Promise<number> {
  const redis = await getRedis();
  const raw = await redis.get(passwordAttemptsKey(phoneNumber));
  const attempts = Number(raw ?? 0);

  if (attempts < PASSWORD_MAX_ATTEMPTS) {
    return 0;
  }

  const ttl = await redis.ttl(passwordAttemptsKey(phoneNumber));
  return ttl > 0 ? ttl : 0;
}

/** Records a failure and reports how many attempts are left (may be 0). */
export async function recordFailedPasswordAttempt(phoneNumber: string): Promise<number> {
  const redis = await getRedis();
  const attempts = await redis.incr(passwordAttemptsKey(phoneNumber));
  await redis.expire(passwordAttemptsKey(phoneNumber), PASSWORD_LOCK_SECONDS);
  return Math.max(0, PASSWORD_MAX_ATTEMPTS - attempts);
}

export async function clearPasswordAttempts(phoneNumber: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(passwordAttemptsKey(phoneNumber));
}
