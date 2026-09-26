"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
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

interface SavedContact {
  id: string;
  address: string;
  displayName: string | null;
  accountName: string | null;
  accountPhone: string | null;
}

/** "<number>@phonemail.com" -> "<number>" */
function phonePartOf(address: string): string {
  return address.replace(/@.*$/, "");
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
  // The mockup's paperclip: present per the design, honest about the backend.
  const [attachNotice, setAttachNotice] = useState(false);
  const [contacts, setContacts] = useState<SavedContact[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  // Contact autocomplete reads the same list the Contacts screen shows. Read
  // once, when the screen opens: a compose screen is short-lived and this is a
  // convenience, so a failure here stays silent rather than blocking a send.
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await authorizedFetch("/api/contacts");
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { contacts?: SavedContact[] };
        if (!cancelled) {
          setContacts(body.contacts ?? []);
        }
      } catch {
        // Silent on purpose: no address book, no suggestions, sending unaffected.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, authorizedFetch]);

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

  // The saved name for a number, so a chip reads "Amma" rather than a number the
  // user never typed. Empty string means "no name saved", and the number shows.
  const nameByRecipient = new Map(
    contacts.map((contact) => [
      contact.accountPhone ?? phonePartOf(contact.address),
      contact.displayName?.trim() || contact.accountName?.trim() || "",
    ]),
  );

  // Suggestions while typing: name or address contains the needle, never someone
  // already on the list, capped so the dropdown cannot take over the screen.
  const needle = draftRecipient.trim().toLowerCase();
  const suggestions =
    lockRecipients || needle.length === 0
      ? []
      : contacts
          .filter((contact) => {
            const name = (contact.displayName?.trim() || contact.accountName?.trim() || "").toLowerCase();
            return name.includes(needle) || contact.address.toLowerCase().includes(needle);
          })
          .filter(
            (contact) =>
              !recipients.includes(contact.accountPhone ?? phonePartOf(contact.address)),
          )
          .slice(0, 5);

  function addSuggestion(contact: SavedContact) {
    const number = contact.accountPhone ?? phonePartOf(contact.address);
    setRecipients((current) => [...new Set([...current, number])]);
    setDraftRecipient("");
  }

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
      <AppBar title={isReply ? "Reply" : "Compose"} backHref="/" />

            <form className="flex flex-1 flex-col" onSubmit={handleSend} noValidate>
        <div className="flex min-h-[56px] w-full items-center px-4">
          {/* Locked: the chips below ARE the recipient list, so the field that
              repeated them is not rendered - it printed every number twice. */}
          {lockRecipients ? (
            <span className="w-16 shrink-0 text-sm font-semibold text-outline">To</span>
          ) : (
            <label className="w-16 shrink-0 text-sm font-semibold text-outline" htmlFor="to">
              To
            </label>
          )}
          <div className="flex flex-1 flex-wrap items-center gap-2 py-3">
            {recipients.map((recipient) => (
              <span
                key={recipient}
                className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-sm"
              >
                <span title={recipient}>{nameByRecipient.get(recipient) || recipient}</span>
                {!lockRecipients && (
                  <button
                    type="button"
                    aria-label={`Remove ${recipient}`}
                    className="min-h-0 leading-none text-on-surface-variant"
                    onClick={() => removeRecipient(recipient)}
                  >
                    x
                  </button>
                )}
              </span>
            ))}
            {!lockRecipients && (
            <input
              id="to"
              className="min-w-32 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-on-surface-variant"
              inputMode="tel"
              placeholder="9876543210, 9876543211"
              value={draftRecipient}
              onChange={(event) => setDraftRecipient(event.target.value)}
              onBlur={() => addRecipientsFrom(draftRecipient)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addRecipientsFrom(draftRecipient);
                }
              }}
            />
            )}
            {!lockRecipients && (
              <button
                type="button"
                aria-label="Add this recipient"
                title="Add this recipient"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent disabled:opacity-40"
                disabled={draftRecipient.trim().length === 0}
                onClick={() => addRecipientsFrom(draftRecipient)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {!lockRecipients && suggestions.length > 0 && (
          <div className="flex flex-col border-b border-surface-variant" aria-label="Contact suggestions">
            {suggestions.map((contact) => {
              const name = contact.displayName?.trim() || contact.accountName?.trim() || contact.address;
              return (
                <button
                  key={contact.id}
                  type="button"
                  className="flex min-h-[52px] items-center gap-3 px-4 text-left active:bg-surface-container-high/40"
                  onClick={() => addSuggestion(contact)}
                >
                  <Avatar size={32} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className="truncate text-xs text-on-surface-variant">{contact.address}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {lockRecipients && (
          <p className="px-4 pb-2 text-xs text-on-surface-variant">
            Recipients are locked for this conversation.
          </p>
        )}
        {!lockRecipients && recipients.length > 1 && (
          <p className="px-4 pb-2 text-xs text-primary-container">
            Group: {recipients.length} recipients
          </p>
        )}
        <div className="h-[1px] w-full bg-surface-variant" />
        {fieldErrors.to && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.to}
          </p>
        )}

        <div className="flex min-h-[56px] w-full items-center px-4">
          <label className="w-16 shrink-0 text-sm font-semibold text-outline" htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            className="flex-1 bg-transparent py-3 text-base font-medium outline-none placeholder:text-on-surface-variant"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
        <div className="h-[1px] w-full bg-surface-variant" />
        {fieldErrors.subject && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.subject}
          </p>
        )}

        <label className="sr-only" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          className="min-h-[170px] w-full flex-1 resize-none bg-transparent p-4 text-base leading-relaxed outline-none placeholder:text-on-surface-variant"
          placeholder="Write your message"
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

        <div className="flex h-14 w-full shrink-0 items-center justify-between border-t border-wa-line bg-surface-container-lowest px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Attach file"
              className="flex h-11 w-11 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => setAttachNotice(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11l-7.6 7.6a4.2 4.2 0 0 1-6-6L14 5a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2L15 8" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Attach document"
              className="flex h-11 w-11 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => setAttachNotice(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3h7l4 4v14H7z" />
                <path d="M14 3v5h5M10 13h6M10 17h4" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Open camera"
              className="flex h-11 w-11 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => setAttachNotice(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Attach photo"
              className="flex h-11 w-11 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => setAttachNotice(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M4 16l4.5-4.5L13 16M14 13l2.5-2.5L20 14" />
              </svg>
            </button>
          </div>
          <button
            type="submit"
            aria-label={isReply ? "Send reply" : "Send message"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-surface disabled:opacity-60"
            disabled={busy}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l16-8-6 8 6 8-16-8z" />
            </svg>
          </button>
        </div>
        {busy && <p className="px-4 py-2 text-sm text-on-surface-variant">Sending.</p>}

        {attachNotice && (
          <button
            type="button"
            onClick={() => setAttachNotice(false)}
            aria-label="Dismiss"
            className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 pb-28"
          >
            <span className="surface flex w-full max-w-sm flex-col items-center gap-1 p-4 text-center">
              <span className="text-base font-semibold">Attachments coming soon</span>
              <span className="text-sm text-on-surface-variant">
                PhoneMail cannot carry files yet. Your message text is unaffected.
              </span>
            </span>
          </button>
        )}
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
