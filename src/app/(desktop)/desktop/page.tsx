"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Desktop sign-in: phone number then an inline OTP on the same screen — no
 * navigation between steps, which is what makes a desktop login feel calm.
 * Uses exactly the same endpoints as mobile onboarding.
 */
export default function DesktopLoginPage() {
  const router = useRouter();
  const { status, signIn } = useAuth();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/desktop/inbox");
    }
  }, [status, router]);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const normalized = phoneNumber.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(normalized);

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalized }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        devHint?: string;
        retryAfterSeconds?: number;
        resendAfterSeconds?: number;
      };
      if (!response.ok) {
        setError(response.status === 429 ? `Please wait ${body.retryAfterSeconds ?? 60}s.` : (body.error ?? "Could not send the code."));
        if (body.retryAfterSeconds) setCountdown(body.retryAfterSeconds);
        return;
      }
      setDevHint(body.devHint ?? null);
      setCountdown(body.resendAfterSeconds ?? 60);
      setOtpSent(true);
      inputsRef.current[0]?.focus();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalized, otp: code, source: "desktop" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        user?: { id: string; phoneNumber: string };
        error?: string;
        attemptsLeft?: number;
      };
      if (!response.ok || !body.token || !body.user) {
        setError(
          `${body.error ?? "That code is not right."}${typeof body.attemptsLeft === "number" ? ` ${body.attemptsLeft} attempt(s) left.` : ""}`,
        );
        setDigits(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
        return;
      }
      signIn(body.token, body.user);
      router.replace("/desktop/inbox");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
    if (next.every((entry) => entry !== "")) {
      void verify(next.join(""));
    }
  }

  if (status === "loading") {
    return <p className="p-10 text-wa-muted">Loading…</p>;
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Sign in to PhoneMail</h1>
        <p className="mt-1 text-wa-muted">
          Your phone number is your email address. By continuing you agree to the{" "}
          <Link href="/portal" className="underline">
            terms
          </Link>
          .
        </p>
      </div>

      <label className="text-sm text-wa-muted" htmlFor="phone">
        Phone number
      </label>
      <div className="flex items-stretch gap-2">
        <span className="flex min-h-tap items-center rounded-card border border-wa-line bg-wa-panel px-4 text-lg">
          +91
        </span>
        <input
          id="phone"
          className="field flex-1"
          inputMode="numeric"
          placeholder="9876543210"
          maxLength={10}
          value={phoneNumber}
          onChange={(event) => {
            setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
            setError(null);
          }}
          disabled={otpSent}
        />
        {!otpSent && (
          <button type="button" className="btn-primary" disabled={!phoneValid || busy} onClick={() => void sendOtp()}>
            {busy ? "Sending…" : "Send code"}
          </button>
        )}
      </div>

      {otpSent && (
        <>
          <p className="text-sm text-wa-muted">Enter the 6-digit code sent to +91 {normalized}.</p>
          <div className="flex gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputsRef.current[index] = element;
                }}
                className="h-14 w-12 rounded-card border border-wa-line bg-wa-panel text-center text-2xl"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                disabled={busy}
                onChange={(event) => handleDigit(index, event.target.value)}
                aria-label={`Digit ${index + 1}`}
              />
            ))}
            <button
              type="button"
              className="btn-quiet ml-2"
              disabled={countdown > 0 || busy}
              onClick={() => void sendOtp()}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend"}
            </button>
          </div>
          {devHint && (
            <p className="surface p-3 text-sm" role="status">
              <strong>Dev mode:</strong> {devHint}
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-wa-alert" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
