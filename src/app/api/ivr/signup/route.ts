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
 * are not pure: the token check, reading the parameters, and the one write.
 *
 * WHERE THE PARAMETERS COME FROM — the bug this fixed. Twilio sends `Digits`, `From`
 * and `CallSid` in the POST BODY as `application/x-www-form-urlencoded`, and the
 * query string carries only what OUR action URL put there (`token`, `stage`, `lang`,
 * `attempts`). Reading the digits from the query alone therefore saw an empty digit
 * on every real call and replayed the menu for ever — while the unit tests stayed
 * green, because the flow itself was right. Every parameter is now read from BOTH
 * sources, with the QUERY WINNING where they disagree: the query is what our own
 * action URL carried, so it is the more specific instruction.
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

/**
 * One lookup over BOTH the POST body and the query string, so a provider can put a
 * parameter wherever it likes. The query wins: it is our own action URL, and it is
 * the more specific instruction when the two disagree.
 */
async function readParams(
  request: Request,
  url: URL,
): Promise<{ get: (name: string) => string | null; callerParam: string }> {
  const body = new Map<string, string>();
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("form-urlencoded")) {
      const form = await request.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string" && value.length > 0) {
          body.set(key, value);
        }
      }
    } else if (contentType.includes("application/json")) {
      const parsed = (await request.json()) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value.length > 0) {
          body.set(key, value);
        }
      }
    }
  } catch {
    // An unreadable body simply means nothing came from it.
  }

  const get = (name: string): string | null => {
    const fromQuery = url.searchParams.get(name);
    if (fromQuery !== null && fromQuery !== "") {
      return fromQuery;
    }
    return body.get(name) ?? null;
  };

  // Which provider this is: the caller field names differ, and either source may
  // carry it.
  const callerParam = get("CallFrom") !== null ? "CallFrom" : "From";
  return { get, callerParam };
}

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

function apology(say: string, status: number) {
  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="woman">${say}</Say>\n</Response>`,
    status,
  );
}

export async function POST(request: Request) {
  const expected = process.env.IVR_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[ivr] IVR_WEBHOOK_SECRET is not configured");
    return apology("Sorry, PhoneMail signup is not available right now.", 503);
  }

  const url = new URL(request.url);
  const provided = request.headers.get(SECRET_HEADER) ?? url.searchParams.get(SECRET_QUERY);
  if (provided !== expected) {
    return apology("Sorry, this call is not authorized.", 401);
  }

  const { get, callerParam } = await readParams(request, url);

  const callerPhone = normalizePhoneNumber(get(callerParam) ?? "");
  if (!/^[6-9]\d{9}$/.test(callerPhone)) {
    return apology("Sorry, we could not read your number. Please try again.", 400);
  }

  const stage = get("stage");
  const digits = get("Digits") ?? get("DtmfDigits") ?? get("digits");
  const lang = get("lang");
  const attempts = Number.parseInt(get("attempts") ?? "0", 10);
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
  const isExotel = callerParam === "CallFrom" && !stage;
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
      `[ivr] stage=${stage ?? "(greeting)"} digits=${digits ?? "-"} attempts=${state.attempts} from=${callerParam}`,
    );
  }

  return xmlResponse(plan.xml, plan.status);
}
