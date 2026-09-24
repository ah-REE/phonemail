import { NextResponse } from "next/server";

import { addressForPhone } from "@/lib/mailer";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { emitNewEmail } from "@/lib/socket";
import { notifyNewMail, type NotificationOutcome } from "@/lib/notify";

/**
 * Inbound delivery: the only place an Email row is ever created.
 *
 * Called by the SMTP service (or, in tests, by anything holding the shared
 * secret). Both parties must already be PhoneMail users, because the row needs
 * both foreign keys.
 *
 * After the row exists it (a) emits the realtime event and (b) attempts the
 * "new mail" SMS notification. The notification is best-effort by design: it
 * can never fail a delivery, and dev mode skips it entirely.
 */

export interface InboundMessage {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export type InboundResult =
  | {
      ok: true;
      emailId: string;
      recipientUserId: string;
      socketNotified: boolean;
      smsNotification: NotificationOutcome;
    }
  | { ok: false; status: number; error: string };

/** Extracts the canonical 10-digit number from "<phone>@phonemail.com". */
function phoneFromAddress(address: string): string {
  return normalizePhoneNumber(address.trim().replace(/@.*$/, ""));
}

const PREVIEW_LENGTH = 120;

export async function submitInboundEmail(message: InboundMessage): Promise<InboundResult> {
  const recipientPhone = phoneFromAddress(message.to);
  const senderPhone = phoneFromAddress(message.from);

  const [recipient, sender] = await Promise.all([
    prisma.user.findUnique({
      where: { phoneNumber: recipientPhone },
      select: { id: true, phoneNumber: true },
    }),
    prisma.user.findUnique({
      where: { phoneNumber: senderPhone },
      select: { id: true, phoneNumber: true },
    }),
  ]);

  if (!recipient) {
    return { ok: false, status: 404, error: "Recipient is not a PhoneMail user." };
  }

  if (!sender) {
    return { ok: false, status: 422, error: "Sender is not a PhoneMail user." };
  }

  const email = await prisma.email.create({
    data: {
      fromUserId: sender.id,
      toUserId: recipient.id,
      fromAddress: addressForPhone(sender.phoneNumber),
      toAddress: addressForPhone(recipient.phoneNumber),
      subject: message.subject,
      body: message.body,
    },
    select: { id: true, fromAddress: true, subject: true, body: true },
  });

  // Realtime notification. No-op when the custom server is not in use.
  const socketNotified = emitNewEmail(recipient.id, {
    from: email.fromAddress,
    subject: email.subject,
    preview: email.body.slice(0, PREVIEW_LENGTH),
  });

  // Best-effort SMS notification. Never allowed to fail the delivery.
  const smsNotification = await notifyNewMail({
    recipientPhone: recipient.phoneNumber,
    senderAddress: email.fromAddress,
    subject: email.subject,
  });

  return {
    ok: true,
    emailId: email.id,
    recipientUserId: recipient.id,
    socketNotified,
    smsNotification,
  };
}
