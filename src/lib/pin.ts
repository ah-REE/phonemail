import bcrypt from "bcryptjs";

import { getRedis } from "@/lib/redis";

/**
 * THE APP PIN (round 22) - the pure parts and the strike accounting.
 *
 * WHAT THIS IS, HONESTLY: a lock on the INTERFACE, not on the API. The session
 * token is what actually authorises anything, and this code never touches it. The
 * PIN exists so a person holding a friend's unlocked phone cannot scroll their mail
 * (see docs/SECURITY.md, "The app PIN"). Anyone who can read the token can still
 * read the mailbox - which is why the PIN is not offered as a security boundary and
 * the API is unchanged by it.
 *
 * HASHING: bcrypt, server-side, so a database dump does not hand over the PIN. The
 * cost factor is the library's default wheel count, chosen for a 4-digit secret
 * whose whole threat model is offline cracking of a 10,000-entry keyspace - which
 * bcrypt makes pointless rather than merely slow.
 */

/** Four digits: the shape of an app lock, and what the pad draws. */
export const PIN_LENGTH = 4;

/** Wrong entries before the pad refuses for a while - the OTP pattern's twin. */
export const PIN_MAX_ATTEMPTS = 5;

/** How long the refusal lasts once the strikes run out. */
export const PIN_LOCKOUT_SECONDS = 60;

const BCRYPT_ROUNDS = 10;

export function pinProblem(pin: string | undefined): string | null {
  if (typeof pin !== "string") {
    return `A PIN is required.`;
  }
  if (!/^\d+$/.test(pin)) {
    return "The PIN must be digits only.";
  }
  if (pin.length !== PIN_LENGTH) {
    return `The PIN must be exactly ${PIN_LENGTH} digits.`;
  }
  return null;
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export function comparePin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

/** Strikes live under the user, not the tab: locking one device locks them all. */
export function pinAttemptsKey(userId: string): string {
  return `pin-attempts:${userId}`;
}

export function pinLockKey(userId: string): string {
  return `pin-lock:${userId}`;
}

export interface PinLockState {
  locked: boolean;
  retryAfterSeconds: number;
}

/** Is this account inside its refusal window, and for how much longer? */
export async function readPinLock(userId: string): Promise<PinLockState> {
  const redis = await getRedis();
  const ttl = await redis.ttl(pinLockKey(userId));
  return typeof ttl === "number" && ttl > 0
    ? { locked: true, retryAfterSeconds: ttl }
    : { locked: false, retryAfterSeconds: 0 };
}

export interface PinFailureState {
  locked: boolean;
  retryAfterSeconds: number;
  attemptsLeft: number;
}

/**
 * One wrong PIN. The fifth sets the lock window and clears the counter, so the
 * window is a clean restart rather than a permanent state - the same "burn, then
 * start over" shape the OTP strike counter uses.
 */
export async function registerPinFailure(userId: string): Promise<PinFailureState> {
  const redis = await getRedis();
  const attempts = await redis.incr(pinAttemptsKey(userId));

  if (attempts >= PIN_MAX_ATTEMPTS) {
    await redis.set(pinLockKey(userId), "1", { EX: PIN_LOCKOUT_SECONDS });
    await redis.del(pinAttemptsKey(userId));
    const ttl = await redis.ttl(pinLockKey(userId));
    return {
      locked: true,
      retryAfterSeconds: typeof ttl === "number" && ttl > 0 ? ttl : PIN_LOCKOUT_SECONDS,
      attemptsLeft: 0,
    };
  }

  // The counter only needs to outlive the strikes; a minute past the last one.
  await redis.expire(pinAttemptsKey(userId), PIN_LOCKOUT_SECONDS * 5);
  return { locked: false, retryAfterSeconds: 0, attemptsLeft: PIN_MAX_ATTEMPTS - attempts };
}

/** A correct PIN (or a reset through OTP) clears the strikes and any lock. */
export async function clearPinFailures(userId: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(pinAttemptsKey(userId));
  await redis.del(pinLockKey(userId));
}
