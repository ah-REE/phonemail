"use client";

import { useCallback, useEffect, useState } from "react";

import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, PinResetPanel } from "@/components/pin-lock";
import { useAuth } from "@/lib/useAuth";

/**
 * THE PIN ROW (round 22) - one shared section, both settings screens.
 *
 * "Security that cannot be found is security nobody uses", so the row reports the
 * state first (Set / Not set) and only then offers the action. Changing or removing
 * requires the CURRENT PIN, which is the difference between a lock and a decoration:
 * without it, anyone holding the unlocked phone could switch it off in two taps.
 *
 * The forgotten-PIN path is the same panel the lock screen shows - a one-time code
 * for the account's own number - so there is exactly one recovery route to reason
 * about and to test.
 */
export function PinSettings() {
  const { authorizedFetch } = useAuth();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"idle" | "set" | "change" | "reset">("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readState = useCallback(async () => {
    try {
      const res = await authorizedFetch("/api/me");
      const body = (await res.json().catch(() => null)) as { user?: { hasPin?: boolean } } | null;
      setHasPin(Boolean(body?.user?.hasPin));
    } catch {
      setHasPin(null);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void readState();
  }, [readState]);

  function reset() {
    setMode("idle");
    setCurrentPin("");
    setPin("");
    setConfirm("");
    setError(null);
  }

  async function submit() {
    if (pin !== confirm) {
      setError("The two PINs do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await authorizedFetch("/api/me/pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "set" ? { pin } : { pin, currentPin }),
      });
      const body = (await res.json().catch(() => null)) as { hasPin?: boolean; error?: string } | null;
      if (res.ok) {
        setHasPin(Boolean(body?.hasPin));
        setNote(body?.hasPin ? "PIN saved. The app locks on the next fresh tab." : "PIN removed.");
        reset();
      } else {
        setError(body?.error ?? "Could not save the PIN.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await authorizedFetch("/api/me/pin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin }),
      });
      const body = (await res.json().catch(() => null)) as { hasPin?: boolean; error?: string } | null;
      if (res.ok) {
        setHasPin(Boolean(body?.hasPin));
        setNote("PIN removed.");
        reset();
      } else {
        setError(body?.error ?? "Could not remove the PIN.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="PIN lock">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-on-surface">PIN lock</h3>
        <span className="text-sm text-on-surface-variant">
          {hasPin === null ? "Checking..." : hasPin ? "Set" : "Not set"}
        </span>
      </div>
      <p className="text-sm text-on-surface-variant">
        {hasPin
          ? "One PIN, both jobs: the app asks for it when it opens in a fresh tab or from the home screen, and you can use it to sign in from the login screen when you would rather not wait for a code. As a lock it changes nothing about your session."
          : "Add a 4-6-digit PIN: the app will ask for it whenever it opens in a fresh tab or from the home screen, and you can use it to sign in from the login screen when you would rather not wait for a code."}
      </p>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-quiet min-h-0 px-4 py-2 text-sm"
            onClick={() => setMode(hasPin ? "change" : "set")}
          >
            {hasPin ? "Change the PIN" : "Set a PIN"}
          </button>
          {hasPin && (
            <button type="button" className="btn-quiet min-h-0 px-4 py-2 text-sm" onClick={() => setMode("reset")}>
              Forgot the PIN?
            </button>
          )}
        </div>
      ) : mode === "reset" ? (
        <>
          <PinResetPanel
            onReset={() => {
              setNote("PIN reset.");
              reset();
              void readState();
            }}
          />
          <button type="button" className="btn-quiet min-h-0 px-4 py-2 text-sm" onClick={reset}>
            Cancel
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {hasPin && (
            <>
              <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-current">
                Current PIN
              </label>
              <input
                id="pin-current"
                className="field"
                inputMode="numeric"
                placeholder="4-6 digits"
                value={currentPin}
                onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
              />
            </>
          )}
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-new">
            New PIN
          </label>
          <input
            id="pin-new"
            className="field"
            inputMode="numeric"
            placeholder="4-6 digits"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
          />
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="pin-confirm">
            Confirm the new PIN
          </label>
          <input
            id="pin-confirm"
            className="field"
            inputMode="numeric"
            placeholder="4-6 digits"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-brand min-h-0 px-4 py-2 text-sm"
              onClick={() => void submit()}
              disabled={busy || pin.length < PIN_MIN_LENGTH}
            >
              {hasPin ? "Save the new PIN" : "Set the PIN"}
            </button>
            {hasPin && (
              <button
                type="button"
                className="btn-quiet min-h-0 px-4 py-2 text-sm"
                onClick={() => void remove()}
                disabled={busy || currentPin.length < PIN_MIN_LENGTH}
              >
                Remove the PIN
              </button>
            )}
            <button type="button" className="btn-quiet min-h-0 px-4 py-2 text-sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {note && <p className="text-sm text-accent">{note}</p>}
      {error && (
        <p className="text-sm text-wa-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
