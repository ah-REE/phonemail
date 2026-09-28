"use client";

import { useCallback, useEffect, useState } from "react";

import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/useAuth";

/**
 * THE APP LOCK (round 22).
 *
 * Shown when a PIN is set AND this tab has not been unlocked yet. The flag lives in
 * `sessionStorage`, which is exactly the right lifetime: a fresh tab, a reopened PWA
 * and a new browser session all start locked, while a reload inside the tab the
 * reader already unlocked does not ask again. Signing in clears it (they just proved
 * the phone is theirs by reading a code), and signing out removes it.
 *
 * IT COVERS THE APP; it does not guard the API. The session token is untouched and
 * unchanged by a correct PIN - see docs/SECURITY.md, "The app PIN". That is why
 * this screen can be honest in one line ("This PIN locks the screen") instead of
 * implying more than it delivers.
 */

export const PIN_UNLOCKED_KEY = "phonemail.pin.unlocked";

export const PIN_LENGTH = 4;

export function PinLock() {
  const { status, token, user, authorizedFetch } = useAuth();
  const [checked, setChecked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const readLock = useCallback(async () => {
    if (status !== "authenticated" || !token) {
      setChecked(true);
      return;
    }
    try {
      const res = await authorizedFetch("/api/me");
      const body = (await res.json().catch(() => null)) as { user?: { hasPin?: boolean } } | null;
      const pinSet = Boolean(body?.user?.hasPin);
      setHasPin(pinSet);
      const remembered = window.sessionStorage.getItem(PIN_UNLOCKED_KEY) === "1";
      setUnlocked(!pinSet || remembered);
    } catch {
      // An unreachable profile must not lock the reader out of their own app.
      setHasPin(false);
      setUnlocked(true);
    } finally {
      setChecked(true);
    }
  }, [status, token, authorizedFetch]);

  useEffect(() => {
    void readLock();
  }, [readLock]);

  const submit = useCallback(
    async (candidate: string) => {
      if (busy || candidate.length !== PIN_LENGTH) return;
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
          window.sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
          setUnlocked(true);
          setPin("");
          return;
        }
        setPin("");
        if (res.status === 429) {
          setError(body?.error ?? `Too many attempts. Try again in ${body?.retryAfterSeconds ?? 60}s.`);
        } else {
          setError(body?.error ?? "Wrong PIN.");
        }
      } catch {
        setPin("");
        setError("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [authorizedFetch, busy],
  );

  function press(digit: string) {
    if (busy || pin.length >= PIN_LENGTH) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      void submit(next);
    }
  }

  if (!checked || !hasPin || unlocked) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-surface px-6"
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

      <div className="flex items-center gap-3" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }).map((_, index) => (
          <span
            key={index}
            className={`h-4 w-4 rounded-full ${index < pin.length ? "bg-accent" : "bg-surface-container-high"}`}
          />
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
            onReset={async () => {
              window.sessionStorage.setItem(PIN_UNLOCKED_KEY, "1");
              setUnlocked(true);
              setResetting(false);
            }}
          />
        </div>
      )}
    </div>
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
            placeholder="123456"
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
            placeholder="4 digits"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-reset-confirm">
            Confirm the new PIN
          </label>
          <input
            id="pin-reset-confirm"
            className="field"
            inputMode="numeric"
            placeholder="4 digits"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
          />
          <button type="button" className="btn-brand min-h-0 px-4 py-2 text-sm" onClick={() => void submitReset()} disabled={busy || pin.length !== PIN_LENGTH}>
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
