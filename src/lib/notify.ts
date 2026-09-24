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

export function notificationText(senderPhoneNumber: string, subject: string): string {
  return `New PhoneMail message from ${senderPhoneNumber}: ${subject}`;
}

export type NotificationOutcome = "sent" | "throttled" | "dev-mode" | "failed";

export async function notifyNewMail({
  recipientPhone,
  senderPhone,
  subject,
}: {
  recipientPhone: string;
  senderPhone: string;
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
        textMessage: { text: notificationText(senderPhone, subject) },
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
