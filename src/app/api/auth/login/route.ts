import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingJwtSecretError, signAuthToken } from "@/lib/jwt";
import {
  PASSWORD_MAX_ATTEMPTS,
  clearPasswordAttempts,
  passwordLockSecondsLeft,
  recordFailedPasswordAttempt,
  verifyPassword,
} from "@/lib/password";
import { phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login — phone number + password (Phase 0).
 *
 * This is the ADDED path, not the primary one. Two things make it safe:
 *
 *  1. It issues the SAME token shape verify-otp issues (lib/jwt signAuthToken),
 *     so every downstream guard, socket handshake and API route is untouched.
 *  2. Failure is rate-limited with the same Redis-counter pattern the OTP flow
 *     uses: five failures lock the number for the counter's TTL.
 *
 * An account with no password is not an error the user should be stuck on: the
 * response says `needsPassword` so the client can offer the OTP route and the
 * "set your password" step, which is exactly what the brief asks for.
 */

const requestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  password: z.string().min(1, "password is required"),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { phoneNumber, password } = parsed.data;

  try {
    const lockedFor = await passwordLockSecondsLeft(phoneNumber);
    if (lockedFor > 0) {
      return NextResponse.json(
        {
          error: "Too many attempts. Try again shortly, or sign in with an OTP.",
          retryAfterSeconds: lockedFor,
          canUseOtp: true,
        },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      select: { id: true, phoneNumber: true, createdAt: true, passwordHash: true },
    });

    // No account, or an account that has never set a password: same answer, and
    // it points at the path that always works.
    if (!user || !user.passwordHash) {
      await recordFailedPasswordAttempt(phoneNumber);
      return NextResponse.json(
        {
          error: "This number has no password yet. Sign in with an OTP, then set one.",
          needsPassword: true,
          canUseOtp: true,
        },
        { status: 401 },
      );
    }

    const matches = await verifyPassword(password, user.passwordHash);
    if (!matches) {
      const attemptsLeft = await recordFailedPasswordAttempt(phoneNumber);
      return NextResponse.json(
        {
          error: "Incorrect phone number or password.",
          attemptsLeft,
          canUseOtp: true,
          ...(attemptsLeft === 0 ? { retryAfterSeconds: 300 } : {}),
        },
        { status: attemptsLeft === 0 ? 429 : 401 },
      );
    }

    await clearPasswordAttempts(phoneNumber);

    const token = signAuthToken(user);

    return NextResponse.json(
      {
        token,
        user: { id: user.id, phoneNumber: user.phoneNumber, createdAt: user.createdAt },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MissingJwtSecretError) {
      console.error("[login] configuration error:", error.message);
      return NextResponse.json(
        { error: "Server misconfiguration: JWT_SECRET is not set." },
        { status: 500 },
      );
    }
    console.error("[login] failed", error);
    return NextResponse.json({ error: "Could not sign in. Please try again." }, { status: 500 });
  }
}
