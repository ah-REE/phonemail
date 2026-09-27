"use client";

import { useEffect, useRef, useState } from "react";

import { AttachmentDrafts, type DraftPhase } from "@/components/attachments";
import { validateAttachmentSet } from "@/lib/attachments";
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
  kind?: "new" | "reply";
}

/** A comma- or space-separated field into the list of recipients it means. */
export function parseRecipientList(value: string): string[] {
  return [...new Set(value.split(/[,\s]+/).map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
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

  const [toDraft, setToDraft] = useState(request.to.join(", "));
  const [ccDraft, setCcDraft] = useState((request.cc ?? []).join(", "));
  const [subjectDraft, setSubjectDraft] = useState(request.subject ?? "");
  const [bodyDraft, setBodyDraft] = useState(request.body ?? "");

  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<DraftPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const locked = Boolean(request.lockRecipients);
  const recipients = parseRecipientList(toDraft);
  const cc = parseRecipientList(ccDraft);

  // Escape closes, the way every overlay in this app does.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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

  function validate(): boolean {
    if (recipients.length === 0) {
      setError("Add at least one recipient.");
      return false;
    }
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

      const sentTo = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to ?? recipients.join(", ");
      onSent?.(`Handed to the mail service for ${sentTo}.`);
      onClose();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={locked ? "Reply" : "New message"}
    >
      <form
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-card border border-outline-variant bg-surface-default shadow-overlay"
        onSubmit={send}
      >
        {/* Header: the title and the Cancel action, the way the phone composer's
            app bar carries them. */}
        <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-3">
          <h2 className="font-headline text-base font-bold text-on-surface">
            {locked ? "Reply" : "New message"}
          </h2>
          <button
            type="button"
            className="btn-quiet ml-auto min-h-0 px-4 py-1.5 text-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-to">
            To
          </label>
          <input
            id="compose-to"
            className="field mt-1"
            placeholder="Number or alias"
            value={toDraft}
            onChange={(event) => setToDraft(event.target.value)}
            readOnly={locked}
            aria-readonly={locked}
          />
          {locked && (
            <p className="mt-1 text-xs text-on-surface-variant">
              Recipients are locked for this conversation - To and Cc both.
            </p>
          )}

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-cc">
            Cc
          </label>
          <input
            id="compose-cc"
            className="field mt-1"
            placeholder="Optional"
            value={ccDraft}
            onChange={(event) => setCcDraft(event.target.value)}
            readOnly={locked}
            aria-readonly={locked}
          />

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-subject">
            Subject
          </label>
          <input
            id="compose-subject"
            className="field mt-1"
            placeholder="Subject"
            value={subjectDraft}
            onChange={(event) => setSubjectDraft(event.target.value)}
          />

          <label className="mt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant" htmlFor="compose-body">
            Message
          </label>
          <textarea
            id="compose-body"
            className="field mt-1 min-h-40 py-3"
            placeholder="Write your message"
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value)}
          />

          {request.quoted && (
            <p className="mt-3 border-l-2 border-outline-variant pl-3 text-sm text-on-surface-variant">
              Replying to: {request.quoted}
            </p>
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
            drawn for a mouse. */}
        <div className="flex items-center gap-2 border-t border-outline-variant px-5 py-3">
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
            { ref: documentInputRef, label: "Attach documents", title: "Attach documents", path: "M8 3h5l5 5v13H6V3h2z" },
            { ref: imageInputRef, label: "Attach images", title: "Attach images", path: "M4 5h16v14H4zM4 15l5-4 4 3 3-3 4 4" },
            { ref: cameraInputRef, label: "Take a photo", title: "Take a photo", path: "M4 7h3l2-2h6l2 2h3v12H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" },
          ].map((affordance) => (
            <button
              key={affordance.label}
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors duration-ui hover:bg-surface-container-low disabled:opacity-50"
              onClick={() => affordance.ref.current?.click()}
              disabled={busy || files.length >= 3}
              aria-label={affordance.label}
              title={affordance.title}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={affordance.path} />
              </svg>
            </button>
          ))}

          <span className="ml-auto text-xs text-on-surface-variant">
            {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"}` : "No files"}
          </span>
          <button type="submit" className="btn-brand min-h-0 px-6 py-2" disabled={busy}>
            {busy ? (phase === "uploading" ? `Sending ${progress}%` : "Sending...") : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
