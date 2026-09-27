import { oneShotPlan, planIvrResponse, type IvrPlan, type IvrState } from "@/lib/ivr";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ivr/signup — the IVR phone tree.
 *
 * The caller's number is PROVEN BY THE CALL ITSELF, so no OTP is involved: you
 * cannot place a call from a number you do not control, and the provider reports it
 * in `From` (Twilio) or `CallFrom` (Exotel). That is why this route is allowed to
 * create an account directly — and it is the ONLY place, besides `Digits=4` on the
 * main menu, where an account is created here at all.
 *
 * TWILIO MAKES A NEW REQUEST FOR EVERY MENU STEP, so the call's state (which stage,
 * which language, how many times this stage has been replayed) rides in the Gather
 * action URL's query params and the server stays stateless. The flow itself is a
 * pure function — `src/lib/ivr.ts` — and this file keeps only the three things that
 * are not pure: the token check, reading the caller's number, and the one write.
 *
 * Auth: a shared secret on EVERY request, the same pattern as the mail webhook. It
 * is passed as `?token=***` in the URL the provider is configured with (it survives
 * an XML applet's passthrough), and an `x-ivr-secret` header also works for direct
 * testing. A wrong or missing token is 401 XML — at every stage, including the first.
 *
 * TWO PATHS, BRANCHING ON WHAT ARRIVED:
 *   - Exotel (a `CallFrom` and no `stage`): the ORIGINAL one-shot reply — press 1
 *     and the account is ready. Unchanged.
 *   - Twilio (a `From`, with or without a `stage`): the voice tree. No stage means
 *     STEP 1.
 */

const SECRET_HEADER = "x-ivr-secret";
const SECRET_QUERY = "token";

/** Pulls the caller's number out of anything a provider might send it in. */
async function callerFrom(
  request: Request,
  url: URL,
): Promise<{ phone: string; source: string }> {
  const fromQuery =
    url.searchParams.get("CallFrom") ?? url.searchParams.get("From") ?? url.searchParams.get("from") ?? "";
  if (fromQuery) {
    return { phone: fromQuery, source: url.searchParams.get("CallFrom") ? "CallFrom" : "From" };
  }

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { CallFrom?: string; From?: string };
      return { phone: body.CallFrom ?? body.From ?? "", source: body.CallFrom ? "CallFrom" : "From" };
    }
    if (contentType.includes("form-urlencoded")) {
      const form = await request.formData();
      const callFrom = form.get("CallFrom");
      return {
        phone: String(callFrom ?? form.get("From") ?? ""),
        source: callFrom ? "CallFrom" : "From",
      };
    }
  } catch {
    // An unreadable body just means no caller number.
  }
  return { phone: "", source: "none" };
}

export async function POST(request: Request) {
  const expected = process.env.IVR_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[ivr] IVR_WEBHOOK_SECRET is not configured");
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="woman">Sorry, PhoneMail signup is not available right now.</Say>\n</Response>`,
      503,
    );
  }

  const url = new URL(request.url);
  const provided = request.headers.get(SECRET_HEADER) ?? url.searchParams.get(SECRET_QUERY);
  if (provided !== expected) {
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="woman">Sorry, this call is not authorized.</Say>\n</Response>`,
      401,
    );
  }

  const caller = await callerFrom(request, url);
  const callerPhone = normalizePhoneNumber(caller.phone);

  if (!/^[6-9]\d{9}$/.test(callerPhone)) {
    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="woman">Sorry, we could not read your number. Please try again.</Say>\n</Response>`,
      400,
    );
  }

  const stage = url.searchParams.get("stage");
  const digits =
    url.searchParams.get("Digits") ?? url.searchParams.get("DtmfDigits") ?? url.searchParams.get("digits");
  const lang = url.searchParams.get("lang");
  const attempts = Number.parseInt(url.searchParams.get("attempts") ?? "0", 10);
  const token = url.searchParams.get(SECRET_QUERY) ?? "";

  const state: IvrState = {
    stage,
    digits,
    lang,
    attempts: Number.isFinite(attempts) ? attempts : 0,
    callerPhone,
    token,
  };

  // The Exotel path: a CallFrom and no stage is the one-shot reply, exactly as it
  // was before the tree existed.
  const isExotel = caller.source === "CallFrom" && !stage;
  const plan: IvrPlan = isExotel ? oneShotPlan(state) : planIvrResponse(state);

  if (plan.register) {
    // Idempotent: pressing 4 twice (or calling again) returns the same account,
    // never a duplicate. This is the ONLY write on this path.
    const user = await prisma.user.upsert({
      where: { phoneNumber: callerPhone },
      update: {},
      create: { phoneNumber: callerPhone, registeredVia: "ivr" },
      select: { id: true, phoneNumber: true },
    });
    console.log(`[ivr] signup for ${user.phoneNumber} (user ${user.id})`);
  } else {
    console.log(
      `[ivr] stage=${stage ?? "(greeting)"} digits=${digits ?? "-"} attempts=${state.attempts} from=${caller.source}`,
    );
  }

  return xmlResponse(plan.xml, plan.status);
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
