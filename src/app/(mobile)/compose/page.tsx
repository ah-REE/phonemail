"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Compose — deliberately minimal for Day 3.
 *
 * The brief calls this a stub until Day 4, but a working send form is what
 * makes the mobile app demoable end to end in a browser (it uses the real
 * POST /api/emails, so the SMTP round trip is exercised). Formatting, reply
 * handling and message boxes arrive Day 4.
 */
export default function ComposePage() {
  const router = useRouter();
  const { ready, token, authorizedFetch } = useAuth();

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !token) {
      router.replace("/onboarding");
    }
  }, [ready, token, router]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authorizedFetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; to?: string };

      if (!response.ok) {
        setError(payload.error ?? "Could not send the message.");
        return;
      }

      setMessage(`Sent to ${payload.to ?? to}.`);
      setTo("");
      setSubject("");
      setBody("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !token) {
    return null;
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex min-h-tap items-center gap-3 bg-wa-teal px-4 py-3 text-white">
        <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none">
          ←
        </Link>
        <h1 className="text-xl font-semibold">New message</h1>
      </header>

      <form className="flex flex-1 flex-col gap-3 p-4" onSubmit={handleSend}>
        <label className="text-sm text-wa-muted" htmlFor="to">
          To (phone number or name@phonemail.com)
        </label>
        <input
          id="to"
          className="field"
          inputMode="tel"
          placeholder="9876543210"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          required
        />

        <label className="text-sm text-wa-muted" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          className="field"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
        />

        <label className="text-sm text-wa-muted" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          className="field min-h-32 flex-1 py-3"
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />

        {message && <p className="text-sm">{message}</p>}
        {error && (
          <p className="text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </main>
  );
}
