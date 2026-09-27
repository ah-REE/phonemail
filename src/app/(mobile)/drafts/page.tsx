"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/app-bar";
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
      {/* ROUND 6: the shared AppBar, so this screen's header obeys the same rule as
          every other one (it used to carry its own wa-teal bar). */}
      <AppBar
        title="Drafts"
        backHref="/"
        right={<span className="pr-3 text-sm text-on-primary/90">{draft ? 1 : 0}</span>}
      />

      {!draft && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-7 text-center">
          <p className="text-lg font-semibold text-on-surface">No drafts</p>
          <p className="text-sm text-on-surface-variant">
            Start a message and leave it unfinished - it will be kept on this device.
          </p>
          <Link href="/compose" className="btn-brand mt-3">
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
                className="btn-brand"
              >
                Resume
              </Link>
              <button
                type="button"
                className="btn-quiet"
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
