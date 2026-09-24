import { NextResponse } from "next/server";
import { z } from "zod";

import { submitInboundEmail } from "@/lib/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal webhook called by our own SMTP service after it accepts a message.
 *
 * Auth is a shared secret, not a JWT: the SMTP container has no user token and
 * never acts on behalf of a user. Keep this route unreachable from outside the
 * Compose network - it is what turns a delivered message into an Email row.
 *
 * Day 6: the SMTP service sends the FULL recipient list in one submission
 * (`to` as an array), and the inbound path fans that out into one row per
 * recipient. A bare string is still accepted - and a comma list is split - so an
 * older SMTP container keeps working.
 */

const HEADER = "x-mail-secret";

const inboundSchema = z.object({
  from: z.string().trim().min(1),
  to: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(","))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .refine((list) => list.length > 0, { message: "to must contain at least one recipient" }),
  subject: z.string().trim().default("(no subject)"),
  body: z.string().default(""),
});

export async function POST(request: Request) {
  const expected = process.env.MAIL_WEBHOOK_SECRET;
  const provided = request.headers.get(HEADER);

  if (!expected) {
    console.error("[mail/inbound] MAIL_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Mail webhook is not configured." }, { status: 503 });
  }

  if (provided !== expected) {
    return NextResponse.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = inboundSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid inbound message.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const result = await submitInboundEmail(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const first = result.deliveries[0];

  return NextResponse.json(
    {
      stored: true,
      count: result.deliveries.length,
      threadKey: result.threadKey,
      // The flat fields are kept for the single-recipient callers (and the SMTP
      // service's one-line delivery log) that read them.
      ...(result.deliveries.length === 1
        ? {
            emailId: first.emailId,
            recipientUserId: first.recipientUserId,
            socketNotified: first.socketNotified,
            smsNotification: first.smsNotification,
          }
        : {}),
      deliveries: result.deliveries.map((delivery) => ({
        emailId: delivery.emailId,
        recipientUserId: delivery.recipientUserId,
        recipient: delivery.recipient,
        socketNotified: delivery.socketNotified,
        smsNotification: delivery.smsNotification,
      })),
    },
    { status: 202 },
  );
}
