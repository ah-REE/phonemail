"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { clearDraft, readDraft, saveDraft } from "@/lib/folders";
import { useAuth } from "@/lib/useAuth";

/**
 * Compose (traditional view).
 *
 *  - To accepts ONE OR MANY recipients: a bare 10-digit number, a full
 *    <phone>@phonemail.com address, or a comma list of them (Day 6 group chat).
 *    Each accepted recipient becomes a chip, and a chip can be removed again
 *    while the field is not locked
 *  - opened from a thread as a reply (?to=…&replyTo=…), the To field is LOCKED
 *    to the counterpart and the subject is prefilled, because reply-once is
 *    enforced server-side against that message
 *  - a 202 means the mail service accepted it; the row appears when the SMTP
 *    round trip completes, so we navigate back to the thread rather than
 *    pretending the message already exists
 */

/**
 * "9876543210, +91 98765 43211, 9876543212@phonemail.com" -> canonical numbers.
 * The preset query string, the chip input and validation all use this one
 * function, so all three agree on what a recipient is.
 */
function parseRecipients(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((entry) =>
          entry
            .trim()
            .replace(/@.*$/, "")
            .replace(/\D/g, "")
            .replace(/^91(?=\d{10}$)/, "")
            .replace(/^0(?=\d{10}$)/, ""),
        )
        .filter((entry) => entry.length > 0),
    ),
  ];
}

function ComposeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, token, authorizedFetch } = useAuth();

  const presetTo = searchParams.get("to") ?? "";
  const replyToId = searchParams.get("replyTo") ?? "";
  const isReply = Boolean(replyToId);
  // Task 4: the thread's compose button opens this screen with the recipient
  // already chosen and locked - the same affordance a reply has.
  const lockRecipients = isReply || searchParams.get("lockTo") === "1";

  const [recipients, setRecipients] = useState<string[]>(() => parseRecipients(presetTo));
  const [draftRecipient, setDraftRecipient] = useState("");
  const [subject, setSubject] = useState(isReply ? "re: " : "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ to?: string; subject?: string; body?: string }>({});

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  // Resume a draft: /compose?draft=1 fills the form from this device's storage.
  const resumingDraft = searchParams.get("draft") === "1";
  useEffect(() => {
    if (!resumingDraft || isReply) {
      return;
    }
    const draft = readDraft();
    if (!draft) {
      return;
    }
    if (draft.to) {
      setRecipients(parseRecipients(draft.to));
    }
    setSubject(draft.subject);
    setBody(draft.body);
  }, [resumingDraft, isReply]);

  /**
   * Compose abandonment (Task 3): keep what has been typed on this device, so
   * leaving the screen does not lose it. A reply is deliberately NOT drafted -
   * reply-once is enforced against the original message, so a stale reply draft
   * could only trap the user.
   */
  useEffect(() => {
    if (isReply) {
      return;
    }
    saveDraft({ to: recipients.join(", "), subject, body });
  }, [recipients, subject, body, isReply]);

  function addRecipientsFrom(raw: string) {
    const parsed = parseRecipients(raw);
    if (parsed.length === 0) {
      return;
    }
    setRecipients((current) => [...new Set([...current, ...parsed])]);
    setDraftRecipient("");
  }

  function removeRecipient(entry: string) {
    // A reply and an in-thread compose both have a locked recipient set.
    if (lockRecipients) {
      return;
    }
    setRecipients((current) => current.filter((recipient) => recipient !== entry));
  }

  function validate() {
    const next: { to?: string; subject?: string; body?: string } = {};
    if (recipients.length === 0) {
      next.to = "Add at least one 10-digit number (two or more makes a group).";
    } else if (!recipients.every((recipient) => /^[6-9]\d{9}$/.test(recipient))) {
      next.to = "Every recipient must be a 10-digit Indian mobile number starting with 6, 7, 8 or 9.";
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
          // Always an array: one recipient or the whole group, one submission.
          to: recipients,
          subject,
          body,
          ...(replyToId ? { replyToId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        to?: string | string[];
        threadKey?: string | null;
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

      // The message reached the mail service, so the draft has done its job.
      clearDraft();
      const addresses = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : [];
      setNotice(`Handed to the mail service for ${addresses.join(", ")}.`);
      // Back to the thread so the new message appears when delivery completes.
      // A group send opens the derived group thread - the server hands us the key.
      const groupKey = payload.threadKey ?? null;
      const single = addresses[0]?.replace(/@.*$/, "") ?? recipients[0] ?? "";
      setTimeout(() => {
        if (groupKey) {
          router.push(`/thread/group/${encodeURIComponent(groupKey)}`);
        } else {
          router.push(`/thread/${single}`);
        }
      }, 700);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col">
        <AppBar title="New message" backHref="/" />
        <div className="p-4">
          <span className="skeleton h-12 w-full rounded-card" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppBar title={isReply ? "Reply" : "New message"} backHref="/" />

      <form className="flex flex-1 flex-col gap-3 p-4" onSubmit={handleSend} noValidate>
        <label className="text-sm text-wa-muted" htmlFor="to">
          To {isReply && <span className="text-wa-teal">(locked — replying in this thread)</span>}
        </label>
        {!isReply && recipients.length > 1 && (
          <p className="text-sm text-wa-teal">Group: {recipients.length} recipients</p>
        )}
        <div className="flex flex-wrap gap-2">
          {recipients.map((recipient) => (
            <span
              key={recipient}
              className="flex items-center gap-2 rounded-full border border-wa-line bg-wa-panel px-3 py-1 text-sm"
            >
              {recipient}
              {!lockRecipients && (
                <button
                  type="button"
                  aria-label={`Remove ${recipient}`}
                  className="min-h-tap min-w-tap leading-none text-wa-muted"
                  onClick={() => removeRecipient(recipient)}
                >
                  x
                </button>
              )}
            </span>
          ))}
        </div>
        <input
          id="to"
          className={`field ${isReply ? "bg-wa-bg" : ""}`}
          inputMode="tel"
          placeholder={lockRecipients ? "" : "9876543210, 9876543211"}
          value={lockRecipients ? recipients.join(", ") : draftRecipient}
          readOnly={lockRecipients}
          aria-readonly={lockRecipients}
          onChange={(event) => setDraftRecipient(event.target.value)}
          onBlur={() => addRecipientsFrom(draftRecipient)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addRecipientsFrom(draftRecipient);
            }
          }}
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
