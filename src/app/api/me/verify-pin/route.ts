import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { clearPinFailures, comparePin, pinProblem, readPinLock, registerPinFailure } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/verify-pin - the unlock check.
 *
 * This is the one place a wrong PIN costs something. The strikes are counted
 * against the USER, not the tab, so five wrong entries on one device refuse the
 * PIN on every device for a minute - a lock that resets itself when you reload the
 * page would not be a lock.
 *
 * It deliberately does NOT issue, refresh or inspect the session token: the token
 * is already valid (that is why the lock screen is being shown at all), and the PIN
 * gates the INTERFACE. See docs/SECURITY.md.
 */

const schema = z.object({ pin: z.string().max(32) });

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A PIN is required." }, { status: 400 });
  }

  const account = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, pinHash: true },
  });
  if (!account) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }
  if (!account.pinHash) {
    // No lock to satisfy: say so plainly rather than 401, so a client that holds a
    // stale "locked" flag can clear it instead of trapping the reader.
    return NextResponse.json({ ok: true, hasPin: false }, { status: 200 });
  }

  const lock = await readPinLock(account.id);
  if (lock.locked) {
    return NextResponse.json(
      {
        error: `Too many incorrect PINs. Try again in ${lock.retryAfterSeconds}s.`,
        reason: "lockout",
        retryAfterSeconds: lock.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  if (await comparePin(parsed.data.pin, account.pinHash)) {
    await clearPinFailures(account.id);
    return NextResponse.json({ ok: true, hasPin: true }, { status: 200 });
  }

  const failure = await registerPinFailure(account.id);
  if (failure.locked) {
    return NextResponse.json(
      {
        error: `Too many incorrect PINs. Try again in ${failure.retryAfterSeconds}s.`,
        reason: "lockout",
        retryAfterSeconds: failure.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { error: "Wrong PIN.", attemptsLeft: failure.attemptsLeft },
    { status: 401 },
  );
}
