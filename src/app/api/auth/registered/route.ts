import { NextResponse } from "next/server";

import { phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/registered?phoneNumber=... - does an account exist for this number?
 *
 * ROUND 4, TASK 1. The auth flow has two doors (sign up, log in) but one
 * mechanism (a one-time code), so the copy a person reads is decided by the STATE
 * OF THE NUMBER, not by which button they pressed:
 *
 *   - a REGISTERED number, whatever door it came through, is a login: "Welcome
 *     back" -> OTP -> inbox.
 *   - an UNREGISTERED number on the LOGIN door is not a dead end: the flow carries
 *     the number into account creation and says so - "let's create your
 *     account".
 *
 * Doing this on the CLIENT from the OTP response would be too late: the person
 * needs to know which of the two they are doing before they ask for the code. So
 * the fact is asked for explicitly, once, and the answer is the truth from the
 * database rather than a guess.
 *
 * It deliberately answers with booleans and nothing else - no id, no name, no
 * timestamps - because the only questions the flow has are whether the account
 * exists and (round 28) whether it has a PIN to offer as an optional login
 * door. Both are facts the flow already reveals by behaviour: a registered
 * number logs in, and a PIN-bearing number can use the PIN link.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("phoneNumber") ?? "";
  const parsed = phoneNumberSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid phone number.",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { phoneNumber: parsed.data },
    select: { id: true, pinHash: true },
  });

  return NextResponse.json(
    {
      phoneNumber: parsed.data,
      registered: Boolean(user),
      // ROUND 28: the flag the login screens need to offer "Login with PIN
      // instead" ONLY where a PIN exists. A boolean, like `registered` - and
      // like it, a fact the flow otherwise learns by behaviour. Never the hash.
      hasPin: Boolean(user?.pinHash),
    },
    { status: 200 },
  );
}
