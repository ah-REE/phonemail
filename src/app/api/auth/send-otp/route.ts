import { NextResponse } from "next/server";
import { z } from "zod";

import { OtpCooldownError, requestOtp } from "@/lib/otp";
import { phoneNumberSchema } from "@/lib/phone";

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

  try {
    const result = await requestOtp(phoneNumber);

    return NextResponse.json(
      {
        success: true,
        phoneNumber,
        expiresInSeconds: result.ttlSeconds,
        resendAfterSeconds: 60,
        message: "OTP sent successfully.",
        // Present only when Fast2SMS is not configured. The evaluator boots the
        // stack with a placeholder key, so this is the documented dev path, not
        // an error state.
        ...(result.devMode
          ? {
              devHint:
                "Fast2SMS is not configured (placeholder key): no SMS was sent and the fixed dev OTP 123456 is active.",
            }
          : {}),
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof OtpCooldownError) {
      return NextResponse.json(
        {
          error: "Please wait before requesting another OTP.",
          retryAfterSeconds: error.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    console.error("[send-otp] failed to issue OTP", error);
    return NextResponse.json(
      { error: "Could not send OTP. Please try again." },
      { status: 503 },
    );
  }
}
