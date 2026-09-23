import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { addressForPhone, submitOutboundEmail } from "@/lib/mailer";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound mail.
 *
 * POST deliberately does NOT write an Email row: it only submits the message to
 * our SMTP service. The row is created when the SMTP service posts the message
 * back to /api/mail/inbound, so a bug in SMTP delivery cannot silently produce
 * a "sent" email that nobody received.
 */

const INBOX_LIMIT = 50;

const sendSchema = z.object({
  to: z.string().trim().min(1, "to is required"),
  subject: z.string().trim().min(1, "subject is required").max(200),
  body: z.string().min(1, "body is required"),
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

  const recipient = parseRecipient(parsed.data.to);
  if (!recipient) {
    return NextResponse.json(
      { error: "`to` must be a 10-digit Indian mobile number or <phone>@phonemail.com." },
      { status: 400 },
    );
  }

  const recipientUser = await prisma.user.findUnique({
    where: { phoneNumber: recipient.phoneNumber },
    select: { id: true, phoneNumber: true },
  });

  if (!recipientUser) {
    return NextResponse.json(
      { error: "Recipient not found." },
      { status: 404 },
    );
  }

  const fromAddress = addressForPhone(user.phoneNumber);

  try {
    await submitOutboundEmail({
      from: fromAddress,
      to: recipient.address,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });
  } catch (error) {
    console.error("[emails] SMTP submission failed", error);
    return NextResponse.json(
      { error: "Could not hand the message to the mail service. Please try again." },
      { status: 502 },
    );
  }

  // No Email row here on purpose — see the file header.
  return NextResponse.json(
    {
      queued: true,
      from: fromAddress,
      to: recipient.address,
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
      })),
    },
    { status: 200 },
  );
}
