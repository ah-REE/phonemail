"use client";

import Link from "next/link";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/spinner";

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

type Step = "welcome" | "phone" | "otp" | "success";

/** Which door the person came through. OTP is primary in both. */
type AuthMode = "signup" | "login";

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

const OTP_LENGTH = 6;

/**
 * Last number used on THIS DEVICE.
 *
 * The spec asks for the number to be "automatically detected and pre-filled".
 * A browser cannot read the SIM, so that is impossible on the web - this is the
 * honest equivalent: the last number that successfully signed up is remembered.
 *
 * sessionStorage, NOT localStorage: the token already lives per-tab, so a second
 * tab is a second, independent session - and it was showing the first tab's
 * number on a screen meant to be fresh. Storage scope now matches session scope:
 * the number comes back within its own tab, and a new tab starts empty.
 */
const LAST_PHONE_KEY = "***";

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
              ? "h-1.5 w-6 rounded-full bg-accent"
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
            <img
              src="/brand/phonemail-logo.png"
              alt=""
              width={26}
              height={26}
              className="h-[26px] w-[26px] shrink-0 rounded-md object-cover"
            />
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

  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<AuthMode>("signup");

  // The address the success screen shows once the account exists.
  const [successAddress, setSuccessAddress] = useState("");

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
      const remembered = window.sessionStorage.getItem(LAST_PHONE_KEY);
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
    // Never bounce the success screen: the person has just signed in and has not
    // seen their address yet, which is the whole point of that step.
    if (status === "authenticated" && step !== "success") {
      router.replace("/");
    }
  }, [status, router, step]);

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
          window.sessionStorage.setItem(LAST_PHONE_KEY, normalizedPhone);
        } catch {
          // storage unavailable: the signup itself must not fail for this
        }
        signIn(body.token, body.user);
        // The address is derived the same way the server derives it, so the
        // success screen can show the real thing before the inbox loads.
        setSuccessAddress(`${normalizedPhone}@phonemail.com`);
        setStep("success");
      } catch {
        setOtpError("Network error. Please try again.");
      } finally {
        setVerifying(false);
      }
    },
    [normalizedPhone, signIn],
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

  const stepNumber = step === "welcome" ? 1 : step === "phone" ? 2 : 3;

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-phone flex-1 flex-col px-4">

                {step === "welcome" && (
          <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[390px] flex-col px-6 pb-6 pt-4">
            {/* The screen's own rhythm, from the owner's design: title, a wide gap,
                the hero, the caption, a wide gap, then the legal line and the CTA.
                One staggered entrance covers all four blocks. */}
            <h1 className="enter enter-1 mt-4 w-full text-center font-display text-[26px] font-bold tracking-tight text-on-surface">
              Welcome to PhoneMail
            </h1>

            <div className="my-auto flex w-full flex-col items-center justify-center py-6">
              {/* Just the mark, centred - sized like an app icon rather than a
                  hero: about 40% of the screen, so the title, the line under it
                  and the buttons all still hold their own. */}
              <img
                src="/brand/phonemail-logo.png"
                alt="PhoneMail"
                width={156}
                height={156}
                className="enter enter-2 mx-auto aspect-square select-none object-contain"
                style={{ width: "min(156px, 40vw, 20vh)" }}
              />
              <p className="enter enter-3 mx-auto mt-6 max-w-[300px] text-center text-[17px] leading-[26px] text-on-surface-variant">
                Where Numbers Become Mail
              </p>
            </div>

            <div className="enter enter-4 flex w-full flex-col items-center gap-5">
              {/* The owner's own wording, sitting directly above the button it is
                  about, with the one link that has a route. */}
              <p className="px-2 text-center text-[13px] leading-relaxed text-on-surface-variant">
                By continuing, you agree to the{" "}
                <Link href="/terms" className="font-semibold text-accent">
                  Terms &amp; Conditions
                </Link>
              </p>
              {/* Two doors, one authentication. Both collect a number, both
                  prove it with a one-time code - the only way into PhoneMail. */}
              <button
                type="button"
                className="btn-brand w-full"
                onClick={() => {
                  setMode("signup");
                  setOtpError(null);
                  setStep("phone");
                }}
              >
                Create account
              </button>
              <button
                type="button"
                className="btn-quiet w-full"
                onClick={() => {
                  setMode("login");
                  setOtpError(null);
                  // Straight to the number, then the code: logging in asks for
                  // nothing but what the OTP already proves.
                  setStep("phone");
                }}
              >
                Log in
              </button>
            </div>
          </div>
        )}

        {step === "phone" && (
          <>
            <TopBar step={stepNumber} total={3} onBack={() => setStep("welcome")} brand />

            <div className="flex w-full flex-col pt-4">
              <div className="flex flex-col">
                <h1 className="font-headline text-[26px] font-bold leading-[34px] tracking-[-0.015em]">
                  {mode === "login" ? "Welcome back" : "You're almost in!"}
                </h1>
                <p className="mt-1 text-base leading-relaxed text-on-surface-variant">
                  One number is all we need
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-4">
                {/* The owner's reference: one wide rounded bar, a soft chip for
                    the country, a hairline divider, the number large and bold as
                    you type it, and a clear button that appears with it. */}
                <div className="flex w-full items-center gap-3 rounded-[28px] border border-outline-variant bg-chat-field py-2 pl-3 pr-2 shadow-card transition-all duration-ui focus-within:border-accent">
                  <span className="flex shrink-0 items-center gap-2 pl-1 text-[22px] font-bold text-on-surface">
                    <span className="select-none leading-none" aria-hidden="true">
                      🇮🇳
                    </span>
                    +91
                  </span>

                  <span className="h-7 w-px shrink-0 bg-outline-variant" aria-hidden="true" />

                  <input
                    className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tracking-wide text-on-surface caret-accent outline-none placeholder:font-normal placeholder:text-outline"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="Mobile number"
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-on-surface-variant"
                      onClick={() => {
                        setPhoneNumber("");
                        setPhoneError(null);
                      }}
                    >
                      <Icon name="clear" size={20} />
                    </button>
                  )}
                </div>

                <div className="flex items-start gap-2 px-1">
                  <span className="mt-0.5 text-on-surface-variant">
                    <Icon name="lock" size={16} />
                  </span>
                  <p className="text-sm leading-snug text-on-surface-variant">
                    We will send you a one-time code to verify your number and secure your mailbox.
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

                {phoneError && (
                  <p className="px-1 text-sm text-wa-alert" role="alert">
                    {phoneError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-auto flex w-full flex-col gap-4 pt-6 pb-6">
              <button
                type="button"
                className="btn-brand w-full"
                disabled={sending}
                onClick={async () => {
                  // Validation lives HERE, on submit, and nowhere else: nothing is
                  // said while the number is being typed. The field already caps
                  // input at ten digits, so this only catches a short number.
                  if (normalizedPhone.length !== 10) {
                    setPhoneError("Enter 10 digit mobile number");
                    return;
                  }
                  const ok = await sendOtp(normalizedPhone);
                  if (ok) {
                    setStep("otp");
                  } else {
                    setPhoneError("Could not send the code. Please try again.");
                  }
                }}
              >
                {sending ? <Spinner label="Sending" /> : "Send OTP"}
              </button>

            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <TopBar step={stepNumber} total={3} onBack={() => setStep("phone")} brand />

            <div className="mb-8 px-2">
              <h1 className="font-headline text-[26px] font-bold leading-[34px] tracking-[-0.015em]">
                Verifying your number
              </h1>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-sm text-on-surface-variant">
                  OTP sent to <span className="font-semibold text-on-surface">+91 {normalizedPhone}</span>
                </p>
                <button
                  type="button"
                  className="min-h-0 text-sm font-semibold text-accent underline underline-offset-2"
                  onClick={() => setStep("phone")}
                >
                  Edit
                </button>
              </div>
            </div>

            <div className="mx-auto mb-8 flex items-center justify-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1.5">
              <span className="text-on-surface-variant">
                <Icon name="lock" size={14} />
              </span>
              <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                End-to-End Secure Channel
              </span>
            </div>

            {/* Six cells, in the reference's material: white, one rounding, a
                hairline that turns to the accent on the digit you have filled. */}
            <div className="mb-8 flex w-full items-center justify-between gap-2">
              {digits.map((digit, index) => (
                <div
                  key={index}
                  className={`flex h-[58px] flex-1 items-center justify-center rounded-2xl border bg-surface shadow-card transition-all duration-ui ${
                    digit ? "border-accent" : "border-outline-variant"
                  }`}
                >
                  <input
                    ref={(element) => {
                      inputsRef.current[index] = element;
                    }}
                    className="w-full bg-transparent text-center text-[24px] font-bold text-on-surface caret-accent outline-none disabled:opacity-60"
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
                className="btn-brand flex w-full items-center justify-center gap-2"
                disabled={verifying || lockedOut || digits.some((digit) => digit === "")}
                onClick={() => void verifyOtp(digits.join(""))}
              >
                {verifying ? <Spinner label="Verifying" /> : <span>Verify</span>}
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

        {step === "success" && (
          <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[390px] flex-col px-6 pb-6 pt-4">
            <div className="my-auto flex w-full flex-col items-center justify-center py-6 text-center">
              <img
                src="/brand/phonemail-logo.png"
                alt="PhoneMail"
                width={156}
                height={156}
                className="enter enter-1 mx-auto aspect-square select-none object-contain"
                style={{ width: "min(156px, 44vw, 20vh)" }}
              />

              <h1 className="enter enter-2 mt-8 font-display text-[27px] font-bold tracking-tight text-on-surface">
                Your PhoneMail account is ready
              </h1>
              <p className="enter enter-3 mt-3 text-[16px] leading-[26px] text-on-surface-variant">
                This is your address — anyone can write to it.
              </p>
              <p className="enter enter-4 mt-4 select-all rounded-card border border-outline-variant/70 bg-surface px-4 py-3 font-mono text-base font-semibold text-on-surface shadow-card">
                {successAddress}
              </p>
            </div>

            <button
              type="button"
              className="btn-brand enter enter-4 w-full"
              onClick={() => router.replace("/")}
            >
              Go to my inbox
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
