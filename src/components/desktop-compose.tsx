"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AttachmentDrafts, type DraftPhase } from "@/components/attachments";
import {
  clearDraft as clearDraftEverywhere,
  DRAFT_SAVE_DEBOUNCE_MS,
  debounce,
  loadDraft,
  saveDraft as saveDraftEverywhere,
} from "@/lib/draftSync";
import { formatBytes, validateAttachmentSet } from "@/lib/attachments";
import { invalidRecipients, parseRecipients, RECIPIENT_FORMAT_MESSAGE } from "@/lib/recipients";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { useAuth } from "@/lib/useAuth";

/**
 * THE DESKTOP COMPOSER (round 13).
 *
 * A Gmail-style compose card: an overlay with a header, To, Cc, Subject, the
 * body, the three attachment affordances and Send. It exists because the desktop
 * client was opening the PHONE's compose screen - a phone-shaped screen with a
 * phone-shaped header, rendered inside a laptop window - and because the reading
 * pane had been able to render a compose form as its own default state, which is
 * the state a mail client should never open in.
 *
 * Semantics are the phone's, exactly: the same endpoint (/api/emails), the same
 * multipart path when files are attached (so a 20MB upload reports real progress
 * through XMLHttpRequest instead of a spinner that says nothing), the same limits
 * from lib/attachments, the same reply linkage (replyToId plus the group's thread
 * key), and the same 409 meaning "you have already replied to that message".
 * Only the PRESENTATION is desktop, which is the whole point: what differs between
 * the two clients should be the chrome, never the behaviour.
 *
 * ROUND 28.5 (the Figma pass): the card wears the design's chrome - the dark
 * header band with its circled cancel, the labelled attachment controls, the
 * flat accent Send - and the To/Cc fields are CHIP fields: each finished
 * address is a chip with its remove control, the trailing text stays in the
 * input, and the send-time validation is unchanged (the same one shared rule,
 * the same message).
 *
 * Reply mode: the To and Cc fields are locked (the conversation decided them), the
 * original subject and the quoted opening are carried in, and the header says
 * "Reply" rather than "New message".
 */

export interface DesktopComposeRequest {
  /** Recipients, already canonical (a number or an alias local part). */
  to: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  /** The reply's quoted opening, shown under the body. */
  quoted?: string;
  replyToId?: string;
  /** The group thread a reply belongs to, so it lands in the GROUP conversation. */
  threadKey?: string;
  /** True for a reply: To and Cc are the conversation's, not the writer's, choice. */
  lockRecipients?: boolean;
  /** Where the Request came from, for the header's wording. */
  kind?: "new" | "reply" | "forward";
  /** ROUND 29: the row being forwarded; the server copies its files. */
  forwardOfId?: string;
  /** The source's attachments, shown as attached and removable before sending. */
  forwardAttachments?: { id: string; filename: string; sizeBytes: number }[];
}


export function DesktopCompose({
  request,
  onClose,
  onSent,
}: {
  request: DesktopComposeRequest;
  onClose: () => void;
  onSent?: (notice: string) => void;
}) {
  const { authorizedFetch, authorizedUpload } = useAuth();

  // ROUND 28.5: the design's chip fields - committed addresses and the input's
  // trailing text are kept apart, and the pair IS the field's value.
  const [toChips, setToChips] = useState<string[]>(() => parseRecipients(request.to.join(", ")));
  const [toDraft, setToDraft] = useState("");
  const [ccChips, setCcChips] = useState<string[]>(() => parseRecipients((request.cc ?? []).join(", ")));
  const [ccDraft, setCcDraft] = useState("");

  /**
   * ROUND 29 (forward): the source's attachments, held here so the writer can
   * see and remove them. Removing one only drops its id from the copy list the
   * send carries - the bytes never existed on this side.
   */
  const [forwardFiles, setForwardFiles] = useState(request.forwardAttachments ?? []);
  const forwardOmitted = (request.forwardAttachments ?? []).filter(
    (entry) => !forwardFiles.some((kept) => kept.id === entry.id),
  );
  const [subjectDraft, setSubjectDraft] = useState(request.subject ?? "");
  const [bodyDraft, setBodyDraft] = useState(request.body ?? "");

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<DraftPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  /** ROUND 31: the card exits on the reverse curve before it is unmounted. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** ROUND 44: which recipient field holds an invalid entry - red border + focus. */
  const [invalidFields, setInvalidFields] = useState<{ to: boolean; cc: boolean }>({ to: false, cc: false });

  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const locked = Boolean(request.lockRecipients);

  /**
   * ROUND 22: THE DRAFT, on the desktop too, through the same module the phone
   * uses - so the message abandoned in one client is waiting in the other. A reply
   * is never drafted (see lib/draftSync.ts).
   */
  const [draftRestored, setDraftRestored] = useState(locked);
  useEffect(() => {
    if (locked || draftRestored) {
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
        setToChips(parseRecipients(found.draft.to));
      }
      if (found.draft.cc) {
        setCcChips(parseRecipients(found.draft.cc));
      }
      if (found.draft.subject) {
        setSubjectDraft(found.draft.subject);
      }
      if (found.draft.body) {
        setBodyDraft(found.draft.body);
      }
      setDraftRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, draftRestored, authorizedFetch]);

  // What the draft saves and what the send reads: the chips plus whatever the
  // input still holds. One shape, so a half-typed address is never lost.
  const toDraftValue = [...toChips, ...parseRecipients(toDraft)].join(", ");
  const ccDraftValue = [...ccChips, ...parseRecipients(ccDraft)].join(", ");

  const saveDraftSoon = useMemo(
    () => debounce((payload: { to: string; cc: string; subject: string; body: string }) => {
      void saveDraftEverywhere(authorizedFetch, payload);
    }, DRAFT_SAVE_DEBOUNCE_MS),
    [authorizedFetch],
  );

  useEffect(() => {
    if (locked || !draftRestored) {
      return;
    }
    saveDraftSoon({ to: toDraftValue, cc: ccDraftValue, subject: subjectDraft, body: bodyDraft });
  }, [toDraftValue, ccDraftValue, subjectDraft, bodyDraft, locked, draftRestored, saveDraftSoon]);
  const recipients = [...new Set([...toChips, ...parseRecipients(toDraft)])];
  const cc = [...new Set([...ccChips, ...parseRecipients(ccDraft)])];

  /**
   * ROUND 31: every close walks through here - the card scales back out on the
   * reverse of its entrance (220ms) and only then tells its owner it is gone.
   */
  function beginClose() {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onClose(), prefersReducedMotion() ? 0 : MOTION.composeExit);
  }

  // Escape closes, the way every overlay in this app does.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        beginClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Same limits, same check as the phone: one rule, one place. */
  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) {
      return;
    }
    const next = [...files, ...Array.from(picked)];
    const problem = validateAttachmentSet(next.map((file) => ({ filename: file.name, sizeBytes: file.size })));
    setAttachError(problem);
    if (problem) {
      return;
    }
    setFiles(next);
    setPhase("idle");
  }

  /**
   * ROUND 28.5: a delimiter - comma or space - turns the finished fragments in
   * the input into chips; the trailing fragment stays in the input. The chip set
   * and the input text are the ONE value: send reads both, the draft saves both.
   */
  function commitRecipients(value: string, which: "to" | "cc") {
    const ends = /[,\s]$/.test(value);
    const parts = value.split(/[,\s]+/);
    const tail = ends ? "" : (parts.pop() ?? "");
    const incoming = parts.map((part) => part.trim()).filter((part) => part.length > 0);
    if (which === "to") {
      if (incoming.length > 0) {
        setToChips((current) => [...new Set([...current, ...incoming])]);
      }
      setToDraft(tail);
      setInvalidFields((current) => (current.to ? { ...current, to: false } : current));
    } else {
      if (incoming.length > 0) {
        setCcChips((current) => [...new Set([...current, ...incoming])]);
      }
      setCcDraft(tail);
      setInvalidFields((current) => (current.cc ? { ...current, cc: false } : current));
    }
  }

  /** Commit everything held in the input (Enter, or a send). */
  function commitAll(which: "to" | "cc") {
    commitRecipients((which === "to" ? toDraft : ccDraft) + " ", which);
  }

  /** Enter commits the entry (it must not submit the form mid-address);
      Backspace on an empty input takes the last chip back. */
  function onChipsKeyDown(event: React.KeyboardEvent<HTMLInputElement>, which: "to" | "cc") {
    if (event.key === "Enter") {
      event.preventDefault();
      commitAll(which);
      return;
    }
    if (event.key === "Backspace" && which === "to" && toDraft === "" && toChips.length > 0) {
      setToChips((current) => current.slice(0, -1));
    }
    if (event.key === "Backspace" && which === "cc" && ccDraft === "" && ccChips.length > 0) {
      setCcChips((current) => current.slice(0, -1));
    }
  }

  function validate(): boolean {
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return false;
    }
    // ROUND 28: per-ADDRESS, not only per-field. The same rule and wording the
    // mobile composer uses, and the invalid entries are named so the sender
    // knows exactly what to fix - where the server's 400 could only speak in
    // tokens. (Format only: an unknown-but-well-formed recipient is still the
    // server's 404 to report.)
    // ROUND 44: the refusal now points at the field - the border turns alert
    // red and the cursor lands where the fix is. (The owner typed "f" into Cc,
    // met "Check: f" at the bottom, and nothing on screen said WHERE.)
    const invalidTo = invalidRecipients(recipients);
    const invalidCc = invalidRecipients(cc);
    if (invalidTo.length + invalidCc.length > 0) {
      setInvalidFields({ to: invalidTo.length > 0, cc: invalidCc.length > 0 });
      setError(`${RECIPIENT_FORMAT_MESSAGE} Check: ${[...invalidTo, ...invalidCc].join(", ")}`);
      window.setTimeout(() => {
        document.getElementById(invalidTo.length > 0 ? "compose-to" : "compose-cc")?.focus();
      }, 0);
      return false;
    }
    setInvalidFields({ to: false, cc: false });
    if (!subjectDraft.trim()) {
      setError("A subject is required.");
      return false;
    }
    if (!bodyDraft.trim()) {
      setError("Write a message first.");
      return false;
    }
    setError(null);
    return true;
  }

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || !validate()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      interface SendResponse {
        error?: string;
        to?: string | string[];
      }
      let status = 0;
      let payload: SendResponse = {};

      if (files.length > 0) {
        setPhase("uploading");
        setProgress(0);
        const form = new FormData();
        recipients.forEach((recipient) => form.append("to", recipient));
        cc.forEach((recipient) => form.append("cc", recipient));
        form.append("subject", subjectDraft.trim());
        form.append("body", bodyDraft);
        if (request.replyToId) form.append("replyToId", request.replyToId);
        if (request.threadKey) form.append("threadKey", request.threadKey);
        if (request.forwardOfId) form.append("forwardOfId", request.forwardOfId);
        forwardOmitted.forEach((entry) => form.append("forwardOmitAttachmentIds", entry.id));
        files.forEach((file) => form.append("attachments", file));
        const result = await authorizedUpload("/api/emails", form, setProgress);
        status = result.status;
        payload = (result.body ?? {}) as SendResponse;
      } else {
        const response = await authorizedFetch("/api/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipients,
            cc,
            subject: subjectDraft.trim(),
            body: bodyDraft,
            ...(request.replyToId ? { replyToId: request.replyToId } : {}),
            ...(request.threadKey ? { threadKey: request.threadKey } : {}),
            ...(request.forwardOfId
              ? {
                  forwardOfId: request.forwardOfId,
                  ...(forwardOmitted.length > 0
                    ? { forwardOmitAttachmentIds: forwardOmitted.map((entry) => entry.id) }
                    : {}),
                }
              : {}),
          }),
        });
        status = response.status;
        payload = (await response.json().catch(() => ({}))) as SendResponse;
      }

      if (status < 200 || status >= 300) {
        // A failed flight leaves the files where they are, in an error state with
        // a retry - exactly as the phone does.
        if (files.length > 0) {
          setPhase("failed");
        }
        setError(status === 409 ? "You have already replied to that message." : payload.error ?? "Could not send the message.");
        return;
      }

      // The draft has done its job the moment the send is accepted.
      void clearDraftEverywhere(authorizedFetch);
      const sentTo = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to ?? recipients.join(", ");
      // ROUND 32: outcomes only - the sender is never told about the machinery.
      onSent?.(`Sent to ${sentTo}.`);
      beginClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ROUND 15: the card renders SOLID. It was translucent because the class named a
  // token that does not exist (`bg-surface-default`), so the card had no background
  // at all and the page showed through it. The card now wears the system's surface
  // token, over the system's dim scrim - the reference's treatment: a solid card on
  // a dimmed page.
  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-on-surface/45 p-4 sm:items-center sm:p-8 ${closing ? "overlay-exit" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={locked ? "Reply" : "New message"}
    >
      <form
        className={`compose-card-enter ${closing ? "compose-card-exit" : ""} flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-neutral-hair bg-surface shadow-overlay`}
        onSubmit={send}
      >
        {/* ROUND 28.5: the design's dark header band - the title in white and the
            circled cancel, on the same ink the rail wears. */}
        <div className="flex items-center gap-3 bg-on-surface px-5 py-3 text-white">
          <h2 className="font-headline text-base font-bold">
            {locked ? "Reply" : request.kind === "forward" ? "Forward" : "New message"}
          </h2>
          <button
            type="button"
            className="press ml-auto inline-flex min-h-0 items-center gap-1.5 text-sm font-medium text-rail-muted transition-colors duration-ui hover:text-white disabled:opacity-50"
            onClick={beginClose}
            disabled={busy}
          >
            Cancel
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6M15 9l-6 6" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-to">
            To
          </label>
          <div className={`mt-1 flex flex-wrap items-center gap-2 rounded-md border bg-surface px-3 py-2 transition-colors duration-ui ${invalidFields.to ? "border-wa-alert focus-within:border-wa-alert" : "border-neutral-hair focus-within:border-accent"} ${locked ? "bg-paper" : ""}`}>
            {toChips.map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-hair bg-paper px-2.5 py-1 text-xs font-medium text-on-surface">
                <span className="max-w-[220px] truncate">{chip}</span>
                {!locked && (
                  <button
                    type="button"
                    aria-label={`Remove ${chip} from To`}
                    className="text-neutral-muted transition-colors duration-ui hover:text-on-surface"
                    onClick={() => {
                      setToChips((current) => current.filter((entry) => entry !== chip));
                      setInvalidFields((current) => (current.to ? { ...current, to: false } : current));
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
            <input
              id="compose-to"
              className="min-w-[140px] flex-1 border-none bg-transparent text-base text-on-surface outline-none placeholder:text-outline"
              placeholder={toChips.length === 0 ? "Number or alias - separate with commas" : ""}
              value={toDraft}
              onChange={(event) => commitRecipients(event.target.value, "to")}
              onKeyDown={(event) => onChipsKeyDown(event, "to")}
              readOnly={locked}
              aria-readonly={locked}
              aria-invalid={invalidFields.to}
            />
          </div>
          {locked && (
            <p className="mt-1 text-xs text-on-surface-variant">
              Recipients are locked for this conversation - To and Cc both.
            </p>
          )}

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-cc">
            Cc
          </label>
          <div className={`mt-1 flex flex-wrap items-center gap-2 rounded-md border bg-surface px-3 py-2 transition-colors duration-ui ${invalidFields.cc ? "border-wa-alert focus-within:border-wa-alert" : "border-neutral-hair focus-within:border-accent"} ${locked ? "bg-paper" : ""}`}>
            {ccChips.map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-hair bg-paper px-2.5 py-1 text-xs font-medium text-on-surface">
                <span className="max-w-[220px] truncate">{chip}</span>
                {!locked && (
                  <button
                    type="button"
                    aria-label={`Remove ${chip} from Cc`}
                    className="text-neutral-muted transition-colors duration-ui hover:text-on-surface"
                    onClick={() => {
                      setCcChips((current) => current.filter((entry) => entry !== chip));
                      setInvalidFields((current) => (current.cc ? { ...current, cc: false } : current));
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </span>
            ))}
            <input
              id="compose-cc"
              className="min-w-[140px] flex-1 border-none bg-transparent text-base text-on-surface outline-none placeholder:text-outline"
              placeholder={ccChips.length === 0 ? "Optional - separate with commas" : ""}
              value={ccDraft}
              onChange={(event) => commitRecipients(event.target.value, "cc")}
              onKeyDown={(event) => onChipsKeyDown(event, "cc")}
              readOnly={locked}
              aria-readonly={locked}
              aria-invalid={invalidFields.cc}
            />
          </div>

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-subject">
            Subject
          </label>
          <input
            id="compose-subject"
            className="mt-1 w-full rounded-md border border-neutral-hair bg-surface px-3 py-2.5 text-base text-on-surface outline-none transition-colors duration-ui placeholder:text-outline focus:border-accent"
            placeholder="Subject"
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
          />

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-body">
            Message
          </label>
          <textarea
            id="compose-body"
            className="mt-1 min-h-40 w-full rounded-md border border-neutral-hair bg-surface px-3 py-3 text-base text-on-surface outline-none transition-colors duration-ui placeholder:text-outline focus:border-accent"
            placeholder="Type your message details here. Use the attachment controls below to add assets."
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value)}
          />

          {request.quoted && (
            <p className="mt-3 border-l-2 border-outline-variant pl-3 text-sm text-on-surface-variant">
              Replying to: {request.quoted}
            </p>
          )}

          {/* ROUND 29: the forwarded attachments. They ride the server's copy - the
              bytes were never here - so removing one is just an omission. */}
          {request.kind === "forward" && (request.forwardAttachments?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-md border border-neutral-hair bg-paper p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Forwarded attachments
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {forwardFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-3 rounded-md border border-neutral-hair bg-surface px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{file.filename}</span>
                    <span className="shrink-0 text-xs text-neutral-muted">{formatBytes(file.sizeBytes)}</span>
                    <button
                      type="button"
                      className="shrink-0 text-neutral-muted transition-colors duration-ui hover:text-on-surface"
                      aria-label={`Remove forwarded file ${file.filename}`}
                      onClick={() =>
                        setForwardFiles((current) => current.filter((entry) => entry.id !== file.id))
                      }
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
              {forwardOmitted.length > 0 && (
                <p className="mt-2 text-xs text-neutral-muted">
                  {forwardOmitted.length} forwarded {forwardOmitted.length === 1 ? "file is" : "files are"} not
                  attached any more - {forwardOmitted.length === 1 ? "it" : "they"} will not be sent.
                </p>
              )}
            </div>
          )}

          {/* The file cards with their upload states, the same component the phone
              composer uses. */}
          <AttachmentDrafts
            files={files}
            phase={phase}
            progress={progress}
            onRemove={(index) => setFiles((current) => current.filter((_, at) => at !== index))}
            onRetry={() => void send()}
            disabled={busy}
          />
          {attachError && (
            <p className="mt-2 text-sm text-wa-alert" role="alert">
              {attachError}
            </p>
          )}
          {error && (
            <p className="mt-2 text-sm text-wa-alert" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer: the three affordances and Send - the phone's three intentions,
            drawn for a mouse, in the design's labelled outline style. */}
        <div className="flex items-center gap-2 border-t border-neutral-hair px-5 py-3">
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
          {[
            { ref: documentInputRef, text: "Document", label: "Attach documents", title: "Attach documents", path: "M8 3h5l5 5v13H6V3h2z" },
            { ref: imageInputRef, text: "Image", label: "Attach images", title: "Attach images", path: "M4 5h16v14H4zM4 15l5-4 4 3 3-3 4 4" },
            { ref: cameraInputRef, text: "Camera", label: "Take a photo", title: "Take a photo", path: "M4 7h3l2-2h6l2 2h3v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
          ].map((affordance) => (
            <button
              key={affordance.label}
              type="button"
              className="inline-flex min-h-0 shrink-0 items-center gap-2 rounded-md border border-neutral-hair bg-surface px-3 py-2 text-[13px] font-medium text-neutral-body transition-colors duration-ui hover:bg-paper disabled:opacity-50"
              onClick={() => affordance.ref.current?.click()}
              disabled={busy || files.length + forwardFiles.length >= 3}
              aria-label={affordance.label}
              title={affordance.title}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={affordance.path} />
              </svg>
              {affordance.text}
            </button>
          ))}

          <span className="ml-auto text-xs text-neutral-muted">
            {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"}` : "No files"}
          </span>
          <button
            type="submit"
            className="press inline-flex min-h-0 items-center gap-2 rounded-pill bg-accent px-6 py-2.5 text-sm font-semibold text-white transition-all duration-fast ease-out-quint hover:brightness-105 active:scale-[0.985] disabled:opacity-60"
            disabled={busy}
          >
            {busy ? (phase === "uploading" ? `Sending ${progress}%` : "Sending...") : "Send"}
            {!busy && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l16-7-6 16-2.2-6.6L4 12z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
