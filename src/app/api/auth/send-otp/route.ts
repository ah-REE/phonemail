import { NextResponse } from "next/server";
import { z } from "zod";

import { DEV_FAKE_OTP, OTP_TTL_SECONDS, otpKey } from "@/lib/otp";
import { phoneNumberSchema } from "@/lib/phone";
import { getRedis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  phoneNumber: phoneNumberSchema,
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
        error: "Invalid phone number.",
        details: parsed.error.issues.map((issue) => issue.message),
        expected: "10-digit Indian mobile number (starting with 6-9)",
      },
      { status: 400 },
    );
  }

  const { phoneNumber } = parsed.data;

  // Day 1: fixed fake OTP, no SMS is sent.
  // Day 2 hook: generate a random OTP here and call Fast2SMS with
  //   route=otp, variables_values=<otp>, numbers=<phoneNumber>
  // using process.env.FAST2SMS_API_KEY, then store the generated value below.
  const otp = DEV_FAKE_OTP;

  try {
    const redis = await getRedis();
    await redis.set(otpKey(phoneNumber), otp, { EX: OTP_TTL_SECONDS });
  } catch (error) {
    console.error("[send-otp] failed to store OTP in Redis", error);
    return NextResponse.json(
      { error: "Could not send OTP. Please try again." },
      { status: 503 },
    );
  }

  // The OTP is intentionally NOT echoed back in the response.
  return NextResponse.json(
    {
      success: true,
      phoneNumber,
      expiresInSeconds: OTP_TTL_SECONDS,
      message: "OTP sent successfully.",
    },
    { status: 200 },
  );
}
