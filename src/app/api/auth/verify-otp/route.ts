import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingJwtSecretError, signAuthToken } from "@/lib/jwt";
import { verifyOtp } from "@/lib/otp";
import { otpSchema, phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: otpSchema,
  // Which client is registering. Unknown/missing falls back to "mobile", the
  // safe side: it suppresses the new-mail SMS.
  source: z.enum(["mobile", "portal", "desktop"]).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        details: parsed.error.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const { phoneNumber, otp } = parsed.data;
  const registeredVia = parsed.data.source ?? "mobile";

  // 1. Check the code against Redis. Success consumes it (one-time use); the
  //    counter behind the brute-force guard also burns it after 5 failures.
  let verified: Awaited<ReturnType<typeof verifyOtp>>;
  try {
    verified = await verifyOtp(phoneNumber, otp);
  } catch (error) {
    console.error("[verify-otp] Redis failure", error);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return NextResponse.json(
        {
          error: "Too many incorrect attempts. Request a new OTP.",
          attemptsLeft: 0,
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        error: "Invalid or expired OTP.",
        ...(verified.attemptsLeft !== undefined
          ? { attemptsLeft: verified.attemptsLeft }
          : {}),
      },
      { status: 401 },
    );
  }

  // 2. First signup creates the account; later logins reuse the same row.
  try {
    const user = await prisma.user.upsert({
      where: { phoneNumber },
      // Registered-via records FIRST registration: a later sign-in through a
      // different client must not rewrite it.
      update: {},
      create: { phoneNumber, registeredVia },
      select: { id: true, phoneNumber: true, createdAt: true, registeredVia: true },
    });

    const token = signAuthToken(user);

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          createdAt: user.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof MissingJwtSecretError) {
      console.error("[verify-otp] configuration error:", error.message);
      return NextResponse.json(
        { error: "Server misconfiguration: JWT_SECRET is not set." },
        { status: 500 },
      );
    }
    console.error("[verify-otp] failed to create user or sign token", error);
    return NextResponse.json(
      { error: "Could not complete sign-in. Please try again." },
      { status: 500 },
    );
  }
}
