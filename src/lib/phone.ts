import { z } from "zod";

/**
 * Phone-number handling for PhoneMail.
 *
 * The account identity is a bare 10-digit Indian mobile number
 * (e.g. "9876543210"), stored WITHOUT country code or punctuation, because it
 * later becomes the left-hand side of `9876543210@phonemail.com`.
 */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * Normalizes user input to the 10-digit canonical form.
 * Accepts `+91 98765 43210`, `919876543210`, `09876543210`, `98765-43210`, ...
 * Anything else is returned unchanged and then rejected by validation.
 */
export function normalizePhoneNumber(input: string): string {
  const stripped = input.replace(/[\s\-().]/g, "");

  if (stripped.startsWith("+91")) {
    return stripped.slice(3);
  }
  if (stripped.startsWith("91") && stripped.length === 12) {
    return stripped.slice(2);
  }
  if (stripped.startsWith("0") && stripped.length === 11) {
    return stripped.slice(1);
  }
  return stripped;
}

/** Validates that a string is a 10-digit Indian mobile number (starts 6-9). */
export function isValidIndianMobile(input: string): boolean {
  return INDIAN_MOBILE.test(input);
}

export const phoneNumberSchema = z
  .string({ required_error: "phoneNumber is required" })
  .trim()
  .min(1, "phoneNumber is required")
  .transform(normalizePhoneNumber)
  .refine(isValidIndianMobile, {
    message: "phoneNumber must be a 10-digit Indian mobile number starting with 6, 7, 8 or 9",
  });

export const otpSchema = z
  .string({ required_error: "otp is required" })
  .trim()
  .regex(/^\d{6}$/, "otp must be a 6-digit code");
