import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingJwtSecretError, signAuthToken } from "@/lib/jwt";
import { phoneNumberSchema } from "@/lib/phone";
import { clearPinFailures, comparePin, readPinLock, registerPinFailure } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login-pin - sign in with the account's PIN (round 28).
 *
 * ONE PIN, TWO JOBS. Since round 22 the PIN has unlocked the INTERFACE
 * (`/api/me/verify-pin`); this route makes the same PIN an optional way to SIGN
 * IN, for the person who would rather not wait for a code every time. OTP stays
 * the default and primary path (the spec's own preference) - the clients offer
 * this one only for accounts that have a PIN, and only behind a quiet link.
 *
 * WHAT IT ISSUES: exactly what verify-otp issues - the same JWT and the same
 * Session row - so a PIN sign-in is a real sign-in: it appears in Settings'
 * device list, can be logged out on its own, and ends with account deletion like
 * any other session. (verify-otp is the source of the issuance shape; if one
 * changes, both must.)
 *
 * WHAT PROTECTS IT: the established strike accounting, shared with the unlock
 * and with PIN change/removal - five wrong entries refuse the PIN for 60 seconds
 * per ACCOUNT (`lib/pin.ts`), so this door is never more guessable than the one
 * the lock screen already pays for. A correct entry clears the strikes, and the
 * client then stands the tab's lock down, because the PIN was just proven.
 *
 * AN UNKNOWN NUMBER, AND A NUMBER WITHOUT A PIN, get the same 401 - the response
 * says "not available" rather than which of the two it is.
 */

const schema = z.object({
  phoneNumber: phoneNumberSchema,
  pin: z.string().min(1).max(32),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const { phoneNumber, pin } = parsed.data;

  const account = await prisma.user.findUnique({
    where: { phoneNumber },
    select: { id: true, phoneNumber: true, createdAt: true, registeredVia: true, pinHash: true },
  });

  if (!account || !account.pinHash) {
    return NextResponse.json(
      { error: "PIN login is not available for this number. Use a one-time code instead." },
      { status: 401 },
    );
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

  if (!(await comparePin(pin, account.pinHash))) {
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

  await clearPinFailures(account.id);

  // The SAME session issuance verify-otp performs - one shape, two doors.
  try {
    const session = await prisma.session.create({
      data: {
        userId: account.id,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      select: { id: true },
    });
    const token = signAuthToken(
      { id: account.id, phoneNumber: account.phoneNumber },
      session.id,
    );

    return NextResponse.json(
      {
        token,
        user: {
          id: account.id,
          phoneNumber: account.phoneNumber,
          createdAt: account.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MissingJwtSecretError) {
      console.error("[login-pin] configuration error:", error.message);
      return NextResponse.json(
        { error: "Server misconfiguration: JWT_SECRET is not set." },
        { status: 500 },
      );
    }
    console.error("[login-pin] session issuance failed", error);
    return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
  }
}
