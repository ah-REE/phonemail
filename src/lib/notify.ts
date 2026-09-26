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
 *  2. Dev mode is silent — the gateway is only used when it is really
 *     configured, so an evaluator booting with placeholders never sends SMS.
 *  3. One notification per recipient per 60s, so a burst of mail cannot drain
 *     the SIM's quota. The window is consumed even when the send fails: that
 *     keeps a broken gateway from being retried on every message.
 *
 * The transport is the same sms-gate.app gateway the OTP flow uses; the config
 * helper is shared rather than re-implemented.
 */

export const NOTIFY_COOLDOWN_SECONDS = 60;

export function notifyCooldownKey(phoneNumber: string): string {
  return `notify-cooldown:${phoneNumber}`;
}

/**
 * The notification text, in the spec's exact wording (user-verified delivered):
 * "You have received an email from <sender>. Subject: <subject>."
 * <sender> is the sender's full <number>@phonemail.com address.
 */
export function notificationText(senderAddress: string, subject: string): string {
  return `You have received an email from ${senderAddress}. Subject: ${subject}.`;
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

export async function notifyNewMail({
  recipientPhone,
  senderAddress,
  subject,
}: {
  recipientPhone: string;
  senderAddress: string;
  subject: string;
}): Promise<NotificationOutcome> {
  const config = smsGateConfig();
  if (!config) {
    // Dev mode: no gateway, no SMS, no noise.
    return "dev-mode";
  }

  try {
    const redis = await getRedis();
    if (await redis.get(notifyCooldownKey(recipientPhone))) {
      return "throttled";
    }
    await redis.set(notifyCooldownKey(recipientPhone), "1", { EX: NOTIFY_COOLDOWN_SECONDS });

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
