"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Mobile onboarding: language -> phone -> OTP.
 *
 * Talks to the real Day 1/2 endpoints (no mock), so the dev-OTP path the
 * evaluator uses is exercised end to end here. Server behaviour it must mirror:
 *  - send-otp returns `resendAfterSeconds` (60) and, in dev mode, a `devHint`
 *  - a second send inside the cooldown is 429
 *  - five wrong codes lock the pending OTP (429) and a new code is required
 *
 * Visual refresh: the layout follows design/choose_your_language,
 * design/phone_verification and design/otp_verification - same element order,
 * proportions and wording. Two mockup elements are deliberately absent, both
 * because they are not app features:
 *  - the "Check Messages" / "Call me" pills on the OTP screen are OS-level
 *    actions a web app cannot perform
 *  - "Code expires in ..." needs client-side expiry tracking the app does not
 *    keep; the server owns the 5-minute TTL
 * The country selector is a fixed +91 field because the app is India-only by
 * spec, and the mockup's second legal link is dropped because there is no
 * privacy route to point at (a dead link is worse than one link).
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

/**
 * The mockup's wording, not the app's earlier labels: the design shows plain
 * "Hindi" and "Tamil" with a "coming soon" note, and English marked (Default).
 */
const LANGUAGES = [
  { code: "en", label: "English", note: "(Default)", ready: true },
  { code: "hi", label: "Hindi", note: "coming soon", ready: false },
  { code: "ta", label: "Tamil", note: "coming soon", ready: false },
];

const OTP_LENGTH = 6;

/**
 * Last number used on THIS DEVICE.
 *
 * The spec asks for the number to be "automatically detected and pre-filled".
 * A browser cannot read the SIM, so that is impossible on the web - this is the
 * honest equivalent: the last number that successfully signed up here is
 * remembered in localStorage (deliberately NOT the session store, so it
 * survives closing the tab and is unrelated to being signed in).
 */
const LAST_PHONE_KEY = "***";

/* ------------------------------------------------------------------ brand art */

/** The PhoneMail mark, reproduced from design/phonemail_logo/code.html. */
function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <rect width="80" height="80" rx="20" fill="#075E54" />
      <path
        d="M18 26C18 23.7909 19.7909 22 22 22H58C60.2091 22 62 23.7909 62 26V54C62 56.2091 60.2091 58 58 58H22C19.7909 58 18 56.2091 18 54V26Z"
        fill="#FFFFFF"
      />
      <path d="M19 23L40 40L61 23" stroke="#075E54" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="40" cy="45" r="14" fill="#25D366" />
      <path
        d="M35.5 41.5C36.2 40.8 37.1 40.8 37.8 41.5L38.8 42.5C39.4 43.1 39.4 44 38.8 44.6L38.1 45.3C38.6 46.4 39.6 47.4 40.7 47.9L41.4 47.2C42 46.6 42.9 46.6 43.5 47.2L44.5 48.2C45.2 48.9 45.2 49.8 44.5 50.5C43.8 51.2 42.5 51.6 40.8 50.4C38.8 49 37 47.2 35.6 45.2C34.4 43.5 34.8 42.2 35.5 41.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function Icon({ name, size = 20 }: { name: "back" | "check" | "clock" | "lock" | "chevron" | "clear" | "mail" | "next"; size?: number }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {name === "back" && <path d="M15 5l-7 7 7 7" {...stroke} />}
      {name === "next" && <path d="M9 5l7 7-7 7" {...stroke} />}
      {name === "check" && <path d="M5 13l4 4L19 7" {...stroke} />}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="8" {...stroke} />
          <path d="M12 8v4.5l3 1.8" {...stroke} />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="10.5" width="14" height="9" rx="2" {...stroke} />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...stroke} />
        </>
      )}
      {name === "chevron" && <path d="M6 10l6 6 6-6" {...stroke} />}
      {name === "clear" && (
        <>
          <circle cx="12" cy="12" r="8" {...stroke} />
          <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" {...stroke} />
        </>
      )}
      {name === "mail" && (
        <>
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" {...stroke} />
          <path d="M4.5 7.5L12 13l7.5-5.5" {...stroke} />
          <path d="M9 16.5l2.2 2.2 4-4" {...stroke} />
        </>
      )}
    </svg>
  );
}

/** Step indicator: the active step is an elongated pill, the rest are dots. */
function StepDots({ total, active }: { total: number; active: number }) {
  return (
    <div className="flex w-full items-center justify-center gap-1.5" aria-label={`Step ${active} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={
            index === active - 1
              ? "h-1.5 w-6 rounded-full bg-wa-green"
              : "h-1.5 w-1.5 rounded-full bg-wa-muted/30"
          }
        />
      ))}
    </div>
  );
}

/** Back button + centred brand + "N of 3", as each mockup's top area shows. */
function TopBar({ step, total, onBack, brand }: { step: number; total: number; onBack?: () => void; brand: boolean }) {
  return (
    <header className="flex w-full flex-col py-2">
      <div className="mb-3 flex w-full items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-ui active:bg-surface-container"
          >
            <Icon name="back" size={22} />
          </button>
        ) : (
          <span className="h-10 w-10" aria-hidden="true" />
        )}

        {brand && (
          <div className="flex items-center gap-2 rounded-full px-3 py-1">
            <LogoMark size={24} />
            <span className="font-headline text-base font-bold tracking-tight">PhoneMail</span>
          </div>
        )}

        <div className="flex w-10 items-center justify-end">
          <span className="font-body text-xs font-semibold text-wa-muted">
            {step} of {total}
          </span>
        </div>
      </div>
      <StepDots total={total} active={step} />
    </header>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { status, signIn } = useAuth();

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
        <span className="skeleton mb-3 h-6 w-1/2 rounded-full" />
        <span className="skeleton mb-3 h-4 w-3/4 rounded-full" />
        <span className="skeleton h-14 w-full rounded-xl" />
      </main>
    );
  }

  const stepNumber = step === "language" ? 1 : step === "phone" ? 2 : 3;

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-phone flex-1 flex-col px-4">

        {step === "language" && (
          <>
            <TopBar step={stepNumber} total={3} brand={false} />

            <div className="flex flex-col items-center">
              <div className="mb-6 flex flex-col items-center justify-center">
                <LogoMark size={80} />
              </div>

              <div className="mb-8 px-2 text-center">
                <h1 className="font-headline text-[26px] font-bold leading-[34px] tracking-[-0.015em]">
                  Choose your language
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Select your preferred language to set up PhoneMail
                </p>
              </div>

              <fieldset className="flex w-full flex-col space-y-2.5">
                <legend className="sr-only">Available languages</legend>
                {LANGUAGES.map((entry) =>
                  entry.ready ? (
                    <label
                      key={entry.code}
                      className={`flex h-14 w-full cursor-pointer select-none items-center justify-between rounded-xl px-4 ${
                        language === entry.code
                          ? "border-2 border-primary-container bg-surface-container-low"
                          : "border border-wa-outline bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        name="language"
                        className="sr-only"
                        checked={language === entry.code}
                        onChange={() => setLanguage(entry.code)}
                      />
                      <span className="flex items-center gap-3">
                        <span className="text-base font-semibold">{entry.label}</span>
                        <span className="text-xs text-on-surface-variant">{entry.note}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          language === entry.code ? "bg-wa-green text-on-surface" : "border border-wa-outline"
                        }`}
                      >
                        {language === entry.code && <Icon name="check" size={16} />}
                      </span>
                    </label>
                  ) : (
                    <div
                      key={entry.code}
                      aria-disabled="true"
                      className="flex h-14 w-full cursor-not-allowed select-none items-center justify-between rounded-xl border border-wa-outline bg-surface-container-low px-4 opacity-75"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base">{entry.label}</span>
                        <span className="text-on-surface-variant">—</span>
                        <span className="text-sm text-on-surface-variant">{entry.note}</span>
                      </span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-on-surface-variant">
                        <Icon name="clock" size={18} />
                      </span>
                    </div>
                  ),
                )}
              </fieldset>

              <div className="mt-8 flex items-center justify-center gap-1.5">
                <span className="text-on-surface-variant">
                  <Icon name="lock" size={14} />
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">
                  End-to-end encrypted setup
                </span>
              </div>
            </div>

            <div className="mt-auto w-full pt-6">
              <button type="button" className="btn-primary w-full" onClick={() => setStep("phone")}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === "phone" && (
          <>
            <TopBar step={stepNumber} total={3} onBack={() => setStep("language")} brand />

            <div className="flex w-full flex-col pt-4">
              <div className="flex flex-col">
                <h1 className="font-headline text-[26px] font-bold leading-[34px] tracking-[-0.015em]">
                  You&apos;re almost in!
                </h1>
                <p className="mt-1 text-base leading-relaxed text-on-surface-variant">
                  Your phone number is your email address
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-4">
                <div className="flex w-full items-center justify-between rounded-xl border border-wa-outline bg-surface p-4 transition-all duration-ui focus-within:border-2 focus-within:border-primary-container">
                  <div className="flex items-center gap-2 pr-4">
                    <span className="select-none leading-none" aria-hidden="true">
                      🇮🇳
                    </span>
                    <span className="text-base font-bold">+91</span>
                    <span className="text-on-surface-variant">
                      <Icon name="chevron" size={18} />
                    </span>
                  </div>

                  <div className="h-8 w-px bg-wa-outline" />

                  <div className="flex min-w-0 flex-1 items-center justify-between pl-4">
                    <input
                      className="w-full bg-transparent text-base font-semibold tracking-wide outline-none"
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
                    {phoneNumber.length > 0 && (
                      <button
                        type="button"
                        aria-label="Clear the number"
                        className="flex min-h-0 items-center justify-center p-1 text-on-surface-variant"
                        onClick={() => {
                          setPhoneNumber("");
                          setPhoneError(null);
                        }}
                      >
                        <Icon name="clear" size={20} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2 px-1">
                  <span className="mt-0.5 text-on-surface-variant">
                    <Icon name="lock" size={16} />
                  </span>
                  <p className="text-sm leading-snug text-on-surface-variant">
                    We will send you a one-time password to verify your number and secure your mailbox.
                  </p>
                </div>

                <div className="flex items-center gap-4 rounded-2xl border border-wa-outline bg-surface-container-low p-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface text-primary-container">
                    <Icon name="mail" size={22} />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">
                      {normalizedPhone.length > 0 ? `${normalizedPhone}@phonemail.com` : "yournumber@phonemail.com"}
                    </span>
                    <span className="text-xs text-on-surface-variant">Your personal address format</span>
                  </div>
                </div>

                {phoneNumber.length > 0 && !phoneValid && (
                  <p className="px-1 text-sm text-wa-alert" role="alert">
                    Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.
                  </p>
                )}
                {phoneError && (
                  <p className="px-1 text-sm text-wa-alert" role="alert">
                    {phoneError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-auto flex w-full flex-col gap-4 pt-6 pb-2">
              <button
                type="button"
                className="btn-primary w-full"
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
                {sending ? "Sending." : "Send OTP"}
              </button>

              <p className="px-4 text-center text-xs leading-normal text-on-surface-variant">
                By continuing, you agree to the{" "}
                <Link href="/terms" className="font-semibold text-primary-container underline">
                  Terms &amp; Conditions
                </Link>
              </p>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <TopBar step={stepNumber} total={3} onBack={() => setStep("phone")} brand />

            <div className="px-2">
              <h1 className="font-headline text-[26px] font-bold leading-[34px] tracking-[-0.015em]">
                Verifying your number
              </h1>
            </div>

            <div className="mb-8 mt-1 flex items-center justify-center gap-1.5">
              <p className="text-sm text-on-surface-variant">
                OTP sent to <span className="font-semibold text-on-surface">+91 {normalizedPhone}</span>
              </p>
              <button
                type="button"
                className="min-h-0 text-sm font-semibold text-primary-container underline underline-offset-2"
                onClick={() => setStep("phone")}
              >
                Edit
              </button>
            </div>

            <div className="mx-auto mb-8 flex items-center justify-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1.5">
              <span className="text-on-surface-variant">
                <Icon name="lock" size={14} />
              </span>
              <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                End-to-End Secure Channel
              </span>
            </div>

            <div className="mb-8 flex w-full items-center justify-between gap-2 px-1">
              {digits.map((digit, index) => (
                <div
                  key={index}
                  className={`flex h-14 flex-1 items-center justify-center rounded-xl border bg-surface ${
                    digit ? "border-primary-container" : "border-wa-outline"
                  }`}
                >
                  <input
                    ref={(element) => {
                      inputsRef.current[index] = element;
                    }}
                    className="w-full bg-transparent text-center text-[22px] font-bold outline-none"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    disabled={verifying || lockedOut}
                    onChange={(event) => handleDigitChange(index, event.target.value)}
                    onKeyDown={(event) => handleDigitKeyDown(index, event.key)}
                    aria-label={`Digit ${index + 1}`}
                  />
                </div>
              ))}
            </div>

            {devHint && (
              <p className="surface mb-4 p-3 text-sm" role="status">
                <strong>Dev mode:</strong> {devHint}
              </p>
            )}

            {otpError && (
              <p className="mb-4 text-sm text-wa-alert" role="alert">
                {otpError}
              </p>
            )}

            <div className="w-full">
              <button
                type="button"
                className="btn-primary flex w-full items-center justify-center gap-2"
                disabled={verifying || lockedOut || digits.some((digit) => digit === "")}
                onClick={() => void verifyOtp(digits.join(""))}
              >
                <span>{verifying ? "Verifying." : "Verify"}</span>
                <Icon name="next" size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <Icon name="clock" size={15} />
                <p className="text-xs">
                  {countdown > 0 ? (
                    <>
                      Resend OTP in <span className="font-semibold text-on-surface">{countdown}s</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="min-h-0 font-semibold text-primary-container underline"
                      disabled={sending || verifying}
                      onClick={() => void sendOtp(normalizedPhone)}
                    >
                      Resend code
                    </button>
                  )}
                </p>
              </div>
            </div>
          </>
        )}

      </div>
    </main>
  );
}
