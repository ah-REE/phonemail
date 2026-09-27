"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
import { AttachmentChips } from "@/components/attachments";
import { validateAttachmentSet } from "@/lib/attachments";
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
 * "9876543210, +91 98765 43211, 9876543212@phonemail.com, bee.friend" -> recipients.
 *
 * The field says it takes a NUMBER OR AN ALIAS, and this is the one function the
 * preset query string, the chip input and validation all use - so it has to
 * accept both. It used to strip every non-digit from every token, which turned an
 * alias into the empty string: the app advertised "Number or alias" and then
 * silently refused half of its own promise, leaving an error about the number
 * that gave the sender nothing to act on.
 *
 * A token that is not phone-shaped is therefore kept as an ALIAS (lower-cased) and
 * handed to the server, which is the only thing that can say whether it exists.
 */
function parseRecipients(raw: string): string[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim().replace(/@.*$/, ""))
    .filter((entry) => entry.length > 0);

  const recipients = tokens.map((token) => {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 10) {
      return token.toLowerCase();
    }
    return digits.replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  });

  return [...new Set(recipients)];
}

/** The number on file for a recipient, so a NAME can be resolved to their address. */
function numberForName(contacts: SavedContact[], raw: string): string | null {
  const wanted = raw.trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  const match = contacts.find((contact) => {
    const name = (contact.displayName?.trim() || contact.accountName?.trim() || "").toLowerCase();
    return name.length > 0 && name === wanted;
  });
  return match ? match.accountPhone ?? phonePartOf(match.address) : null;
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

  // Replying: the thread hands over the original message's subject and opening
  // words, so the subject is re: of THAT mail (not of whatever arrived last) and
  // the composer can show what is being answered, the way a chat quotes a reply.
  const originalSubject = searchParams.get("origSubject") ?? "";
  const quotedFrom = searchParams.get("quote") ?? "";
  // A reply inside a GROUP names its thread: addressed to one member, it would
  // otherwise derive a pairwise key and land in that member's 1:1 chat.
  const groupThreadKey = searchParams.get("threadKey") ?? "";
  const replySubject = originalSubject
    ? originalSubject.toLowerCase().startsWith("re:")
      ? originalSubject
      : `re: ${originalSubject}`
    : "re: ";
  // Task 4: the thread's compose button opens this screen with the recipient
  // already chosen and locked - the same affordance a reply has.
  const lockRecipients = isReply || searchParams.get("lockTo") === "1";

  const [recipients, setRecipients] = useState<string[]>(() => parseRecipients(presetTo));
  const [draftRecipient, setDraftRecipient] = useState("");
  const [subject, setSubject] = useState(isReply ? replySubject : "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ to?: string; subject?: string; body?: string }>({});
  // ROUND 7: the paperclip is a REAL picker now - the "coming soon" panel it used
  // to raise is gone, along with the three decorative buttons beside it that all
  // raised the same panel. One control, one meaning: choose files (multi, capped by
  // the shared rule that the send route enforces again server-side).
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) {
      return;
    }
    const next = [...files, ...Array.from(picked)];
    const problem = validateAttachmentSet(
      next.map((file) => ({ filename: file.name, sizeBytes: file.size })),
    );
    setAttachError(problem);
    if (problem) {
      return;
    }
    setFiles(next);
  }
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
    // A name that matches a saved contact picks that contact - "selecting a saved
    // contact" by typing it, which is what the field implies it can do.
    const byName = numberForName(contacts, raw);
    const parsed = byName ? [byName] : parseRecipients(raw);
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
      next.to = "Add a 10-digit number, a saved contact or an alias (two or more makes a group).";
    } else if (
      !recipients.every((recipient) => /^[6-9]\d{9}$/.test(recipient) || /^[a-z0-9.]{3,20}$/.test(recipient))
    ) {
      next.to = "Each recipient must be a 10-digit mobile number, or an alias like bee.friend.";
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
    if (busy || !validate()) {
      return;
    }

    setBusy(true);
    try {
      // A message WITH files goes as multipart/form-data, so the files ride the same
      // ONE SMTP submission the text does; a message without them keeps the plain
      // JSON body it always had, byte for byte.
      let requestInit: RequestInit;
      if (files.length > 0) {
        const form = new FormData();
        recipients.forEach((recipient) => form.append("to", recipient));
        form.append("subject", subject);
        form.append("body", body);
        if (replyToId) form.append("replyToId", replyToId);
        if (groupThreadKey) form.append("threadKey", groupThreadKey);
        files.forEach((file) => form.append("attachments", file));
        requestInit = { method: "POST", body: form };
      } else {
        requestInit = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Always an array: one recipient or the whole group, one submission.
            to: recipients,
            subject,
            body,
            ...(replyToId ? { replyToId } : {}),
            ...(groupThreadKey ? { threadKey: groupThreadKey } : {}),
          }),
        };
      }

      const response = await authorizedFetch("/api/emails", requestInit);
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
      // Sending is silent on purpose: the message simply appears in the thread
      // once the SMTP round trip has written the row. Saying "handed to the mail
      // service" narrates an implementation detail the sender does not need.
      void addresses;
      // Back to the thread so the new message appears when delivery completes.
      // A group send opens the derived group thread - the server hands us the key.
      const groupKey = payload.threadKey ?? groupThreadKey ?? null;
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
              placeholder="Number or alias"
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
              /* ROUND 6: a true circle, its diameter matched to the chip row's own
                 height (h-8 = the 32px chip), glyph centred, square by
                 construction rather than by arithmetic. */
              <button
                type="button"
                aria-label="Add this recipient"
                title="Add this recipient"
                className="box-border flex min-h-0 aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft p-0 leading-none text-accent disabled:opacity-40"
                disabled={draftRecipient.trim().length === 0}
                onClick={() => addRecipientsFrom(draftRecipient)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
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

        {isReply && (quotedFrom || originalSubject) && (
          <div className="mx-4 mb-1 flex items-start gap-2 rounded-2xl border-l-4 border-accent bg-surface-container-low px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-on-surface">
                {originalSubject || "the original message"}
              </p>
              {quotedFrom && (
                <p className="truncate text-[13px] text-on-surface-variant">{quotedFrom}</p>
              )}
            </div>
          </div>
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

        <AttachmentChips
          files={files}
          disabled={busy}
          onRemove={(index) => {
            setAttachError(null);
            setFiles((current) => current.filter((_, position) => position !== index));
          }}
        />
        {attachError && (
          <p className="px-4 pb-1 text-sm text-wa-alert" role="alert">
            {attachError}
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Choose files to attach"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="flex h-14 w-full shrink-0 items-center justify-between border-t border-wa-line bg-surface-container-lowest px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Attach files"
              title="Attach files"
              className="flex min-h-0 h-11 w-11 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 11l-7.6 7.6a4.2 4.2 0 0 1-6-6L14 5a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2L15 8" />
              </svg>
            </button>
          </div>
          <button
            type="submit"
            aria-label={isReply ? "Send reply" : "Send message"}
            className="flex min-h-0 h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-surface disabled:opacity-60"
            disabled={busy}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l16-8-6 8 6 8-16-8z" />
            </svg>
          </button>
        </div>
          {busy && (
          <p className="px-4 py-2 text-sm text-on-surface-variant">
            Sending{files.length > 0 ? ` ${files.length} file${files.length === 1 ? "" : "s"}` : ""}.
          </p>
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
