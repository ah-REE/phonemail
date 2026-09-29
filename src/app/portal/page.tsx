"use client";

import { useState } from "react";

import { Wordmark } from "@/components/wordmark";

/**
 * PhoneMail registration portal - phone + OTP only.
 *
 * Deliberately minimal: it reuses the same /api/auth endpoints as the app
 * interfaces and exists so a fresh account can be created from a browser.
 *
 * ROUND 25: A WIDE VIEWPORT GETS A DESKTOP TREATMENT. This page is a route of its
 * own - not inside the (mobile) group - so the entry handover never ran here, and a
 * laptop visitor met a 420px column of unstyled form: the mobile portal. It is NOT
 * redirected to the desktop client, deliberately, because registration must work for
 * someone who has no account and no session; instead the same two-field form now
 * sits in the design system's own centred card on the token background from 640px
 * up. Below that it is the phone portal it has always been: full-bleed, no card.
 *
 * The FORM CONTROLS keep their own inline styling - the portal is the one surface
 * that never joined the token system, which is recorded in the README's gaps - but
 * the page around them now matches the desktop client's login card.
 */

type Step = "phone" | "otp" | "done";

interface ApiError {
  error?: string;
  devHint?: string;
  retryAfterSeconds?: number;
}

export default function PortalPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);

  function resetForm() {
    setPhoneNumber("");
    setOtp("");
    setStep("phone");
    setMessage(null);
    setDevHint(null);
    setAccount(null);
  }

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setDevHint(null);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = (await response.json()) as ApiError & { success?: boolean };

      if (!response.ok) {
        setMessage(
          data.retryAfterSeconds
            ? `${data.error ?? "Please wait."} Try again in ${data.retryAfterSeconds}s.`
            : (data.error ?? "Could not send OTP."),
        );
        return;
      }

      setStep("otp");
      setMessage("OTP sent.");
      if (data.devHint) {
        setDevHint(data.devHint);
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, otp, source: "portal" }),
      });
      const data = (await response.json()) as ApiError & { user?: { phoneNumber: string } };

      if (!response.ok) {
        setMessage(data.error ?? "Could not verify OTP.");
        return;
      }

      setAccount(data.user?.phoneNumber ?? phoneNumber);
      setStep("done");
      setOtp("");
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-low px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex w-full max-w-md flex-col sm:rounded-card sm:border sm:border-outline-variant sm:bg-surface sm:p-8">
      {/* ROUND 4: the portal shows the same wordmark treatment as the app. */}
      <h1 style={styles.title}>
        <Wordmark as="span" size={32} />
      </h1>
      <p style={styles.subtitle}>Register with your phone number. No password.</p>

      {step !== "done" && (
        <form onSubmit={step === "phone" ? handleSendOtp : handleVerify} style={styles.card}>
          <label style={styles.label} htmlFor="phoneNumber">
            Phone number
          </label>
          <input
            id="phoneNumber"
            name="phoneNumber"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="Mobile number"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={step === "otp"}
            style={styles.input}
            required
          />

          {step === "otp" && (
            <>
              <label style={styles.label} htmlFor="otp">
                OTP
              </label>
              <input
                id="otp"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                style={styles.input}
                required
              />
            </>
          )}

          <button type="submit" disabled={busy} style={styles.button}>
            {busy ? "Please wait…" : step === "phone" ? "Send OTP" : "Verify & register"}
          </button>

          {message && <p style={styles.message}>{message}</p>}
          {devHint && <p style={styles.hint}>{devHint}</p>}
        </form>
      )}

      {step === "done" && (
        <div style={styles.card}>
          <p style={styles.success}>
            Registered <strong>{account}</strong>. That account can now sign in and receive mail.
          </p>
          <button type="button" onClick={resetForm} style={styles.button}>
            Register another number
          </button>
        </div>
      )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: { fontSize: 32, margin: "0 0 4px" },
  subtitle: { margin: "0 0 24px", color: "#555" },
  card: { display: "flex", flexDirection: "column", gap: 10, border: "1px solid #ddd", padding: 20 },
  label: { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "#555" },
  input: { fontSize: 18, padding: "12px 14px", border: "1px solid #bbb", borderRadius: 4 },
  button: { fontSize: 17, fontWeight: 600, padding: "12px 16px", marginTop: 6, border: "1px solid #111", background: "#111", color: "#fff", borderRadius: 4, cursor: "pointer" },
  message: { margin: "6px 0 0", color: "#a33", fontSize: 14 },
  hint: { margin: 0, color: "#555", fontSize: 13 },
  success: { margin: "0 0 6px", fontSize: 16 },
};
