import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { addressForPhone, submitOutboundEmail } from "@/lib/mailer";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { deriveThreadKey } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound mail.
 *
 * POST deliberately does NOT write an Email row: it only submits the message to
 * our SMTP service. The row is created when the SMTP service posts the message
 * back to /api/mail/inbound, so a bug in SMTP delivery cannot silently produce a
 * "sent" email that nobody received.
 *
 * Day 6 (group chat): `to` accepts a LIST - an array and/or a comma-separated
 * string - and the whole list travels in ONE SMTP submission (nodemailer takes
 * `to: [array]` natively). The per-recipient fan-out happens once, in the inbound
 * path, so there is no loop here and no chance of half a group receiving it.
 * The response carries the DERIVED threadKey of the member set so the client can
 * open the group thread it just created without computing anything itself.
 *
 * Replying (optional `replyToId`) is enforced here as reply-ONCE: the original
 * message is claimed with a conditional update, so a second reply cannot be
 * recorded even if two requests race. The claim is rolled back if SMTP refuses
 * the submission, so a failed send does not burn the reply.
 */

const INBOX_LIMIT = 50;

const sendSchema = z.object({
  to: z.union([
    z.string().trim().min(1, "to is required"),
    z.array(z.string().trim().min(1)).min(1, "to is required"),
  ]),
  subject: z.string().trim().min(1, "subject is required").max(200).optional(),
  body: z.string().min(1, "body is required"),
  replyToId: z.string().trim().min(1).optional(),
});

/** Accepts a bare 10-digit number or <phone>@phonemail.com. */
function parseRecipient(raw: string): { phoneNumber: string; address: string } | null {
  const withoutDomain = raw.trim().replace(/@.*$/, "");
  const phoneNumber = normalizePhoneNumber(withoutDomain);

  if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
    return null;
  }

  return { phoneNumber, address: addressForPhone(phoneNumber) };
}

export async function POST(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  // One list, whatever shape it arrived in, with duplicates collapsed.
  const rawRecipients = (Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to]).flatMap(
    (entry) => entry.split(","),
  );

  const recipients: { phoneNumber: string; address: string }[] = [];
  const rejected: string[] = [];

  for (const raw of rawRecipients) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const recipient = parseRecipient(trimmed);
    if (!recipient) {
      rejected.push(trimmed);
      continue;
    }
    if (!recipients.some((existing) => existing.phoneNumber === recipient.phoneNumber)) {
      recipients.push(recipient);
    }
  }

  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error: "`to` must be 10-digit Indian mobile numbers or <phone>@phonemail.com.",
        invalid: rejected,
      },
      { status: 400 },
    );
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "`to` must name at least one recipient." }, { status: 400 });
  }

  const recipientUsers = await prisma.user.findMany({
    where: { phoneNumber: { in: recipients.map((recipient) => recipient.phoneNumber) } },
    select: { id: true, phoneNumber: true },
  });

  const known = new Set(recipientUsers.map((recipient) => recipient.phoneNumber));
  const unknown = recipients
    .map((recipient) => recipient.phoneNumber)
    .filter((phoneNumber) => !known.has(phoneNumber));

  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Recipient not found: ${unknown.join(", ")}.` },
      { status: 404 },
    );
  }

  // Reply-once: claim the original message atomically before sending anything.
  let claimedReplyTo: string | null = null;
  let subject = parsed.data.subject?.trim() ?? "";

  if (parsed.data.replyToId) {
    const original = await prisma.email.findUnique({
      where: { id: parsed.data.replyToId },
      select: { id: true, toUserId: true, subject: true, repliedAt: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Original message not found." }, { status: 404 });
    }
    if (original.toUserId !== user.sub) {
      return NextResponse.json(
        { error: "Only the recipient of a message can reply to it." },
        { status: 403 },
      );
    }
    if (original.repliedAt) {
      return NextResponse.json(
        { error: "You have already replied to this message." },
        { status: 409 },
      );
    }

    const claim = await prisma.email.updateMany({
      where: { id: parsed.data.replyToId, toUserId: user.sub, repliedAt: null },
      data: { repliedAt: new Date() },
    });

    if (claim.count === 0) {
      // Lost the race with a concurrent reply.
      return NextResponse.json(
        { error: "You have already replied to this message." },
        { status: 409 },
      );
    }

    claimedReplyTo = parsed.data.replyToId;
    if (!subject) {
      subject = original.subject.toLowerCase().startsWith("re:")
        ? original.subject
        : `re: ${original.subject}`;
    }
  }

  if (!subject) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }

  const fromAddress = addressForPhone(user.phoneNumber);
  const addresses = recipients.map((recipient) => recipient.address);

  try {
    await submitOutboundEmail({
      from: fromAddress,
      // ONE submission, the full recipient list in To.
      to: addresses,
      subject,
      body: parsed.data.body,
    });
  } catch (error) {
    console.error("[emails] SMTP submission failed", error);
    if (claimedReplyTo) {
      // Do not burn the reply when the send never happened.
      await prisma.email
        .update({ where: { id: claimedReplyTo }, data: { repliedAt: null } })
        .catch(() => undefined);
    }
    return NextResponse.json(
      { error: "Could not hand the message to the mail service. Please try again." },
      { status: 502 },
    );
  }

  // The same derivation the inbound path will use, so the client can open the
  // thread immediately. A hint, not stored state: nothing is written here.
  const threadKey =
    recipients.length > 1
      ? deriveThreadKey([user.phoneNumber, ...recipients.map((recipient) => recipient.phoneNumber)])
      : null;

  // No Email row here on purpose - see the file header.
  return NextResponse.json(
    {
      queued: true,
      from: fromAddress,
      to: addresses,
      threadKey,
      subject,
      replyToId: claimedReplyTo,
      message: "Message submitted to the mail service.",
    },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const emails = await prisma.email.findMany({
    where: { toUserId: user.sub },
    orderBy: { createdAt: "desc" },
    take: INBOX_LIMIT,
    select: {
      id: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
      repliedAt: true,
      tag: true,
    },
  });

  return NextResponse.json(
    {
      count: emails.length,
      emails: emails.map((email) => ({
        id: email.id,
        from: email.fromAddress,
        to: email.toAddress,
        subject: email.subject,
        body: email.body,
        isRead: email.isRead,
        createdAt: email.createdAt,
        repliedAt: email.repliedAt,
        tag: email.tag,
      })),
    },
    { status: 200 },
  );
}
