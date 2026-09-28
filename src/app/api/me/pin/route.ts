import { z } from "zod";
import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { clearPinFailures, comparePin, hashPin, pinProblem, readPinLock, registerPinFailure } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/me/pin - set, change, or remove the app PIN.
 *
 * THREE CASES, ONE ROUTE, because they are one decision:
 *   - no PIN stored yet            -> any valid PIN is accepted (setting it);
 *   - a PIN is stored              -> the CURRENT one must be supplied, whether the
 *                                     caller is changing it or turning it off;
 *   - `pin` omitted or empty       -> removal.
 *
 * Requiring the current PIN to REMOVE one is the whole point: without it, anyone
 * holding an unlocked phone could switch the lock off in two taps.
 *
 * The response reports `hasPin` rather than the hash - the client only ever needs
 * to know whether the lock is on.
 */

const schema = z.object({
  pin: z.string().max(32).optional(),
  currentPin: z.string().max(32).optional(),
});

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const account = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, pinHash: true },
  });
  if (!account) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  const wantsRemoval = !parsed.data.pin;

  // Changing or removing: the current PIN is required, and it is checked with the
  // same strike accounting the unlock uses - so guessing here costs the same.
  if (account.pinHash) {
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
    if (!parsed.data.currentPin) {
      return NextResponse.json(
        { error: "Your current PIN is required.", reason: "current-pin-required" },
        { status: 400 },
      );
    }
    if (!(await comparePin(parsed.data.currentPin, account.pinHash))) {
      const failure = await registerPinFailure(account.id);
      return NextResponse.json(
        failure.locked
          ? {
              error: `Too many incorrect PINs. Try again in ${failure.retryAfterSeconds}s.`,
              reason: "lockout",
              retryAfterSeconds: failure.retryAfterSeconds,
            }
          : { error: "That is not your current PIN.", attemptsLeft: failure.attemptsLeft },
        { status: failure.locked ? 429 : 401 },
      );
    }
  }

  if (wantsRemoval) {
    await prisma.user.update({ where: { id: account.id }, data: { pinHash: null } });
    await clearPinFailures(account.id);
    return NextResponse.json({ hasPin: false, pinLength: null, changed: "removed" }, { status: 200 });
  }

  const problem = pinProblem(parsed.data.pin);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: account.id },
    data: { pinHash: await hashPin(parsed.data.pin as string) },
  });
  await clearPinFailures(account.id);

  return NextResponse.json(
    { hasPin: true, pinLength: (parsed.data.pin as string).length, changed: account.pinHash ? "changed" : "set" },
    { status: 200 },
  );
}
