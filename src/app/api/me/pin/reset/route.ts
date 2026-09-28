import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
import { otpSchema } from "@/lib/phone";
import { clearPinFailures, hashPin, pinProblem } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/pin/reset - a forgotten PIN, replaced through the OTP flow.
 *
 * Reuses the account-verification pattern from DELETE /api/me/delete, and for the
 * same reason: a forgotten PIN is exactly the case where the PIN cannot be the
 * proof of identity. The proof is a live one-time code for the account's own
 * number - single-use, attempt-limited and on the same 5-minute TTL, obtained
 * through /api/auth/send-otp and therefore under its 60-second cooldown.
 *
 * The old PIN is NOT required (that is the situation being recovered from), and
 * the strikes are cleared: the recovery is a new lock, not a contest with the old
 * one.
 */

const schema = z.object({
  otp: otpSchema,
  pin: z.string().max(32),
});

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A one-time code and a new PIN are required." },
      { status: 400 },
    );
  }

  const problem = pinProblem(parsed.data.pin);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const account = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, phoneNumber: true },
  });
  if (!account) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  let verified: Awaited<ReturnType<typeof verifyOtp>>;
  try {
    verified = await verifyOtp(account.phoneNumber, parsed.data.otp);
  } catch (error) {
    console.error("[me/pin/reset] Redis failure", error);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Request a new code.", attemptsLeft: 0 },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: verified.reason === "missing" ? "That code has expired. Request a new one." : "That code is not right.",
        attemptsLeft: verified.attemptsLeft,
      },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: account.id },
    data: { pinHash: await hashPin(parsed.data.pin) },
  });
  await clearPinFailures(account.id);

  return NextResponse.json({ hasPin: true, pinLength: parsed.data.pin.length, changed: "reset" }, { status: 200 });
}
