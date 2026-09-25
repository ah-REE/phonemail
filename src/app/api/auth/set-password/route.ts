import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingJwtSecretError, signAuthToken } from "@/lib/jwt";
import { verifyOtp } from "@/lib/otp";
import { hashPassword, passwordProblem } from "@/lib/password";
import { otpSchema, phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/set-password (Phase 0).
 *
 * The OTP is the gate. Setting a password is only possible with a code that
 * proves control of the number, which is why this route does not need the old
 * password and why it works for both cases the brief names:
 *
 *  - the NEW signup flow, right after the OTP step, and
 *  - an EXISTING account that has never had a password.
 *
 * It returns the same token shape as verify-otp, so the client can go straight
 * to the inbox either way. The OTP flow itself is untouched.
 */

const requestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: otpSchema,
  password: z.string().min(1, "password is required"),
  confirm: z.string().min(1).optional(),
  source: z.enum(["mobile", "portal", "desktop"]).optional(),
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

  const { phoneNumber, otp, password } = parsed.data;
  const registeredVia = parsed.data.source ?? "mobile";

  // The confirm field is a client convenience, but if it is sent it must match -
  // a typo here would lock the user out of the path they just created.
  if (parsed.data.confirm !== undefined && parsed.data.confirm !== password) {
    return NextResponse.json({ error: "The two passwords do not match." }, { status: 400 });
  }

  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  let verified: Awaited<ReturnType<typeof verifyOtp>>;
  try {
    verified = await verifyOtp(phoneNumber, otp);
  } catch (error) {
    console.error("[set-password] Redis failure", error);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Request a new OTP.", attemptsLeft: 0 },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: "Invalid or expired OTP.",
        ...(verified.attemptsLeft !== undefined ? { attemptsLeft: verified.attemptsLeft } : {}),
      },
      { status: 401 },
    );
  }

  try {
    const passwordHash = await hashPassword(password);

    // Upsert matches verify-otp exactly: the first signup creates the row, and a
    // later set-password only fills in the hash.
    const user = await prisma.user.upsert({
      where: { phoneNumber },
      update: { passwordHash },
      create: { phoneNumber, registeredVia, passwordHash },
      select: { id: true, phoneNumber: true, createdAt: true },
    });

    const token = signAuthToken(user);

    return NextResponse.json(
      {
        token,
        user: { id: user.id, phoneNumber: user.phoneNumber, createdAt: user.createdAt },
        address: `${user.phoneNumber}@phonemail.com`,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MissingJwtSecretError) {
      console.error("[set-password] configuration error:", error.message);
      return NextResponse.json(
        { error: "Server misconfiguration: JWT_SECRET is not set." },
        { status: 500 },
      );
    }
    console.error("[set-password] failed", error);
    return NextResponse.json(
      { error: "Could not set the password. Please try again." },
      { status: 500 },
    );
  }
}
