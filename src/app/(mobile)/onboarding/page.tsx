"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Mobile onboarding: language -> terms -> phone -> OTP.
 *
 * Talks to the real Day 1/2 endpoints (no mock), so the dev-OTP path the
 * evaluator uses is exercised end to end here. Server behaviour it must mirror:
 *  - send-otp returns `resendAfterSeconds` (60) and, in dev mode, a `devHint`
 *  - a second send inside the cooldown is 429
 *  - five wrong codes lock the pending OTP (429) and a new code is required
 */

type Step = "language" | "phone" | "otp";

interface SendOtpResponse {
  success?: boolean;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  devHint?: string;
  error?: string;
  retryAfterSeconds?: number;
}

interface VerifyOtpResponse {
  token?: string;
  user?: { id: string; phoneNumber: string; createdAt?: string };
  error?: string;
  attemptsLeft?: number;
}

const LANGUAGES = [
  { code: "en", label: "English", ready: true },
  { code: "hi", label: "हिन्दी (Hindi)", ready: false },
  { code: "ta", label: "தமிழ் (Tamil)", ready: false },
];

const OTP_LENGTH = 6;

/**
 * Last number used on THIS DEVICE.
 *
 * The spec asks for the number to be "automatically detected and pre-filled".
 * A browser cannot read the SIM, so that is impossible on the web — this is the
 * honest equivalent: the last number that successfully signed up here is
 * remembered in localStorage (deliberately NOT the session store, so it
 * survives closing the tab and is unrelated to being signed in).
 */
const LAST_PHONE_KEY = "phonemail.lastPhone";

export default function OnboardingPage() {
  const router = useRouter();
  const { status, token, signIn } = useAuth();

  const [step, setStep] = useState<Step>("language");
  const [language, setLanguage] = useState("en");


  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [lockedOut, setLockedOut] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Pre-fill the last number used on this device, if any.
  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(LAST_PHONE_KEY);
      if (remembered && /^[6-9]\d{9}$/.test(remembered)) {
        setPhoneNumber(remembered);
      }
    } catch {
      // storage unavailable (private mode): silently skip the convenience
    }
  }, []);

  // Already signed in? The app shell is where you belong.
  // Only bounce a CONFIRMED session; never act while the phase is unknown.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // "resend in Xs" countdown, driven by the server's own numbers.
  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const normalizedPhone = phoneNumber.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(normalizedPhone);

  const sendOtp = useCallback(
    async (phone: string) => {
      setSending(true);
      setOtpError(null);
      try {
        const response = await fetch("/api/auth/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: phone }),
        });
        const body = (await response.json().catch(() => ({}))) as SendOtpResponse;

        if (!response.ok) {
          if (response.status === 429) {
            setCountdown(body.retryAfterSeconds ?? 60);
            setOtpError(`Please wait ${body.retryAfterSeconds ?? 60}s before requesting another code.`);
          } else {
            setOtpError(body.error ?? "Could not send the code.");
          }
          return false;
        }

        setDevHint(body.devHint ?? null);
        setCountdown(body.resendAfterSeconds ?? 60);
        setLockedOut(false);
        setDigits(Array(OTP_LENGTH).fill(""));
        return true;
      } catch {
        setOtpError("Network error. Please try again.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      setVerifying(true);
      setOtpError(null);
      try {
        const response = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: normalizedPhone, otp: code, source: "mobile" }),
        });
        const body = (await response.json().catch(() => ({}))) as VerifyOtpResponse;

        if (!response.ok || !body.token || !body.user) {
          if (response.status === 429) {
            setLockedOut(true);
            setOtpError(body.error ?? "Too many attempts. Request a new code.");
          } else {
            const left = body.attemptsLeft;
            setOtpError(
              `${body.error ?? "That code is not right."}${typeof left === "number" ? ` ${left} attempt(s) left.` : ""}`,
            );
          }
          setDigits(Array(OTP_LENGTH).fill(""));
          inputsRef.current[0]?.focus();
          return;
        }

        try {
          window.localStorage.setItem(LAST_PHONE_KEY, normalizedPhone);
        } catch {
          // storage unavailable: the signup itself must not fail for this
        }
        signIn(body.token, body.user);
        router.replace("/");
      } catch {
        setOtpError("Network error. Please try again.");
      } finally {
        setVerifying(false);
      }
    },
    [normalizedPhone, router, signIn],
  );

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    const code = next.join("");
    if (code.length === OTP_LENGTH && next.every((entry) => entry !== "")) {
      void verifyOtp(code);
    }
  }

  function handleDigitKeyDown(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  if (status === "loading") {
    return (
      <main className="flex flex-1 flex-col p-4">
        <span className="skeleton mb-3 h-6 w-1/2 rounded" />
        <span className="skeleton mb-3 h-4 w-3/4 rounded" />
        <span className="skeleton h-12 w-full rounded-card" />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="bg-wa-teal px-4 py-4 text-white">
        <h1 className="text-xl font-semibold">Welcome to PhoneMail</h1>
        <p className="text-sm opacity-90">Your phone number is your email address.</p>
      </header>

      {step === "language" && (
        <section className="flex flex-1 flex-col gap-4 p-4">
          <h2 className="text-lg font-semibold">Choose your language</h2>
          <p className="text-sm text-wa-muted">
            English is fully wired. The other two slots show where translations land.
          </p>
          <ul className="flex flex-col gap-2">
            {LANGUAGES.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  className={`w-full justify-start px-4 text-left ${language === entry.code ? "btn-primary" : "btn-quiet"}`}
                  onClick={() => setLanguage(entry.code)}
                  disabled={!entry.ready}
                >
                  {entry.label}
                  {!entry.ready && <span className="ml-2 text-xs opacity-80">(coming soon)</span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-primary mt-auto" onClick={() => setStep("phone")}>
            Continue
          </button>
        </section>
      )}

      {step === "phone" && (
        <section className="flex flex-1 flex-col gap-4 p-4">
          <h2 className="text-lg font-semibold">Your phone number</h2>
          <p className="text-sm text-wa-muted">We will send a one-time code to this number.</p>

          <div className="flex items-stretch gap-2">
            <span className="flex min-h-tap items-center rounded-md border border-wa-line bg-panel px-4 text-lg">
              +91
            </span>
            <input
              className="field flex-1"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="9876543210"
              maxLength={10}
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                setPhoneError(null);
              }}
              aria-label="Phone number"
            />
          </div>

          {phoneNumber.length > 0 && !phoneValid && (
            <p className="text-sm text-wa-alert" role="alert">
              Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.
            </p>
          )}
          {phoneError && (
            <p className="text-sm text-wa-alert" role="alert">
              {phoneError}
            </p>
          )}

          <div className="mt-auto flex gap-3">
            <button type="button" className="btn-quiet flex-1" onClick={() => setStep("language")}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!phoneValid || sending}
              onClick={async () => {
                const ok = await sendOtp(normalizedPhone);
                if (ok) {
                  setStep("otp");
                } else {
                  setPhoneError("Could not send the code. Please try again.");
                }
              }}
            >
              {sending ? "Sending…" : "Send code"}
            </button>
          </div>

          <p className="text-center text-sm text-wa-muted">
            By continuing, you agree to the{' '}
            <Link href="/terms" className="font-semibold text-wa-teal underline">
              Terms &amp; Conditions
            </Link>
          </p>
        </section>
      )}

      {step === "otp" && (
        <section className="flex flex-1 flex-col gap-4 p-4">
          <button type="button" className="min-h-tap self-start text-sm text-wa-muted" onClick={() => setStep("phone")}>
            ← Change number
          </button>
          <h2 className="text-lg font-semibold">Enter the code</h2>
          <p className="text-sm text-wa-muted">Sent to +91 {normalizedPhone}</p>

          <div className="flex justify-between gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputsRef.current[index] = element;
                }}
                className="h-14 w-12 rounded-md border border-wa-line bg-panel text-center text-2xl"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                disabled={verifying || lockedOut}
                onChange={(event) => handleDigitChange(index, event.target.value)}
                onKeyDown={(event) => handleDigitKeyDown(index, event.key)}
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>

          {devHint && (
            <p className="surface p-3 text-sm" role="status">
              <strong>Dev mode:</strong> {devHint}
            </p>
          )}

          {otpError && (
            <p className="text-sm text-wa-alert" role="alert">
              {otpError}
            </p>
          )}

          {verifying && <p className="text-sm text-wa-muted">Checking…</p>}

          <div className="mt-auto flex flex-col gap-3">
            <button
              type="button"
              className="btn-quiet"
              disabled={countdown > 0 || sending || verifying}
              onClick={() => void sendOtp(normalizedPhone)}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
