import {
  classifyToken,
  lookupRecipientUsers,
  recipientToken,
  type RecipientUser,
} from "@/lib/alias";
import { addressForPhone } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { emitNewEmail } from "@/lib/socket";
import { notifyNewMail, shouldNotify, type NotificationOutcome } from "@/lib/notify";
import { deriveThreadKey } from "@/lib/threadKey";

/**
 * Inbound delivery: the only place an Email row is ever created.
 *
 * Called by the SMTP service (or, in tests, by anything holding the shared
 * secret). Both parties must already be PhoneMail users, because the row needs
 * both foreign keys.
 *
 * Day 6 (group chat): the SMTP service submits ONE message carrying the whole
 * recipient list. This function FANS IT OUT - one row per recipient - and every
 * row of the submission carries the same derived threadKey for the member set
 * (see lib/threadKey.ts). A message with a single recipient still gets
 * threadKey NULL, so pairwise threads are grouped exactly as before.
 *
 * Day 6 (aliases): a recipient may arrive as an alias local part. It is resolved
 * to its owner BEFORE anything else happens, so an alias takes exactly the same
 * path as a number from here on. The stored addresses stay canonical
 * (<number>@phonemail.com): the alias is a way IN, not a second identity in the
 * message data.
 *
 * Per row, exactly as for a single recipient: (a) emit the realtime event and
 * (b) attempt the "new mail" SMS notification. The notification is best-effort
 * by design: it can never fail a delivery, and dev mode skips it entirely.
 */

export interface InboundDelivery {
  emailId: string;
  recipientUserId: string;
  recipient: string;
  socketNotified: boolean;
  smsNotification: NotificationOutcome;
}

export interface InboundMessage {
  from: string;
  /** The full recipient list of the submission (min 1); numbers or aliases. */
  to: string[];
  subject: string;
  body: string;
}

export type InboundResult =
  | { ok: true; threadKey: string | null; deliveries: InboundDelivery[] }
  | { ok: false; status: number; error: string };

const PREVIEW_LENGTH = 120;

export async function submitInboundEmail(message: InboundMessage): Promise<InboundResult> {
  const senderPhone = recipientToken(message.from);
  // Duplicates are collapsed: the same member must not get two copies.
  const recipientTokens = [...new Set(message.to.map(recipientToken).filter((token) => token.length > 0))];

  if (recipientTokens.length === 0) {
    return { ok: false, status: 422, error: "At least one recipient is required." };
  }

  const invalid = recipientTokens.filter((token) => classifyToken(token) === "invalid");
  if (invalid.length > 0) {
    return { ok: false, status: 422, error: `Not a valid recipient address: ${invalid.join(", ")}.` };
  }

  const [resolved, sender] = await Promise.all([
    lookupRecipientUsers(recipientTokens),
    prisma.user.findUnique({
      where: { phoneNumber: senderPhone },
      select: { id: true, phoneNumber: true },
    }),
  ]);

  // An unknown alias is an unknown recipient. Same answer, same status.
  const missing = recipientTokens.filter((token) => !resolved.has(token));
  if (missing.length > 0) {
    return { ok: false, status: 404, error: `Recipient is not a PhoneMail user: ${missing.join(", ")}.` };
  }

  if (!sender) {
    return { ok: false, status: 422, error: "Sender is not a PhoneMail user." };
  }

  const recipients: RecipientUser[] = recipientTokens.map((token) => resolved.get(token) as RecipientUser);

  // The derived key is built from canonical NUMBERS, never from whatever alias
  // a sender happened to type: the same three people must always land in the
  // same thread.
  const threadKey =
    recipients.length > 1
      ? deriveThreadKey([sender.phoneNumber, ...recipients.map((recipient) => recipient.phoneNumber)])
      : null;

  const fromAddress = addressForPhone(sender.phoneNumber);
  const deliveries: InboundDelivery[] = [];

  for (const recipient of recipients) {
    const email = await prisma.email.create({
      data: {
        fromUserId: sender.id,
        toUserId: recipient.id,
        fromAddress,
        toAddress: addressForPhone(recipient.phoneNumber),
        subject: message.subject,
        body: message.body,
        threadKey,
        // Messaging your own number: you wrote it, so you have obviously seen it.
        // Born read means no unread badge can appear for a message you sent
        // yourself, which is the only sensible reading of an email to yourself.
        isRead: recipient.id === sender.id,
      },
      select: { id: true, subject: true, body: true },
    });

    // Realtime notification, one per fan-out row. No-op when the custom server
    // is not in use.
    const socketNotified = emitNewEmail(recipient.id, {
      from: fromAddress,
      subject: email.subject,
      preview: email.body.slice(0, PREVIEW_LENGTH),
    });

    // Best-effort SMS notification, gated by how the recipient registered AND by
    // the recipient's own switch. Never allowed to fail the delivery. The switch
    // wins: an explicit "no" from the person is not overridden by anything.
    const smsNotification = !recipient.smsNotifications
      ? "skipped-disabled"
      : shouldNotify(recipient.registeredVia)
        ? await notifyNewMail({
            recipientPhone: recipient.phoneNumber,
            senderAddress: fromAddress,
            subject: email.subject,
          })
        : "skipped-mobile";

    deliveries.push({
      emailId: email.id,
      recipientUserId: recipient.id,
      recipient: recipient.phoneNumber,
      socketNotified,
      smsNotification,
    });
  }

  return { ok: true, threadKey, deliveries };
}
