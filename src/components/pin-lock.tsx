"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/useAuth";

/**
 * THE APP LOCK (round 22), rebuilt as a GATE (round 23).
 *
 * WHAT WAS WRONG. The first version rendered the pad as an OVERLAY on top of a
 * shell that the layout had already rendered. It decided by asking the server
 * (`GET /api/me`) whether a PIN was set, and until that answer arrived it returned
 * `null` - nothing. So the app was on screen, readable and interactive, for the
 * whole round trip: measured at 87ms on a warm local stack (22 consecutive
 * samples), and as long as the request takes on a cold start, a slow phone or a
 * PWA launch - which is what "the app opens straight in, no PIN prompt" is. The
 * same window is why the rail could be missing on the first frames: it gates on
 * the auth phase, which resolves at a different moment from the PIN.
 *
 * WHAT IT IS NOW. The pin state is a FIRST-CLASS three-phase value, and the shell
 * is not rendered at all until it is resolved:
 *
 *   checking -> a bare resolving screen. NOT the app. NOT a rail-less shell.
 *   locked   -> the pad, and nothing else.
 *   open     -> the app.
 *
 * That is the brief's own rule ("never a rail-less shell, never a skipped lock,
 * never a login flash") expressed as the only way the shell can mount.
 *
 * The stand-down rule is unchanged and is the point of the feature: signing in
 * SETS the flag for this tab (the reader just read a code off their own SIM), while
 * an EXISTING session in a fresh tab has no flag and therefore meets the pad.
 */

export const PIN_UNLOCKED_KEY = "phonemail.pin.unlocked";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export type PinPhase = "checking" | "locked" | "open";

function readRemembered(): boolean {
  try {
    return window.sessionStorage.getItem(PIN_UNLOCKED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The phase, resolved from BOTH the auth state and the account's PIN.
 *
 * An unreachable profile resolves to `open`, deliberately: a lock whose state
 * cannot be read must not turn a network blip into a device the owner cannot use.
 * That is a documented trade (docs/SECURITY.md 13) and it is the same choice the
 * first version made.
 */
export function usePinGate() {
  const { status, token, authorizedFetch } = useAuth();
  const [phase, setPhase] = useState<PinPhase>("checking");

  const resolve = useCallback(async () => {
    if (status === "loading") {
      setPhase("checking");
      return;
    }
    if (status !== "authenticated" || !token) {
      // No session: the lock has nothing to cover. The screen's own guard decides
      // what an unauthenticated visitor sees (the login card on the desktop, the
      // onboarding flow on the phone).
      setPhase("open");
      return;
    }
    setPhase("checking");
    try {
      const res = await authorizedFetch("/api/me");
      const body = (await res.json().catch(() => null)) as { user?: { hasPin?: boolean } } | null;
      const pinSet = Boolean(body?.user?.hasPin);
      setPhase(pinSet && !readRemembered() ? "locked" : "open");
    } catch {
      setPhase("open");
    }
  }, [status, token, authorizedFetch]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  return { phase, resolve, open: useCallback(() => setPhase("open"), []) };
}

/** The gateway itself: nothing of the app renders before the phase is known. */
export function PinGate({ children }: { children: ReactNode }) {
  const gate = usePinGate();

  if (gate.phase === "checking") {
    return <AppResolving />;
  }
  if (gate.phase === "locked") {
    return <PinPad onUnlocked={gate.open} />;
  }
  return <>{children}</>;
}

/** What "waiting on the resolved phase" looks like: no shell, no rail, no mail. */
export function AppResolving() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-low" aria-busy="true">
      <Spinner label="Opening PhoneMail" />
    </main>
  );
}

/** The pad. Rendered INSTEAD of the app, never over it. */
export function PinPad({ onUnlocked }: { onUnlocked: () => void }) {
  const { user, authorizedFetch } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const submit = useCallback(
    async (candidate: string) => {
      if (busy || candidate.length < PIN_MIN_LENGTH || candidate.length > PIN_MAX_LENGTH) return;
      setBusy(true);
      setError(null);
      try {
        const res = await authorizedFetch("/api/me/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: candidate }),
        });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; attemptsLeft?: number; retryAfterSeconds?: number }
          | null;
        if (res.ok && body?.ok) {
          try {
            window.sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
          } catch {
            // A refusing store only costs the next reload one more unlock.
          }
          setPin("");
          onUnlocked();
          return;
        }
        setPin("");
        setError(
          res.status === 429
            ? body?.error ?? `Too many attempts. Try again in ${body?.retryAfterSeconds ?? 60}s.`
            : body?.error ?? "Wrong PIN.",
        );
      } catch {
        setPin("");
        setError("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [authorizedFetch, busy, onUnlocked],
  );

  function press(digit: string) {
    if (busy || pin.length >= PIN_MAX_LENGTH) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === PIN_MAX_LENGTH) {
      void submit(next);
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-6"
      role="dialog"
      aria-modal="true"
      aria-label="App lock"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="font-headline text-lg font-bold text-on-surface">PhoneMail is locked</h1>
        <p className="text-sm text-on-surface-variant">
          {user?.phoneNumber ? `Enter the PIN for ${user.phoneNumber}.` : "Enter your PIN."}
        </p>
      </div>

      <div className="flex items-center gap-3" aria-label={`${pin.length} digits entered - a PIN is 4 to 6 digits`}>
        {Array.from({ length: Math.max(PIN_MIN_LENGTH, Math.min(PIN_MAX_LENGTH, pin.length)) }).map((_, index) => (
          <span key={index} className={`h-4 w-4 rounded-full ${index < pin.length ? "bg-accent" : "bg-surface-container-high"}`} />
        ))}
      </div>

      {error && (
        <p className="max-w-xs text-center text-sm text-wa-alert" role="alert">
          {error}
        </p>
      )}

      <div className="grid w-full max-w-[240px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            className="h-16 rounded-full bg-surface-container text-xl font-semibold text-on-surface active:bg-surface-container-high"
            onClick={() => press(digit)}
          >
            {digit}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className="h-16 rounded-full bg-surface-container text-xl font-semibold text-on-surface active:bg-surface-container-high"
          onClick={() => press("0")}
        >
          0
        </button>
        <button
          type="button"
          className="h-16 rounded-full bg-surface-container text-sm font-semibold text-on-surface-variant active:bg-surface-container-high"
          aria-label="Delete the last digit"
          onClick={() => setPin((current) => current.slice(0, -1))}
        >
          Del
        </button>
      </div>

      {/* ROUND 28: a PIN is 4 to 6 digits, so the pad cannot verify at 4 alone -
          that would spend a 5- or 6-digit reader's strikes on a wrong-length
          guess. It verifies ITSELF at 6 (the maximum), and this button submits
          the 4- and 5-digit entries. One rule, said once, doing both shapes. */}
      <button
        type="button"
        className="btn-quiet min-h-0 px-8 py-2.5 text-sm"
        disabled={busy || pin.length < PIN_MIN_LENGTH}
        onClick={() => void submit(pin)}
      >
        Unlock
      </button>

      {busy && <Spinner label="Checking the PIN" />}

      <button
        type="button"
        className="text-sm font-medium text-accent underline"
        onClick={() => setResetting((current) => !current)}
      >
        {resetting ? "Close the reset form" : "Forgot the PIN?"}
      </button>

      {resetting && (
        <div className="w-full max-w-sm rounded-card border border-outline-variant bg-surface-container-lowest p-4">
          <PinResetPanel
            onReset={() => {
              try {
                window.sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
              } catch {
                // ignore
              }
              setResetting(false);
              onUnlocked();
            }}
          />
        </div>
      )}
    </main>
  );
}

/**
 * The forgotten-PIN path: a one-time code for the account's own number, then a new
 * PIN. Deliberately the same shape as account deletion's verification - a live code
 * for the SIM is the proof of identity when the PIN cannot be.
 */
export function PinResetPanel({ onReset }: { onReset?: () => void }) {
  const { authorizedFetch } = useAuth();
  const [stage, setStage] = useState<"code" | "new">("code");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const me = await authorizedFetch("/api/me");
      const profile = (await me.json().catch(() => null)) as { user?: { phoneNumber?: string } } | null;
      const phoneNumber = profile?.user?.phoneNumber ?? "";
      const res = await authorizedFetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const body = (await res.json().catch(() => null)) as { devHint?: string; error?: string } | null;
      if (res.ok) {
        setNote(body?.devHint ? "Code requested. This build is in dev mode, so the code is 123456." : "Code requested.");
      } else {
        setError(body?.error ?? "Could not send a code.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authorizedFetch("/api/me/pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code, pin }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        onReset?.();
      } else {
        setError(body?.error ?? "That code is not right.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-on-surface-variant">
        Reset the PIN with a one-time code for your number. The code is single-use and expires in five minutes.
      </p>
      {stage === "code" ? (
        <>
          <button type="button" className="btn-quiet min-h-0 px-4 py-2 text-sm" onClick={() => void requestCode()} disabled={busy}>
            Send me a code
          </button>
          {note && <p className="text-sm text-accent">{note}</p>}
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-reset-code">
            Code
          </label>
          <input
            id="pin-reset-code"
            className="field"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button type="button" className="btn-brand min-h-0 px-4 py-2 text-sm" onClick={() => setStage("new")} disabled={code.length !== 6}>
            Continue
          </button>
        </>
      ) : (
        <>
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-reset-new">
            New PIN
          </label>
          <input
            id="pin-reset-new"
            className="field"
            inputMode="numeric"
            placeholder="4-6 digits"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-reset-confirm">
            Confirm the new PIN
          </label>
          <input
            id="pin-reset-confirm"
            className="field"
            inputMode="numeric"
            placeholder="4-6 digits"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
          />
          <button
            type="button"
            className="btn-brand min-h-0 px-4 py-2 text-sm"
            onClick={() => void submitReset()}
            disabled={busy || pin.length < PIN_MIN_LENGTH}
          >
            Reset the PIN
          </button>
        </>
      )}
      {error && (
        <p className="text-sm text-wa-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
