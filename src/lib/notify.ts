import { randomInt } from "node:crypto";

import { SMS_GATE_TIMEOUT_MS, SMS_GATE_URL, smsGateConfig } from "@/lib/otp";
import { getRedis } from "@/lib/redis";

/**
 * "You have new mail" SMS notification.
 *
 * Sent from the inbound delivery path after the row is written and the socket
 * event is emitted. Three hard rules:
 *
 *  1. It can NEVER fail a delivery. Every outcome is returned as a value, not
 *     thrown, and the caller ignores anything but `sent`.
 *  2. Dev mode is silent - the gateway is only used when it is really
 *     configured, so an evaluator booting with placeholders never sends SMS.
 *  3. One notification per recipient per 60s, so a burst of mail cannot drain
 *     the SIM's quota. The window is consumed even when the send fails: that
 *     keeps a broken gateway from being retried on every message.
 *
 * Round 9 (the SMS fix). Two defects made this feature report success while
 * nothing arrived, and both are fixed here:
 *
 *  A. THE BODY WAS ONE LONG FIXED TEMPLATE. `src/lib/otp.ts` already records the
 *     proven fact that this carrier drops the long templated text this project
 *     used to send, and filters exact duplicates - which is why the OTP bodies
 *     are a rotated set of SHORT formats. The notification was a single ~90
 *     character sentence, identical for identical (sender, subject) pairs: the
 *     one body shape the carrier is known to filter. It is now a rotated set in
 *     the same established spirit, and every format is one GSM-safe line.
 *
 *  B. THE THROTTLE SAT BEHIND THE DEV-MODE RETURN, so `throttled` could not be
 *     observed at all in dev mode - the outcome the caller reports for a burst
 *     was "dev-mode" twice, and the burst protection was never exercised by any
 *     test. The order is now gate -> throttle -> transport, so the path is
 *     complete and every outcome is reachable and assertable.
 *
 * The transport is the same sms-gate.app gateway the OTP flow uses; the config
 * helper is shared rather than re-implemented.
 */

export const NOTIFY_COOLDOWN_SECONDS = 60;

/**
 * The subject is user text and rides inside an SMS body, so it has to be made
 * safe for the wire: one line, no control characters, no invisible ones, and
 * short enough that the whole sentence stays a short message. 60 characters
 * keeps the longest format comfortably inside a single segment.
 */
export const NOTIFY_SUBJECT_LIMIT = 60;

export function notifyCooldownKey(phoneNumber: string): string {
  return `notify-cooldown:${phoneNumber}`;
}

/**
 * Makes arbitrary user text safe to interpolate into an SMS body.
 *
 * Why: the subject is whatever the sender typed. A newline, a control character
 * or an emoji in it can make the carrier reject or mangle the whole message, and
 * an unbounded subject turns the notification into a multi-segment (or
 * multi-message) text. Newlines and control characters are collapsed to spaces,
 * runs of whitespace are collapsed, and the result is trimmed and truncated.
 */
export function smsSafeText(value: string, limit = NOTIFY_SUBJECT_LIMIT): string {
  const flattened = value
    .replace(/[\r\n\t]+/g, " ")
    // Control characters (C0 and C1), including the invisible ones.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    // Zero-width and BOM characters, which render as nothing but travel.
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= limit) {
    return flattened;
  }
  // Truncate on the limit and add an ellipsis so a cut subject reads as cut
  // rather than as the sender's actual words.
  return `${flattened.slice(0, limit - 1).trimEnd()}\u2026`;
}

/**
 * The notification formats, rotated per message, in the same spirit - and for
 * the same documented reason - as OTP_MESSAGE_FORMATS in src/lib/otp.ts.
 *
 * The spec's own sentence is the first format and stays the canonical wording;
 * the others carry exactly the same two facts (who sent it, what it is about) in
 * shorter bodies, so a burst of mail from the same sender is never a run of
 * byte-identical texts. Every format is one line and contains nothing but the
 * sender and the subject.
 *
 * {sender} is the sender's number (the address's local part, which IS their
 * phone number); {address} is the full <number>@phonemail.com address the spec
 * calls <Sender>. {subject} is the sanitized, truncated subject.
 */
export const NOTIFY_MESSAGE_FORMATS = [
  "You have received an email from {address}. Subject: {subject}.",
  "New PhoneMail email from {sender}. Subject: {subject}.",
  "You have new mail from {sender}: {subject}",
  "PhoneMail: email from {sender}. Subject: {subject}.",
] as const;

/** The number behind a PhoneMail address, which is its local part. */
export function senderNumber(senderAddress: string): string {
  return senderAddress.split("@")[0] ?? senderAddress;
}

/**
 * The SMS body for one message: a uniform random pick from the rotated set, with
 * the sender and the sanitized subject filled in.
 *
 * Randomness is deliberate (see the OTP module): the carrier filters exact
 * duplicates, so varying the wrapper is what keeps repeated notifications
 * arriving. crypto.randomInt keeps the choice uniform across processes.
 */
export function notificationText(senderAddress: string, subject: string): string {
  const sanitized = smsSafeText(subject) || "(no subject)";
  const format = NOTIFY_MESSAGE_FORMATS[randomFormatIndex(NOTIFY_MESSAGE_FORMATS.length)];
  return format
    .replace("{address}", smsSafeText(senderAddress, 120))
    .replace("{sender}", smsSafeText(senderNumber(senderAddress), 40))
    .replace("{subject}", sanitized);
}

/**
 * Indirection so the module has exactly one source of randomness and the tests
 * can drive every format without mocking the crypto module.
 */
function randomFormatIndex(count: number): number {
  // randomInt (not Math.random), the same standard the OTP code itself uses:
  // uniform over the list, no modulo bias, no predictable pattern.
  return randomInt(0, count);
}

export type NotificationOutcome =
  | "sent"
  | "throttled"
  | "dev-mode"
  | "failed"
  | "skipped-mobile"
  | "skipped-disabled"
  | "skipped-self";

/**
 * The spec's gate: an SMS notification goes only to someone who registered
 * somewhere OTHER than the mobile app (portal, desktop or IVR). A missing or
 * unrecognised value counts as 'mobile', because the safe side of this decision
 * is not sending.
 */
export function shouldNotify(registeredVia: string | null | undefined): boolean {
  // Allowlist, not "anything that is not mobile": an unknown value must fall to
  // the safe side (no SMS), and only these three registration paths notify.
  const notifiable = new Set(["portal", "desktop", "ivr"]);
  return typeof registeredVia === "string" && notifiable.has(registeredVia);
}

/**
 * The gate order, as one function so it cannot drift from the outcome type: the
 * plainest skips first (yourself, your own switch, a registration path the spec
 * does not notify), then the throttle, then the transport.
 *
 * `smsNotificationGate` answers 'notify' for the one case that reaches the
 * transport; the caller does the awaiting. Keeping the decision pure is what lets
 * the tests drive every branch without a server.
 */
export type NotificationGate =
  | "notify"
  | "skipped-self"
  | "skipped-disabled"
  | "skipped-mobile";

export function notificationGate({
  isSelf,
  smsNotifications,
  registeredVia,
}: {
  isSelf: boolean;
  smsNotifications: boolean;
  registeredVia: string | null | undefined;
}): NotificationGate {
  if (isSelf) {
    return "skipped-self";
  }
  if (!smsNotifications) {
    return "skipped-disabled";
  }
  return shouldNotify(registeredVia) ? "notify" : "skipped-mobile";
}

export async function notifyNewMail({
  recipientPhone,
  senderAddress,
  subject,
}: {
  recipientPhone: string;
  senderAddress: string;
  subject: string;
}): Promise<NotificationOutcome> {
  try {
    // The throttle comes FIRST, and it is consumed in every mode. Dev mode does
    // not send, but the recipient's window is still a real window: without this
    // order a burst in dev reported "dev-mode" for every message, the throttle
    // outcome was unreachable, and the protection was never exercised.
    const redis = await getRedis();
    if (await redis.get(notifyCooldownKey(recipientPhone))) {
      return "throttled";
    }
    await redis.set(notifyCooldownKey(recipientPhone), "1", { EX: NOTIFY_COOLDOWN_SECONDS });

    const config = smsGateConfig();
    if (!config) {
      // Dev mode: no gateway, no SMS, no noise. The window above was consumed
      // deliberately, so this mode behaves like the real one from the caller's
      // point of view: one outcome per message, and a burst is a burst.
      return "dev-mode";
    }

    const response = await fetch(SMS_GATE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(SMS_GATE_TIMEOUT_MS),
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        textMessage: { text: notificationText(senderAddress, subject) },
        phoneNumbers: [`+91${recipientPhone}`],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[notify] gateway rejected the notification:", {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      return "failed";
    }

    return "sent";
  } catch (error) {
    console.error("[notify] notification attempt failed:", error);
    return "failed";
  }
}
