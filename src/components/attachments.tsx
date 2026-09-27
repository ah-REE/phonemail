"use client";

import { useState } from "react";

import { attachmentKind, formatBytes } from "@/lib/attachments";
import { useAuth } from "@/lib/useAuth";

/**
 * Attachments, in the two places they appear.
 *
 * `AttachmentCards` is what a message shows: one card per file, inside the bubble's
 * documented attachment slot. `AttachmentChips` is what the compose screen shows
 * while you are choosing: the file, its size, and a way to take it off again.
 *
 * THE DOWNLOAD IS A FETCH, NOT A LINK. The session's JWT lives in sessionStorage
 * and travels in an Authorization header, so a plain `<a href>` to the attachment
 * route would arrive unauthenticated. The card therefore fetches the bytes with the
 * same authorized call everything else uses, hands them to the browser as a blob,
 * and lets the browser save it under its real name - which keeps the token out of
 * URLs, history and logs.
 */

export interface AttachmentRef {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

function KindIcon({ kind }: { kind: ReturnType<typeof attachmentKind> }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "image" ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" {...stroke} />
          <path d="M4 16l4.5-4.5L13 16M14 13l2.5-2.5L20 14" {...stroke} />
        </>
      ) : kind === "pdf" ? (
        <>
          <path d="M7 3h7l4 4v14H7z" {...stroke} />
          <path d="M14 3v5h5" {...stroke} />
          <path d="M9.5 17v-5h1.7a1.5 1.5 0 0 1 0 3H9.5M14 12h1a1.6 1.6 0 0 1 1.6 1.6v1.8A1.6 1.6 0 0 1 15 17h-1z" {...stroke} />
        </>
      ) : kind === "text" ? (
        <>
          <path d="M7 3h7l4 4v14H7z" {...stroke} />
          <path d="M14 3v5h5M10 13h6M10 17h4" {...stroke} />
        </>
      ) : (
        <>
          <path d="M7 3h7l4 4v14H7z" {...stroke} />
          <path d="M14 3v5h5" {...stroke} />
        </>
      )}
    </svg>
  );
}

export function AttachmentCards({ attachments }: { attachments?: AttachmentRef[] | null }) {
  const { authorizedFetch } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  async function download(file: AttachmentRef) {
    setBusyId(file.id);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/attachments/${file.id}`);
      if (!response.ok) {
        setError(response.status === 403 ? "Not your message." : "Could not download that file.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {attachments.map((file) => (
        <button
          key={file.id}
          type="button"
          onClick={() => void download(file)}
          aria-label={`Download ${file.filename}`}
          className="flex min-h-0 w-full items-center gap-2.5 rounded-xl border border-black/[0.06] bg-black/[0.02] px-2.5 py-2 text-left transition-transform duration-ui active:scale-[0.99]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-msg-accent">
            <KindIcon kind={attachmentKind(file.contentType)} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-on-surface">
              {file.filename}
            </span>
            <span className="text-[11.5px] text-chat-meta">
              {formatBytes(file.sizeBytes)} &middot; {busyId === file.id ? "Downloading" : "Tap to download"}
            </span>
          </span>
          <span className="shrink-0 text-chat-meta" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />
            </svg>
          </span>
        </button>
      ))}
      {error && (
        <p className="text-[11.5px] text-wa-alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The files chosen but not yet sent, as removable chips. */
export function AttachmentChips({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-1" aria-label="Files to attach">
      {files.map((file, index) => (
        <span
          key={`${file.name}-${index}`}
          className="flex max-w-full items-center gap-2 rounded-full bg-surface-container px-3 py-1 text-sm"
        >
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 text-xs text-on-surface-variant">{formatBytes(file.size)}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={() => onRemove(index)}
            className="min-h-0 leading-none text-on-surface-variant disabled:opacity-50"
          >
            x
          </button>
        </span>
      ))}
    </div>
  );
}

export default AttachmentCards;
