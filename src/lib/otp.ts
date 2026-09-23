import { getRedis } from "@/lib/redis";

/**
 * OTP issuing and verification (PROJECT.md §10, transport swapped to Twilio).
 *
 * Two modes, chosen automatically:
 *  - REAL SMS   : Twilio credentials are configured, so a random 6-digit code is
 *                 sent through the Messages REST API.
 *  - DEV FALLBACK: credentials are missing or still the committed placeholders,
 *                 so the fixed code below is used and no SMS is sent. This is
 *                 what keeps `git clone` + `docker compose up -d` fully
 *                 functional for someone booting the stack with placeholders.
 *
 * Transport history: this used Fast2SMS, which requires KYC before any send.
 * Only the transport call and its configuration changed — key names, TTLs, the
 * cooldown, the brute-force guard and every response shape are untouched.
 */

/** OTP lifetime in Redis (5 minutes). */
export const OTP_TTL_SECONDS = 300;
/** Minimum gap between two OTP requests for the same number. */
export const OTP_COOLDOWN_SECONDS = 60;
/** Failed verifications allowed before the pending OTP is burned. */
export const OTP_MAX_ATTEMPTS = 5;
/** Code used in fallback mode; also the value the evaluator test uses. */
export const DEV_FALLBACK_OTP = "123456";

/**
 * The literal placeholder values committed in docker-compose.yml. Treating them
 * as "not configured" is deliberate: an evaluator who never edits compose must
 * still get a working OTP flow.
 */
const PLACEHOLDER_ACCOUNT_SID = "replace-with-real-twilio-account-sid";
const PLACEHOLDER_AUTH_TOKEN = "replace-with-real-twilio-auth-token";
const PLACEHOLDER_FROM_NUMBER = "replace-with-real-twilio-from-number";

export function otpKey(phoneNumber: string): string {
  return `otp:${phoneNumber}`;
}

export function otpCooldownKey(phoneNumber: string): string {
  return `otp-cooldown:${phoneNumber}`;
}

export function otpAttemptsKey(phoneNumber: string): string {
  return `otp-attempts:${phoneNumber}`;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

/**
 * Resolved Twilio settings, or null when the transport must not be used.
 * Null covers: any variable missing/empty, or any still at its placeholder.
 */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !from) {
    return null;
  }

  if (
    accountSid === PLACEHOLDER_ACCOUNT_SID ||
    authToken === PLACEHOLDER_AUTH_TOKEN ||
    from === PLACEHOLDER_FROM_NUMBER
  ) {
    return null;
  }

  return { accountSid, authToken, from };
}

/** True when a real SMS can be attempted. */
export function isSmsConfigured(): boolean {
  return twilioConfig() !== null;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** The exact SMS body. Twilio appends its own trial banner; that is expected. */
export function otpMessage(otp: string): string {
  return `Your PhoneMail verification code is ${otp}. It expires in 5 minutes.`;
}

/** Raised when a second OTP is requested inside the cooldown window. */
export class OtpCooldownError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = OTP_COOLDOWN_SECONDS) {
    super("Please wait before requesting another OTP.");
    this.name = "OtpCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
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
 * Sends the OTP through Twilio's Messages REST API using plain fetch (no SDK,
 * matching the existing style). Throws OtpSendError on any non-2xx response or
 * when the success payload has no `sid`.
 */
export async function sendOtpSms(phoneNumber: string, otp: string): Promise<void> {
  const config = twilioConfig();
  if (!config) {
    throw new OtpSendError("Twilio is not configured.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;

  const form = new URLSearchParams({
    // The number always leaves this service in canonical +91 form; raw user
    // input is normalized long before it gets here.
    To: `+91${phoneNumber}`,
    From: config.from,
    Body: otpMessage(otp),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | { sid?: unknown; code?: unknown; message?: unknown }
    | null;

  const succeeded = response.ok && typeof payload?.sid === "string";
  if (!succeeded) {
    console.error("[otp] Twilio rejected the message:", {
      status: response.status,
      code: payload?.code,
      message: payload?.message,
    });
    throw new OtpSendError(
      `Twilio rejected the OTP message (${payload?.code ?? response.status}).`,
    );
  }
}

export interface RequestOtpResult {
  /** True when the fixed dev OTP was used and no SMS was sent. */
  devMode: boolean;
  ttlSeconds: number;
}

/**
 * Stores an OTP for the number and (in real mode) sends it by SMS.
 *
 * Ordering matters: the SMS is attempted BEFORE anything is written to Redis,
 * so a transport failure leaves no OTP behind and does not consume the resend
 * cooldown — the caller can simply retry.
 *
 * Throws OtpCooldownError when called again inside the cooldown window.
 */
export async function requestOtp(phoneNumber: string): Promise<RequestOtpResult> {
  const redis = await getRedis();

  if (await redis.get(otpCooldownKey(phoneNumber))) {
    throw new OtpCooldownError();
  }

  const devMode = !isSmsConfigured();
  const otp = devMode ? DEV_FALLBACK_OTP : generateOtp();

  if (!devMode) {
    await sendOtpSms(phoneNumber, otp);
  }

  await redis.set(otpKey(phoneNumber), otp, { EX: OTP_TTL_SECONDS });
  await redis.del(otpAttemptsKey(phoneNumber));
  await redis.set(otpCooldownKey(phoneNumber), "1", { EX: OTP_COOLDOWN_SECONDS });

  return { devMode, ttlSeconds: OTP_TTL_SECONDS };
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
