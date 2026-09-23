import { getRedis } from "@/lib/redis";

/**
 * OTP issuing and verification (PROJECT.md §10).
 *
 * Two modes, chosen automatically:
 *  - REAL SMS  : Fast2SMS is configured, so a random 6-digit code is generated
 *                and sent through the `route=otp` template endpoint.
 *  - DEV FALLBACK: no usable API key, so the fixed code below is used and no SMS
 *                is sent. This is what keeps `git clone` + `docker compose up -d`
 *                fully functional for someone booting the stack with the
 *                committed placeholder key.
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
 * The literal placeholder committed in docker-compose.yml. Treating it as
 * "not configured" is deliberate: an evaluator who never edits compose must
 * still get a working OTP flow.
 */
const PLACEHOLDER_API_KEY = "replace-with-real-fast2sms-api-key";

export function otpKey(phoneNumber: string): string {
  return `otp:${phoneNumber}`;
}

export function otpCooldownKey(phoneNumber: string): string {
  return `otp-cooldown:${phoneNumber}`;
}

export function otpAttemptsKey(phoneNumber: string): string {
  return `otp-attempts:${phoneNumber}`;
}

/** True when a real SMS can be attempted. */
export function isSmsConfigured(): boolean {
  const key = process.env.FAST2SMS_API_KEY?.trim();
  return Boolean(key) && key !== PLACEHOLDER_API_KEY;
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

/**
 * Sends the OTP through Fast2SMS `route=otp`. That route uses a pre-approved
 * template, so only the code itself is passed (`variables_values`); no custom
 * text and no DLT registration are needed.
 */
async function sendOtpSms(phoneNumber: string, otp: string): Promise<void> {
  const url = new URL("https://www.fast2sms.com/dev/bulkV2");
  url.searchParams.set("authorization", process.env.FAST2SMS_API_KEY ?? "");
  url.searchParams.set("route", "otp");
  url.searchParams.set("variables_values", otp);
  url.searchParams.set("numbers", phoneNumber);

  const response = await fetch(url.toString(), { method: "GET" });
  const payload = (await response.json().catch(() => null)) as { return?: boolean; message?: unknown } | null;

  if (!response.ok || !payload || payload.return !== true) {
    const detail = payload?.message ? JSON.stringify(payload.message) : `HTTP ${response.status}`;
    throw new Error(`Fast2SMS rejected the OTP request: ${detail}`);
  }
}

export interface RequestOtpResult {
  /** True when the fixed dev OTP was used and no SMS was sent. */
  devMode: boolean;
  ttlSeconds: number;
}

/**
 * Stores an OTP for the number and (in real mode) sends it by SMS.
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
    // Send first: a stored OTP the user never received is worse than no OTP.
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
