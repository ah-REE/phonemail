"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Compose (traditional view).
 *
 *  - To accepts a bare 10-digit number or a full <phone>@phonemail.com address
 *  - opened from a thread as a reply (?to=…&replyTo=…), the To field is LOCKED
 *    to the counterpart and the subject is prefilled, because reply-once is
 *    enforced server-side against that message
 *  - a 202 means the mail service accepted it; the row appears when the SMTP
 *    round trip completes, so we navigate back to the thread rather than
 *    pretending the message already exists
 */

function ComposeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, token, authorizedFetch } = useAuth();

  const presetTo = searchParams.get("to") ?? "";
  const replyToId = searchParams.get("replyTo") ?? "";
  const isReply = Boolean(replyToId);

  const [to, setTo] = useState(presetTo);
  const [subject, setSubject] = useState(isReply ? "re: " : "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ to?: string; subject?: string; body?: string }>({});

  useEffect(() => {
    if (ready && !token) {
      router.replace("/onboarding");
    }
  }, [ready, token, router]);

  function validate() {
    const next: { to?: string; subject?: string; body?: string } = {};
    const digits = to.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      next.to = "Enter a 10-digit Indian mobile number (or <number>@phonemail.com).";
    }
    if (!subject.trim()) {
      next.subject = "Add a subject.";
    }
    if (!body.trim()) {
      next.body = "Write a message.";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!validate()) {
      return;
    }

    setBusy(true);
    try {
      const response = await authorizedFetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          ...(replyToId ? { replyToId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        to?: string;
        subject?: string;
      };

      if (!response.ok) {
        if (response.status === 409) {
          setError("You have already replied to that message.");
        } else {
          setError(payload.error ?? "Could not send the message.");
        }
        return;
      }

      setNotice(`Handed to the mail service for ${payload.to ?? to}.`);
      const target = payload.to ?? to;
      // Back to the thread so the new message appears when delivery completes.
      setTimeout(() => router.push(`/thread/${target.replace(/@.*$/, "")}`), 700);
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
        <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold">{isReply ? "Reply" : "New message"}</h1>
      </header>

      <form className="flex flex-1 flex-col gap-3 p-4" onSubmit={handleSend} noValidate>
        <label className="text-sm text-wa-muted" htmlFor="to">
          To {isReply && <span className="text-wa-teal">(locked — replying in this thread)</span>}
        </label>
        <input
          id="to"
          className={`field ${isReply ? "bg-wa-bg" : ""}`}
          inputMode="tel"
          placeholder="9876543210"
          value={to}
          readOnly={isReply}
          aria-readonly={isReply}
          onChange={(event) => setTo(event.target.value)}
        />
        {fieldErrors.to && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.to}
          </p>
        )}

        <label className="text-sm text-wa-muted" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          className="field"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        {fieldErrors.subject && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.subject}
          </p>
        )}

        <label className="text-sm text-wa-muted" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          className="field min-h-32 flex-1 py-3"
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        {fieldErrors.body && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.body}
          </p>
        )}

        {notice && <p className="text-sm text-wa-teal">{notice}</p>}
        {error && (
          <p className="text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : isReply ? "Send reply" : "Send"}
        </button>
      </form>
    </main>
  );
}

export default function ComposePage() {
  // useSearchParams needs a Suspense boundary when the route is prerendered.
  return (
    <Suspense fallback={<p className="p-4 text-wa-muted">Loading…</p>}>
      <ComposeForm />
    </Suspense>
  );
}
