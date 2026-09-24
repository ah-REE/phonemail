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
 * Compose network — it is what turns a delivered message into an Email row.
 */

const HEADER = "x-mail-secret";

const inboundSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
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

  return NextResponse.json(
    {
      stored: true,
      emailId: result.emailId,
      recipientUserId: result.recipientUserId,
      socketNotified: result.socketNotified,
      smsNotification: result.smsNotification,
    },
    { status: 202 },
  );
}
