import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ivr/signup — Exotel IVR signup.
 *
 * When a caller presses 1, Exotel requests this URL. The caller's number is
 * PROVEN BY THE CALL ITSELF, so no OTP is involved: you cannot place a call
 * from a number you do not control, and Exotel reports it in `CallFrom`. That
 * is why this route is allowed to create an account directly.
 *
 * Auth: a shared secret, the same pattern as the mail webhook. It is passed as
 * `?token=…` in the URL Exotel is configured with (simplest option that
 * survives an XML applet's passthrough), and an `x-ivr-secret` header also
 * works for direct testing.
 *
 * Response: Exotel's flow expects XML applets, so we answer with a `<Response>`
 * containing a `<Say>` — "account is ready" or a short apology.
 */

const SECRET_HEADER = "x-ivr-secret";
const SECRET_QUERY = "token";

function xml(body: string, status = 200) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="woman">${body}</Say>\n</Response>`,
    { status, headers: { "content-type": "application/xml; charset=utf-8" } },
  );
}

/** Pulls the caller's number out of anything Exotel might send it in. */
async function callerFrom(request: Request, url: URL): Promise<string> {
  const fromQuery = url.searchParams.get("CallFrom") ?? url.searchParams.get("From") ?? "";
  if (fromQuery) {
    return fromQuery;
  }

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { CallFrom?: string; From?: string };
      return body.CallFrom ?? body.From ?? "";
    }
    if (contentType.includes("form-urlencoded")) {
      const form = await request.formData();
      return String(form.get("CallFrom") ?? form.get("From") ?? "");
    }
  } catch {
    // fall through: an unreadable body just means no caller number
  }
  return "";
}

export async function POST(request: Request) {
  const expected = process.env.IVR_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[ivr] IVR_WEBHOOK_SECRET is not configured");
    return xml("Sorry, PhoneMail signup is not available right now.", 503);
  }

  const url = new URL(request.url);
  const provided = request.headers.get(SECRET_HEADER) ?? url.searchParams.get(SECRET_QUERY);
  if (provided !== expected) {
    return xml("Sorry, this call is not authorized.", 401);
  }

  const rawCaller = await callerFrom(request, url);
  const callerPhone = normalizePhoneNumber(rawCaller);

  if (!/^[6-9]\d{9}$/.test(callerPhone)) {
    return xml("Sorry, we could not read your number. Please try again.", 400);
  }

  // Idempotent: pressing 1 twice returns the same account, never a duplicate.
  const user = await prisma.user.upsert({
    where: { phoneNumber: callerPhone },
    update: {},
    create: { phoneNumber: callerPhone, registeredVia: "ivr" },
    select: { id: true, phoneNumber: true },
  });

  console.log(`[ivr] signup for ${user.phoneNumber} (user ${user.id})`);

  return xml("Your PhoneMail account is ready. You can send and receive messages now.");
}
