"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { clearDraft as clearDraftEverywhere, loadDraft, type DraftPayload } from "@/lib/draftSync";
import { useAuth } from "@/lib/useAuth";

/**
 * Drafts - the one menu item that reads nothing from the server.
 *
 * An unsent compose has no recipient yet, and an Email row needs both users, so
 * a draft cannot be a row: it is kept in this browser's local storage instead.
 * The compose screen saves it as you type and clears it when the message is
 * actually handed to the mail service. See lib/folders.ts for the reasoning.
 */

export default function DraftsPage() {
  const { authorizedFetch, status } = useAuth();
  const [draft, setDraft] = useState<DraftPayload | null>(null);

  // ROUND 22: the draft now lives on the account as well, so this screen reads it
  // from there (falling back to the device's copy when the server is away) - which
  // is what makes a draft abandoned on the desktop appear here on the phone.
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const found = await loadDraft(authorizedFetch);
      if (!cancelled) {
        setDraft(found?.draft ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, authorizedFetch]);

  function discard() {
    void clearDraftEverywhere(authorizedFetch);
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
            Start a message and leave it unfinished - it will be waiting for you here and in Compose.
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
                {[draft.to, draft.cc, draft.subject, draft.body].filter((value) => value.trim()).length > 0
                  ? "draft"
                  : "empty"}
              </span>
            </div>
            <p className="truncate text-sm text-wa-muted">{draft.subject || "(no subject)"}</p>
            <p className="mt-1 text-sm">{draft.body}</p>
            <div className="mt-2 flex gap-2">
              <Link href="/compose?draft=1" className="btn-brand">
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
              Kept on your account and on this device, so it survives a reload, an
              offline spell, and picking the message up on another client.
            </p>
          </li>
        </ul>
      )}
    </main>
  );
}
