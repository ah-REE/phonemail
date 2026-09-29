"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Wordmark } from "@/components/wordmark";
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
  // ROUND 28: the optional PIN doors - a PIN sign-in and the new-account
  // "Set a PIN (skip)" step. The card's view starts on the OTP path, which
  // stays the default and primary one.
  const [view, setView] = useState<"otp" | "pin" | "setpin">("otp");
  const [hasPin, setHasPin] = useState(false);
  const [wasRegistered, setWasRegistered] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [signupPinError, setSetPinError] = useState<string | null>(null);
  const [signupPinBusy, setSetPinBusy] = useState(false);

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

  /* ROUND 28: ask the number's state while it is being typed (debounced), so the
     "Login with PIN instead" door can appear for an account that has a PIN - and
     only for one. OTP remains the default: this only adds a door. */
  useEffect(() => {
    if (normalized.length !== 10) {
      setHasPin(false);
      setWasRegistered(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/registered?phoneNumber=${encodeURIComponent(normalized)}`);
        const body = (await response.json().catch(() => null)) as { registered?: boolean; hasPin?: boolean } | null;
        if (!cancelled && body) {
          setWasRegistered(typeof body.registered === "boolean" ? body.registered : null);
          setHasPin(Boolean(body.hasPin));
        }
      } catch {
        // A failed lookup changes nothing: the door that was pressed still works.
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalized]);

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
      setFreshToken(body.token);
      // ROUND 28: a genuinely NEW account may set a PIN before continuing (skip
      // is one quiet tap); a known account goes straight in. OTP stays primary.
      if (wasRegistered === false) {
        setView("setpin");
        return;
      }
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

  /**
   * ROUND 28: sign in with the PIN (shown only when the account has one). Same
   * session OTP issues; signIn marks this tab unlocked - the PIN was just proven.
   */
  async function loginWithPin() {
    setPinBusy(true);
    setPinError(null);
    try {
      const response = await fetch("/api/auth/login-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: normalized, pin: pinInput }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        user?: { id: string; phoneNumber: string };
        error?: string;
        attemptsLeft?: number;
        retryAfterSeconds?: number;
      };
      if (!response.ok || !body.token || !body.user) {
        setPinError(
          `${body.error ?? "That PIN is not right."}` +
            `${typeof body.attemptsLeft === "number" ? ` ${body.attemptsLeft} attempt(s) left.` : ""}` +
            `${typeof body.retryAfterSeconds === "number" ? ` Try again in ${body.retryAfterSeconds}s.` : ""}`,
        );
        setPinInput("");
        return;
      }
      signIn(body.token, body.user);
      router.replace("/desktop/inbox");
    } catch {
      setPinError("Network error. Please try again.");
    } finally {
      setPinBusy(false);
    }
  }

  /** ROUND 28: the signup step's save, riding the session the OTP just issued. */
  async function saveSignupPin() {
    if (newPin !== confirmPin) {
      setSetPinError("The two PINs do not match.");
      return;
    }
    if (!freshToken) {
      router.replace("/desktop/inbox");
      return;
    }
    setSetPinBusy(true);
    setSetPinError(null);
    try {
      const response = await fetch("/api/me/pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ pin: newPin }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setSetPinError(body.error ?? "Could not save the PIN.");
        return;
      }
      router.replace("/desktop/inbox");
    } catch {
      setSetPinError("Network error. Please try again.");
    } finally {
      setSetPinBusy(false);
    }
  }

  if (status === "loading") {
    return <p className="p-10 text-on-surface-variant">Loading…</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-low px-6 py-12">
      {/* ROUND 13: a centred card, and nothing else - the shell is not rendered
          for a signed-out session at all (see components/desktop-rail.tsx), so
          this screen is the whole page. */}
      <div className="surface flex w-full max-w-md flex-col gap-6 p-8">
      <div>
        {/* ROUND 4: the same wordmark treatment wherever the name appears. */}
        <h1 className="flex flex-wrap items-center gap-x-2 text-2xl font-semibold">
          Sign in to <Wordmark as="span" size={24} />
        </h1>
        <p className="mt-1 text-on-surface-variant">
          Your phone number is your email address. By continuing you agree to the{" "}
          <Link href="/terms" className="underline">
            terms
          </Link>
          .
        </p>
      </div>

      {view === "pin" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-on-surface-variant">
            Enter the PIN for +91 {normalized}. A one-time code still works - this is just quicker.
          </p>
          <label className="sr-only" htmlFor="login-pin">
            PIN
          </label>
          <input
            id="login-pin"
            className="field text-center text-2xl tracking-[0.4em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pinInput}
            onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {pinError && (
            <p className="text-wa-alert" role="alert">
              {pinError}
            </p>
          )}
          <button type="button" className="btn-primary" disabled={pinBusy || pinInput.length < 4} onClick={() => void loginWithPin()}>
            {pinBusy ? "Checking..." : "Log in"}
          </button>
          <button type="button" className="self-start text-sm font-medium text-accent underline" onClick={() => setView("otp")}>
            Use a one-time code instead
          </button>
        </div>
      ) : view === "setpin" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-on-surface-variant">
            Optional: set a PIN to unlock PhoneMail without waiting for a code each time. You can change it later in Settings.
          </p>
          <label className="text-sm text-on-surface-variant" htmlFor="signup-pin">
            New PIN (4-6 digits)
          </label>
          <input
            id="signup-pin"
            className="field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <label className="text-sm text-on-surface-variant" htmlFor="signup-pin-confirm">
            Confirm the PIN
          </label>
          <input
            id="signup-pin-confirm"
            className="field"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {signupPinError && (
            <p className="text-wa-alert" role="alert">
              {signupPinError}
            </p>
          )}
          <button type="button" className="btn-primary" disabled={signupPinBusy || newPin.length < 4} onClick={() => void saveSignupPin()}>
            {signupPinBusy ? "Saving..." : "Save PIN"}
          </button>
          <button type="button" className="self-start text-sm font-medium text-accent underline" onClick={() => router.replace("/desktop/inbox")}>
            Skip for now
          </button>
        </div>
      ) : (
        <>
      <label className="text-sm text-on-surface-variant" htmlFor="phone">
        Phone number
      </label>
      <div className="flex items-stretch gap-2">
        <span className="flex min-h-tap items-center rounded-card border border-outline-variant bg-surface-container-lowest px-4 text-lg">
          +91
        </span>
        <input
          id="phone"
          className="field flex-1"
          inputMode="numeric"
          placeholder="Mobile number"
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

      {!otpSent && hasPin && (
        <button
          type="button"
          className="self-start text-sm font-medium text-accent underline"
          onClick={() => {
            setPinInput("");
            setPinError(null);
            setView("pin");
          }}
        >
          Login with PIN instead
        </button>
      )}

      {otpSent && (
        <>
          <p className="text-sm text-on-surface-variant">Enter the 6-digit code sent to +91 {normalized}.</p>
          {/* ROUND 16: the code boxes and the Resend control WRAP instead of sharing one
              fixed line. Six 48px boxes plus their gaps come to roughly 328px, which left
              about 56px of the card for a button that needs about 110 - so the button was
              pushed past the card instead of sitting in it. Wrapping is the honest fix: the
              boxes keep their row and the button takes the next one whenever the card is
              narrower than the two together. */}
          <div className="flex flex-wrap items-center gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputsRef.current[index] = element;
                }}
                className="h-14 w-12 rounded-card border border-outline-variant bg-surface-container-lowest text-center text-2xl"
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
              className="btn-quiet ml-2 shrink-0"
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
        </>
      )}
      </div>
    </main>
  );
}
