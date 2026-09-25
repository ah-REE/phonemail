"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { clearDraft, readDraft, type LocalDraft } from "@/lib/folders";

/**
 * Drafts - the one menu item that reads nothing from the server.
 *
 * An unsent compose has no recipient yet, and an Email row needs both users, so
 * a draft cannot be a row: it is kept in this browser's local storage instead.
 * The compose screen saves it as you type and clears it when the message is
 * actually handed to the mail service. See lib/folders.ts for the reasoning.
 */

export default function DraftsPage() {
  const [draft, setDraft] = useState<LocalDraft | null>(null);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  function discard() {
    clearDraft();
    setDraft(null);
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-wa-line bg-wa-teal px-4 py-3 text-white">
        <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back to the chat list">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold">Drafts</h1>
        <span className="ml-auto text-sm opacity-90">{draft ? 1 : 0}</span>
      </header>

      {!draft && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-lg font-semibold">No drafts</p>
          <p className="text-sm text-wa-muted">
            Start a message and leave it unfinished - it will be kept on this device.
          </p>
          <Link href="/compose" className="btn-primary mt-3">
            Write a message
          </Link>
        </div>
      )}

      {draft && (
        <ul className="flex-1 overflow-y-auto">
          <li className="border-b border-wa-line p-4">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-lg font-semibold">
                {draft.to ? draft.to : "No recipient yet"}
              </span>
              <span className="ml-auto shrink-0 text-xs text-wa-muted">
                {draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "unsaved time"}
              </span>
            </div>
            <p className="truncate text-sm text-wa-muted">{draft.subject || "(no subject)"}</p>
            <p className="mt-1 text-sm">{draft.body}</p>
            <div className="mt-2 flex gap-2">
              <Link
                href={"/compose?draft=1" + (draft.to ? "&to=" + encodeURIComponent(draft.to) : "")}
                className="min-h-tap rounded-full bg-wa-green px-4 text-sm font-semibold text-on-surface"
              >
                Resume
              </Link>
              <button
                type="button"
                className="min-h-tap rounded-full border border-wa-outline px-4 text-sm text-wa-muted"
                onClick={discard}
              >
                Discard
              </button>
            </div>
            <p className="mt-2 text-xs text-wa-muted">
              Kept in this browser only - it never reaches the server.
            </p>
          </li>
        </ul>
      )}
    </main>
  );
}
