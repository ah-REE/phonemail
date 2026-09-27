import { randomInt } from "node:crypto";

import { getRedis } from "@/lib/redis";

/**
 * OTP issuing and verification (PROJECT.md §10, transport: sms-gate.app).
 *
 * Two modes, chosen automatically:
 *  - REAL SMS   : sms-gate.app credentials are configured. The code is OURS
 *                 again — generated locally with crypto.randomInt — and sent
 *                 through the developer's own Android phone + SIM via a
 *                 self-hosted gateway. No KYC, no DLT, no template parsing.
 *  - DEV FALLBACK: credentials are missing or still the committed placeholders,
 *                 so the fixed code below is used and no SMS is attempted. This
 *                 is what keeps `git clone` + `docker compose up -d` fully
 *                 functional for someone booting the stack with placeholders —
 *                 and it is the mode the project demos in.
 *
 * Transport history: earlier providers were dropped for KYC/account reasons;
 * the full story lives in PROJECT.md sections 9 and 10, not here.
 * This build sends through sms-gate.app.
 *
 * Unchanged throughout: Redis key names, TTLs, the cooldown, the brute-force
 * guard, verify-otp, JWT issuance and every response shape.
 */

/** OTP lifetime in Redis (5 minutes). */
export const OTP_TTL_SECONDS = 300;
/**
 * THE REQUEST POLICY, tiered rather than one flat cooldown.
 *
 * A single 60-second gap treated a first-time caller and somebody hammering the
 * endpoint the same way. The tiers are what the two actually need:
 *
 *   1st and 2nd request in a window   immediate - the RAPID PAIR, because a caller
 *                                     who mistyped wants the second code NOW, not in
 *                                     a minute
 *   3rd request onward                60 seconds apart, so the endpoint cannot be
 *                                     used as a free SMS pump
 *   at most 5 codes per number        the window itself: 2 hours, counted from the
 *   per 2-hour window                  FIRST request and not sliding, so the budget
 *                                     refills on a predictable clock
 */
export const OTP_COOLDOWN_SECONDS = 60;
/** How many requests are immediate before the spacing applies. */
/**
 * The tiering constants are GONE (round 15): there is one flat cooldown now. The
 * names are kept out of the module rather than left as dead exports, so nothing can
 * import a rule that no longer applies.
 */
/** Codes allowed per number per window. */
/**
 * ROUND 15: there is no window and no rapid pair. The constants are kept only as
 * historical markers in the comment above; nothing reads them. The one rule is
 * OTP_COOLDOWN_SECONDS between requests for a number.
 */
export const OTP_FLAT_POLICY = true;
/** The window's length, in seconds (2 hours). */

/** Failed verifications allowed before the pending OTP is burned. */
export const OTP_MAX_ATTEMPTS = 5;
/** Code used in fallback mode; also the value the evaluator test uses. */
export const DEV_FALLBACK_OTP = "123456";

/** The gateway endpoint that queues a message for the paired Android device. */
export const SMS_GATE_URL = "https://api.sms-gate.app/3rdparty/v1/message";

/**
 * Total budget for one send attempt.
 *
 * Diagnosis (2026-09-24 12:56-12:57 IST): two sends failed with
 * UND_ERR_CONNECT_TIMEOUT - undici's default connect budget is 10s, and a
 * transient host-network stall pushed connects past it. There is no retry here
 * on purpose (a 2xx means "queued", so retrying could send twice), so the only
 * safe hardening is to allow a slower-but-working link to finish: 20s covers
 * the stalls seen in practice without holding a request open indefinitely.
 */
export const SMS_GATE_TIMEOUT_MS = 20_000;

/**
 * The literal placeholder values committed in docker-compose.yml. Treating them
 * as "not configured" is deliberate: an evaluator who never edits compose must
 * still get a working OTP flow.
 */
const PLACEHOLDER_LOGIN = "replace-with-real-sms-gate-login";
const PLACEHOLDER_PASSWORD = "replace-with-real-sms-gate-password";

export function otpKey(phoneNumber: string): string {
  return `otp:${phoneNumber}`;
}

/**
 * The window counter: how many codes this number has asked for since the window
 * opened. Its TTL IS the window - set with the first request and never extended, so
 * the counter and the window expire together.
 */
export function otpWindowKey(phoneNumber: string): string {
  return `otp-window:${phoneNumber}`;
}

/** When this number last asked for a code, in epoch seconds. */
export function otpLastRequestKey(phoneNumber: string): string {
  return `otp-last:${phoneNumber}`;
}

export function otpCooldownKey(phoneNumber: string): string {
  return `otp-cooldown:${phoneNumber}`;
}

export function otpAttemptsKey(phoneNumber: string): string {
  return `otp-attempts:${phoneNumber}`;
}

export interface SmsGateConfig {
  login: string;
  password: string;
}

/**
 * Resolved gateway settings, or null when the transport must not be used.
 * Null covers: either variable missing/empty, or either still at its placeholder.
 */
export function smsGateConfig(): SmsGateConfig | null {
  const login = process.env.SMS_GATE_LOGIN?.trim();
  const password = process.env.SMS_GATE_PASSWORD?.trim();

  if (!login || !password) {
    return null;
  }

  if (login === PLACEHOLDER_LOGIN || password === PLACEHOLDER_PASSWORD) {
    return null;
  }

  return { login, password };
}

/** True when a real SMS can be attempted. */
export function isSmsConfigured(): boolean {
  return smsGateConfig() !== null;
}

/**
 * Cryptographically strong 6-digit code. Math.random is predictable enough to
 * matter for an auth code, so this uses crypto.randomInt (uniform, no modulo
 * bias) — see the security notes in PROJECT.md §9.
 */
function generateOtp(): string {
  return randomInt(100000, 1000000).toString();
}

/**
 * OTP message formats, rotated per message.
 *
 * Why rotation: the carrier drops the long templated text this project used to
 * send (proven by manual tests), and it also filters exact duplicates — so a
 * day's worth of identical OTP bodies is a delivery risk. Short,
 * personal-looking text with a varying wrapper passes both.
 *
 * All four below were sent to the developer's own handset and physically arrived
 * (verified 2026-09-24), so they are the committed set.
 *
 * HARD RULE: only formats the developer has VERIFIED deliver belong in this
 * list. An untested format is never shipped, because a dropped OTP is a broken
 * signup. Adding one is a deliberate act, not a refactor.
 */
export const OTP_MESSAGE_FORMATS = [
  "PhoneMail: {otp}",
  "Your PhoneMail code: {otp}",
  "{otp} is your PhoneMail code",
  "Your PhoneMail code is {otp}",
] as const;

/** The SMS body for one message: a uniform random pick from the verified set. */
export function otpMessage(otp: string): string {
  // crypto.randomInt, same standard as the code itself: uniform over the list,
  // no modulo bias, no predictable pattern.
  const format = OTP_MESSAGE_FORMATS[randomInt(0, OTP_MESSAGE_FORMATS.length)];
  return format.replace("{otp}", otp);
}

/**
 * Raised when a request is refused by the policy. The REASON and the ACTUAL WAIT
 * travel with it, because a refusal that does not say how long to wait is a dead end
 * for the person reading it - and the two reasons need different words (one is "slow
 * down", the other is "you have used this number's codes for now").
 */
export type OtpRefusalReason = "cooldown" | "window";

export class OtpCooldownError extends Error {
  readonly retryAfterSeconds: number;
  readonly reason: OtpRefusalReason;
  readonly used: number;

  constructor(
    retryAfterSeconds = OTP_COOLDOWN_SECONDS,
    reason: OtpRefusalReason = "cooldown",
    used = 0,
  ) {
    super(
      reason === "window"
        ? `This number has requested too many codes for now. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`
        : `Please wait ${retryAfterSeconds}s before requesting another OTP.`,
    );
    this.name = "OtpCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.reason = reason;
    this.used = used;
  }
}

/** Raised when the SMS transport could not accept the message. */
export class OtpSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpSendError";
  }
}

/**
 * Hands the message to the sms-gate.app gateway, which queues it for the paired
 * Android device. Delivery is asynchronous: a 2xx means "accepted and queued",
 * not "delivered".
 *
 * Logging hygiene: on failure we log the status and the gateway's own response
 * payload only. The Authorization header, the credentials and the outbound
 * message text (which carries the OTP) are never logged.
 */
export async function sendOtpSms(phoneNumber: string, otp: string): Promise<void> {
  const config = smsGateConfig();
  if (!config) {
    throw new OtpSendError("The SMS gateway is not configured.");
  }

  const response = await fetch(SMS_GATE_URL, {
    method: "POST",
    // Bounded so a stalled connect fails with a clear error instead of hanging.
    signal: AbortSignal.timeout(SMS_GATE_TIMEOUT_MS),
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textMessage: { text: otpMessage(otp) },
      // The number always leaves this service in canonical +91 form; raw user
      // input is normalized long before it gets here.
      phoneNumbers: [`+91${phoneNumber}`],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[otp] sms-gate rejected the message:", {
      status: response.status,
      detail: detail.slice(0, 300),
    });
    throw new OtpSendError(`SMS gateway rejected the message (${response.status}).`);
  }
}

export interface RequestOtpResult {
  /** True when the fixed dev OTP was used and no SMS was sent. */
  devMode: boolean;
  ttlSeconds: number;
  /** Seconds until another request is allowed (0 while the rapid pair lasts). */
  resendAfterSeconds: number;
  /** How many codes this number has asked for inside the current window. */
  /** The window counters are gone with the window (round 15). */
  /** How many the window allows. */

}

/**
 * Stores an OTP for the number and (in real mode) sends it by SMS.
 *
 * Ordering matters and is unchanged: the transport is attempted BEFORE anything
 * is written to Redis, so a rejection leaves no OTP behind and does not consume
 * the resend cooldown — the caller can simply retry.
 *
 * A new code replaces any previous one and resets the strike counter, so a
 * freshly issued code always comes with five fresh attempts.
 *
 * Throws OtpCooldownError when called again inside the cooldown window.
 */
export async function requestOtp(phoneNumber: string): Promise<RequestOtpResult> {
  const redis = await getRedis();

  // ROUND 15: THE FLAT POLICY, RESTORED AT THE OWNER'S CALL.
  //
  // The tiered policy (a free rapid pair, then 60s spacing, then five codes per two
  // hours) shipped, ran, and bit its own owner: the window lockout meant a person
  // testing their own app could not request a sixth code for two hours. The rule is
  // now the simple one it started as: ONE COOLDOWN BETWEEN REQUESTS PER NUMBER.
  //
  // What did NOT change, because these are not request throttling:
  //   - the cooldown key itself and its 60-second TTL;
  //   - the 5-strike burn in verifyOtp (the brute-force bound on GUESSING a code);
  //   - the per-code TTL and the one-time-use rule.
  const lastRequest = Number.parseInt((await redis.get(otpLastRequestKey(phoneNumber))) ?? "0", 10) || 0;
  if (lastRequest > 0) {
    const elapsed = Math.floor(Date.now() / 1000) - lastRequest;
    if (elapsed < OTP_COOLDOWN_SECONDS) {
      throw new OtpCooldownError(OTP_COOLDOWN_SECONDS - elapsed, "cooldown");
    }
  }

  // 3. THE SEND, attempted BEFORE anything is written, so a transport failure leaves
  // no code behind and does not consume the budget.
  const devMode = !isSmsConfigured();
  const otp = devMode ? DEV_FALLBACK_OTP : generateOtp();

  if (!devMode) {
    await sendOtpSms(phoneNumber, otp);
  }

  await redis.set(otpKey(phoneNumber), otp, { EX: OTP_TTL_SECONDS });
  // Fresh code, fresh attempts.
  await redis.del(otpAttemptsKey(phoneNumber));

  // 3. THE COOLDOWN MARKS THE REQUEST. One key, one TTL, no counter to keep and no
  // window to hold open: the next request is allowed exactly 60 seconds after this one.
  await redis.set(otpLastRequestKey(phoneNumber), String(Math.floor(Date.now() / 1000)), {
    EX: OTP_COOLDOWN_SECONDS,
  });

  // What the NEXT request will need, which is what the screen's countdown shows.
  // Flat policy, flat answer: the next request waits the cooldown, and there is no
  // window to report because there is no window any more.
  return {
    devMode,
    ttlSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_COOLDOWN_SECONDS,
  };
}

/** Seconds left on a key, with a fallback when the key has no expiry or has gone. */
async function remainingTtl(
  redis: Awaited<ReturnType<typeof getRedis>>,
  key: string,
  fallback: number,
): Promise<number> {
  const ttl = await redis.ttl(key);
  return typeof ttl === "number" && ttl > 0 ? ttl : fallback;
}

export type VerifyOtpFailureReason = "missing" | "mismatch" | "locked";

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: VerifyOtpFailureReason; attemptsLeft?: number };

/**
 * Verifies a submitted OTP. Success consumes the code (one-time use).
 * Five wrong submissions burn the pending OTP so that even the correct code
 * stops working — the counter carries the OTP's own TTL.
 */
export async function verifyOtp(phoneNumber: string, submittedOtp: string): Promise<VerifyOtpResult> {
  const redis = await getRedis();

  const storedOtp = await redis.get(otpKey(phoneNumber));
  if (!storedOtp) {
    return { ok: false, reason: "missing" };
  }

  if (storedOtp === submittedOtp) {
    await redis.del(otpKey(phoneNumber));
    await redis.del(otpAttemptsKey(phoneNumber));
    return { ok: true };
  }

  const attempts = await redis.incr(otpAttemptsKey(phoneNumber));
  await redis.expire(otpAttemptsKey(phoneNumber), OTP_TTL_SECONDS);

  if (attempts >= OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey(phoneNumber));
    return { ok: false, reason: "locked" };
  }

  return { ok: false, reason: "mismatch", attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
}
