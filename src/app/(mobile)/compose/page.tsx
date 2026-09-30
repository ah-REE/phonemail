"use client";

import { guardRedirect } from "@/lib/entry";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/spinner";
import { AttachmentDrafts } from "@/components/attachments";
import { validateAttachmentSet } from "@/lib/attachments";
import {
  clearDraft as clearDraftEverywhere,
  DRAFT_SAVE_DEBOUNCE_MS,
  debounce,
  loadDraft,
  saveDraft as saveDraftEverywhere,
} from "@/lib/draftSync";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
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
 *  - a 202 means the send was accepted; the row appears when delivery writes
 *    it, so we navigate back to the thread rather than pretending the message
 *    already exists
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
  const { status, token, authorizedFetch, authorizedUpload } = useAuth();

  const presetTo = searchParams.get("to") ?? "";
  const replyToId = searchParams.get("replyTo") ?? "";
  const isReply = Boolean(replyToId);
  // ROUND 29 (forward): the source row's id rides the link; its subject, body
  // and attachments are fetched once and prefilled. To and Cc stay FREE - the
  // opposite lock from a reply.
  const forwardOfId = searchParams.get("forwardOf") ?? "";
  const isForward = Boolean(forwardOfId);

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
  // ROUND 9: CC, the field the spec asked for and the app never had. Same chips,
  // same resolution (number or alias), same autocomplete - and the SAME lock: a
  // reply and a thread-launched compose lock To AND Cc, because inside a chat the
  // recipient set is the conversation's, not the writer's to change.
  const [cc, setCc] = useState<string[]>([]);
  const [draftCc, setDraftCc] = useState("");
  const [subject, setSubject] = useState(isReply ? replySubject : "");
  const [body, setBody] = useState("");
  /**
   * ROUND 29 (forward): the source's attachments, fetched once for the block in
   * the form. Removing one only keeps its id out of the copy list the send
   * carries; the bytes never existed on this side.
   */
  const [forwardFiles, setForwardFiles] = useState<
    { id: string; filename: string; contentType: string; sizeBytes: number }[]
  >([]);
  const [forwardSourceIds, setForwardSourceIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ to?: string; subject?: string; body?: string }>({});
  // ROUND 8: THREE affordances, because "attach a file" was hiding three different
  // intentions behind one paperclip - a document, a picture, and the camera. Each is
  // a clean circle that opts out of the global 56px button floor (min-h-0 - the rule
  // that made the old controls render as ovals), and each opens its own input with
  // its own accept/capture filter. The chosen files render as CARDS in the message
  // body region, in the same language the thread uses for a delivered file.
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** ROUND 31: the exit runs before the navigation, so Cancel reads as reverse. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

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
    setUploadPhase("idle");
  }
  const [contacts, setContacts] = useState<SavedContact[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      guardRedirect(router);
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

  /**
   * ROUND 22: RESUME THE DRAFT.
   *
   * Opening a NEW compose restores whatever was left unfinished - from the account
   * (server) or from this device (the copy taken in case the server was away), and
   * the newer of the two wins. `?draft=1` is still what the Drafts screen links
   * with, but a plain open restores too: a draft that only comes back if you find
   * the right menu item is a draft most people will never see again.
   *
   * A reply is never restored - reply-once is enforced against the original mail,
   * so a stale reply draft could only trap the reader.
   */
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (isReply || lockRecipients || draftRestored) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const found = await loadDraft(authorizedFetch);
      if (cancelled || !found) {
        setDraftRestored(true);
        return;
      }
      if (found.draft.to) {
        setRecipients(parseRecipients(found.draft.to));
      }
      setCc(parseRecipients(found.draft.cc));
      setSubject(found.draft.subject);
      setBody(found.draft.body);
      setDraftRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isReply, lockRecipients, draftRestored, authorizedFetch]);

  /**
   * Compose abandonment (Task 3): keep what has been typed on this device, so
   * leaving the screen does not lose it. A reply is deliberately NOT drafted -
   * reply-once is enforced against the original message, so a stale reply draft
   * could only trap the user.
   */
  const saveDraftSoon = useMemo(
    () => debounce((payload: { to: string; cc: string; subject: string; body: string }) => {
      void saveDraftEverywhere(authorizedFetch, payload);
    }, DRAFT_SAVE_DEBOUNCE_MS),
    [authorizedFetch],
  );

  useEffect(() => {
    if (isReply || lockRecipients || !draftRestored) {
      return;
    }
    saveDraftSoon({ to: recipients.join(", "), cc: cc.join(", "), subject, body });
  }, [recipients, cc, subject, body, isReply, lockRecipients, draftRestored, saveDraftSoon]);

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

  // The Cc field's own suggestions: the same source and the same exclusions, minus
  // anyone already on either list.
  const ccNeedle = draftCc.trim().toLowerCase();
  const ccSuggestions =
    lockRecipients || ccNeedle.length === 0
      ? []
      : contacts
          .filter((contact) => {
            const name = (contact.displayName?.trim() || contact.accountName?.trim() || "").toLowerCase();
            return name.includes(ccNeedle) || contact.address.toLowerCase().includes(ccNeedle);
          })
          .filter((contact) => {
            const number = contact.accountPhone ?? phonePartOf(contact.address);
            return !recipients.includes(number) && !cc.includes(number);
          })
          .slice(0, 5);

  function addCcSuggestion(contact: SavedContact) {
    const number = contact.accountPhone ?? phonePartOf(contact.address);
    setCc((current) => [...new Set([...current, number])]);
    setDraftCc("");
  }

  function addCcFrom(raw: string) {
    const byName = numberForName(contacts, raw);
    const parsed = byName ? [byName] : parseRecipients(raw);
    if (parsed.length === 0) {
      return;
    }
    setCc((current) => [...new Set([...current, ...parsed])].filter((entry) => !recipients.includes(entry)));
    setDraftCc("");
  }

  function removeCc(entry: string) {
    if (lockRecipients) {
      return;
    }
    setCc((current) => current.filter((recipient) => recipient !== entry));
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

  /**
   * The event is OPTIONAL because the failed cards retry the send directly - there
   * is no form event to prevent on that path.
   */
  /** Fetch the forward source once: subject, body and the attachment list. */
  useEffect(() => {
    if (!isForward || !forwardOfId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await authorizedFetch(`/api/emails/${forwardOfId}`);
        const payload = (await response.json().catch(() => null)) as {
          message?: {
            subject?: string;
            body?: string;
            from?: string;
            createdAt?: string;
            attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[];
          };
        } | null;
        const source = payload?.message;
        if (cancelled || !source) {
          return;
        }
        const original = source.subject ?? "";
        setSubject(original.toLowerCase().startsWith("fwd:") ? original : `Fwd: ${original}`);
        setBody(
          [
            "---------- Forwarded message ----------",
            `From: ${source.from ?? ""}`,
            `Date: ${source.createdAt ? new Date(source.createdAt).toLocaleString() : ""}`,
            `Subject: ${original}`,
            "",
            source.body ?? "",
          ].join("\n"),
        );
        const attachments = source.attachments ?? [];
        setForwardFiles(attachments);
        setForwardSourceIds(attachments.map((entry) => entry.id));
      } catch {
        setError("Could not load the message to forward.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isForward, forwardOfId, authorizedFetch, setSubject, setBody]);

  async function handleSend(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    setNotice(null);
    if (busy || !validate()) {
      return;
    }

    setBusy(true);
    try {
      // A message WITH files goes as multipart/form-data over the SAME single SMTP
      // submission the text uses - and through XMLHttpRequest, so a 20MB upload
      // reports real progress rather than a spinner that says nothing. A message
      // without files keeps the plain JSON body it always had, byte for byte.
      interface SendResponse {
        error?: string;
        to?: string | string[];
        threadKey?: string | null;
        subject?: string;
      }
      let sendStatus = 0;
      let payload: SendResponse = {};

      if (files.length > 0) {
        setUploadPhase("uploading");
        setProgress(0);
        const form = new FormData();
        recipients.forEach((recipient) => form.append("to", recipient));
        cc.forEach((recipient) => form.append("cc", recipient));
        form.append("subject", subject);
        form.append("body", body);
        if (replyToId) form.append("replyToId", replyToId);
        if (groupThreadKey) form.append("threadKey", groupThreadKey);
        if (forwardOfId) form.append("forwardOfId", forwardOfId);
        forwardSourceIds
          .filter((id) => !forwardFiles.some((entry) => entry.id === id))
          .forEach((id) => form.append("forwardOmitAttachmentIds", id));
        files.forEach((file) => form.append("attachments", file));
        const result = await authorizedUpload("/api/emails", form, setProgress);
        sendStatus = result.status;
        payload = (result.body ?? {}) as SendResponse;
      } else {
        const response = await authorizedFetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Always an array: one recipient or the whole group, one submission.
            to: recipients,
            cc,
            subject,
            body,
            ...(replyToId ? { replyToId } : {}),
            ...(groupThreadKey ? { threadKey: groupThreadKey } : {}),
            ...(forwardOfId
              ? {
                  forwardOfId,
                  ...(forwardSourceIds.some((id) => !forwardFiles.some((entry) => entry.id === id))
                    ? {
                      forwardOmitAttachmentIds: forwardSourceIds.filter(
                        (id) => !forwardFiles.some((entry) => entry.id === id),
                      ),
                    }
                    : {}),
                }
              : {}),
          }),
        });
        sendStatus = response.status;
        payload = (await response.json().catch(() => ({}))) as SendResponse;
      }

      if (sendStatus < 200 || sendStatus >= 300) {
        // A failed flight leaves the files where they are, in an error state with a
        // retry - it does not throw away what the reader chose.
        if (files.length > 0) {
          setUploadPhase("failed");
        }
        if (sendStatus === 409) {
          setError("You have already replied to that message.");
        } else {
          setError(payload.error ?? "Could not send the message.");
        }
        return;
      }

      // The message was accepted, so the draft has done its job.
      void clearDraftEverywhere(authorizedFetch);
      setUploadPhase("idle");
      const addresses = Array.isArray(payload.to) ? payload.to : payload.to ? [payload.to] : [];
      // Sending is silent on purpose: the message simply appears in the thread
      // once delivery has written the row. Narrating the machinery - queues,
      // submissions, relays - is an implementation detail the sender never needs.
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

  function beginExit() {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => router.push("/"), prefersReducedMotion() ? 0 : MOTION.composeExit);
  }

  return (
    <main
      className={`flex flex-1 flex-col ${closing ? "compose-exit" : "compose-enter"}`}
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest?.('a[href="/"]');
        if (anchor && !closing) {
          event.preventDefault();
          event.stopPropagation();
          beginExit();
        }
      }}
    >
      <AppBar title={isForward ? "Forward" : isReply ? "Reply" : "Compose"} backHref="/" />

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
            Recipients are locked for this conversation - To and Cc both.
          </p>
        )}
        {!lockRecipients && recipients.length + cc.length > 1 && (
          <p className="px-4 pb-2 text-xs text-primary-container">
            Group: {recipients.length + cc.length} recipients
          </p>
        )}
        <div className="h-[1px] w-full bg-surface-variant" />
        {fieldErrors.to && (
          <p className="text-sm text-wa-alert" role="alert">
            {fieldErrors.to}
          </p>
        )}

        {/* THE CC FIELD - directly under To, the same pattern, rendered even when it
            is locked so the reader can see that it is part of the locked set. */}
        {(cc.length > 0 || !lockRecipients) && (
          <>
            <div className="flex min-h-[56px] w-full items-center px-4">
              {lockRecipients ? (
                <span className="w-16 shrink-0 text-sm font-semibold text-outline">Cc</span>
              ) : (
                <label className="w-16 shrink-0 text-sm font-semibold text-outline" htmlFor="cc">
                  Cc
                </label>
              )}
              <div className="flex flex-1 flex-wrap items-center gap-2 py-3">
                {cc.length === 0 && lockRecipients ? (
                  <span className="text-sm text-on-surface-variant">None</span>
                ) : null}
                {cc.map((recipient) => (
                  <span
                    key={recipient}
                    className="flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-sm"
                  >
                    <span title={recipient}>{nameByRecipient.get(recipient) || recipient}</span>
                    {!lockRecipients && (
                      <button
                        type="button"
                        aria-label={`Remove ${recipient} from Cc`}
                        className="min-h-0 leading-none text-on-surface-variant"
                        onClick={() => removeCc(recipient)}
                      >
                        x
                      </button>
                    )}
                  </span>
                ))}
                {!lockRecipients && (
                  <input
                    id="cc"
                    className="min-w-32 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-on-surface-variant"
                    inputMode="tel"
                    placeholder="Number or alias"
                    value={draftCc}
                    onChange={(event) => setDraftCc(event.target.value)}
                    onBlur={() => addCcFrom(draftCc)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addCcFrom(draftCc);
                      }
                    }}
                  />
                )}
                {!lockRecipients && (
                  <button
                    type="button"
                    aria-label="Add this Cc recipient"
                    title="Add this Cc recipient"
                    className="box-border flex min-h-0 aspect-square h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft p-0 leading-none text-accent disabled:opacity-40"
                    disabled={draftCc.trim().length === 0}
                    onClick={() => addCcFrom(draftCc)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {!lockRecipients && ccSuggestions.length > 0 && (
              <div className="flex flex-col border-b border-surface-variant" aria-label="Cc suggestions">
                {ccSuggestions.map((contact) => {
                  const name = contact.displayName?.trim() || contact.accountName?.trim() || contact.address;
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      className="flex min-h-[52px] items-center gap-3 px-4 text-left active:bg-surface-container-high/40"
                      onClick={() => addCcSuggestion(contact)}
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
          </>
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
        {/* ROUND 29: the forwarded attachments. They ride the server's copy - the
            bytes were never here - so removing one is just an omission. */}
        {isForward && forwardSourceIds.length > 0 && (
          <div className="mt-3 rounded-card border border-wa-line p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-chat-meta">
              Forwarded attachments
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {forwardFiles.map((file) => (
                <li key={file.id} className="flex items-center gap-3 rounded-card border border-wa-line px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{file.filename}</span>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-semibold text-chat-meta"
                    aria-label={`Remove forwarded file ${file.filename}`}
                    onClick={() =>
                      setForwardFiles((current) => current.filter((entry) => entry.id !== file.id))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ROUND 8: the chosen files live INSIDE the message body region, as cards -
            not as chips in the toolbar. They are part of the message being written,
            so they belong next to the words. */}
        <AttachmentDrafts
          files={files}
          phase={uploadPhase}
          progress={progress}
          disabled={busy}
          onRemove={(index) => {
            setAttachError(null);
            setUploadPhase("idle");
            setFiles((current) => current.filter((_, position) => position !== index));
          }}
          onRetry={() => void handleSend()}
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

        {attachError && (
          <p className="px-4 pb-1 text-sm text-wa-alert" role="alert">
            {attachError}
          </p>
        )}
        <input
          ref={documentInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,.csv,.xls,.xlsx,.ppt,.pptx,.zip"
          className="hidden"
          aria-label="Choose documents to attach"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          aria-label="Choose images to attach"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Take a photo to attach"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div className="flex h-14 w-full shrink-0 items-center justify-between border-t border-wa-line bg-surface-container-lowest px-4">
          <div className="flex items-center gap-2">
            {/* ROUND 8: three affordances, three intentions. Every one of them is a
                fixed-size circle WITH min-h-0, so the global 56px button floor cannot
                turn it into the oval it made of the single paperclip's predecessor. */}
            <button
              type="button"
              aria-label="Attach a document"
              title="Attach a document"
              className="flex min-h-0 h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => documentInputRef.current?.click()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3h7l4 4v14H7z" />
                <path d="M14 3v5h5M10 13h6M10 17h4" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Attach an image"
              title="Attach an image"
              className="flex min-h-0 h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => imageInputRef.current?.click()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="5" width="16" height="14" rx="2" />
                <path d="M4 16l4.5-4.5L13 16M14 13l2.5-2.5L20 14" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Take a photo"
              title="Take a photo"
              className="flex min-h-0 h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-container active:bg-surface-variant"
              onClick={() => cameraInputRef.current?.click()}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </button>
          </div>
          {/* The send action: fixed geometry, brand-filled like the thread's own message
              action, with an in-flight state that matches the cards' - while it flies
              the button is disabled and shows a spinner, and the cards show the
              percentage. */}
          <button
            type="submit"
            aria-label={busy ? "Sending" : isReply ? "Send reply" : "Send message"}
            aria-busy={busy}
            className="flex min-h-0 h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-card transition-transform duration-ui active:scale-95 disabled:opacity-70"
            disabled={busy}
          >
            {busy ? (
              <Spinner label="Sending" />
            ) : (
              /* ROUND 9: the arrow pointed LEFT - the apex was at x=4 - which read as
                 "receive" rather than "send". Mirrored: the apex is now at x=20, so it
                 points the way a send arrow should. (A plain comment, not a JSX one:
                 this sits inside a ternary's expression position.) */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12L4 4l6 8-6 8z" />
              </svg>
            )}
          </button>
        </div>

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
