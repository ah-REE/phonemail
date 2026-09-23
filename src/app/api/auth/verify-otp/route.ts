import { NextResponse } from "next/server";
import { z } from "zod";

import { MissingJwtSecretError, signAuthToken } from "@/lib/jwt";
import { otpKey } from "@/lib/otp";
import { otpSchema, phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: otpSchema,
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
  const key = otpKey(phoneNumber);

  // 1. Check the submitted OTP against the value stored by /send-otp.
  let storedOtp: string | null;
  try {
    const redis = await getRedis();
    storedOtp = await redis.get(key);
  } catch (error) {
    console.error("[verify-otp] Redis read failed", error);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!storedOtp || storedOtp !== otp) {
    return NextResponse.json(
      { error: "Invalid or expired OTP." },
      { status: 401 },
    );
  }

  // 2. One-time use: consume the OTP as soon as it is verified.
  try {
    const redis = await getRedis();
    await redis.del(key);
  } catch (error) {
    console.error("[verify-otp] Redis delete failed", error);
  }

  // 3. First signup creates the account; later logins reuse the same row.
  try {
    const user = await prisma.user.upsert({
      where: { phoneNumber },
      update: {},
      create: { phoneNumber },
      select: { id: true, phoneNumber: true, createdAt: true },
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
