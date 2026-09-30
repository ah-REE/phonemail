"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { useAuth } from "@/lib/useAuth";

/**
 * A folder list (Spam / Trash) - the spec's menu items, made real.
 *
 * Lists the signed-in user's messages in one folder and lets them move a message
 * back to the inbox. The move is one PATCH on the message's `folder`, the same
 * route that already carries the tags.
 *
 * ROUND 6: this screen used to carry its own pre-design-system header (a wa-teal
 * bar, a custom back glyph, a left-aligned title) and its own empty-state rhythm,
 * which is the drift the click-through photographed. It now uses the shared AppBar
 * - and therefore the one BackButton rule - and the same empty-state pattern as
 * every other screen.
 */

interface FolderMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  createdAt: string;
}

function when(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function FolderScreen({
  title,
  folder,
  emptyNote,
}: {
  title: string;
  folder: "spam" | "trash";
  emptyNote: string;
}) {
  const router = useRouter();
  const { status, token, authorizedFetch } = useAuth();

  const [messages, setMessages] = useState<FolderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/emails?folder=" + folder);
      if (response.status === 401) {
        router.replace("/onboarding");
        return;
      }
      if (!response.ok) {
        setError("Could not load this folder.");
        return;
      }
      const body = (await response.json()) as { emails?: FolderMessage[] };
      setMessages(body.emails ?? []);
      setError(null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, folder, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token, load]);

  async function move(id: string, to: "inbox" | "spam" | "trash") {
    setError(null);
    const response = await authorizedFetch("/api/emails/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: to }),
    });
    if (!response.ok) {
      setError("Could not move that message.");
      return;
    }
    await load();
  }

  /**
   * ROUND 29 follow-up 4: empty the trash - one POST for every message the
   * caller's trash holds; the server marks them deleted for the recipient
   * only, so the other side of any conversation keeps its copy.
   */
  async function emptyTrash() {
    setError(null);
    const response = await authorizedFetch("/api/emails/empty-trash", { method: "POST" });
    if (!response.ok) {
      setError("Could not empty the trash.");
      return;
    }
    await load();
  }

  return (
    <main className="flex flex-1 flex-col">
      <AppBar
        title={title}
        backHref="/"
        right={<span className="pr-3 text-sm text-on-primary/90">{messages.length}</span>}
      />

      {loading && <p className="p-4 text-wa-muted">Loading.</p>}

      {error && (
        <p className="p-4 text-wa-alert" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-7 text-center">
          <p className="text-lg font-semibold text-on-surface">Nothing in {title.toLowerCase()}</p>
          <p className="text-sm text-on-surface-variant">{emptyNote}</p>
        </div>
      )}

      {/* ROUND 29 follow-up 4 (the owner's request): the trash screen carries
          its own Empty trash - one POST, per-viewer removal, reload. */}
      {folder === "trash" && messages.length > 0 && (
        <div className="flex justify-end px-4 pt-3">
          <button type="button" className="btn-quiet" onClick={() => void emptyTrash()}>
            Empty trash
          </button>
        </div>
      )}

      <ul className="flex-1 overflow-y-auto">
        {messages.map((message) => (
          <li key={message.id} className="border-b border-wa-line p-4">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-lg font-semibold">{message.from}</span>
              <span className="ml-auto shrink-0 text-xs text-wa-muted">{when(message.createdAt)}</span>
            </div>
            <p className="truncate text-sm text-wa-muted">{message.subject}</p>
            <p className="mt-1 line-clamp-2 text-sm">{message.body}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => void move(message.id, "inbox")}
              >
                Move to inbox
              </button>
              {folder === "spam" ? (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => void move(message.id, "trash")}
                >
                  Move to trash
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => void move(message.id, "spam")}
                >
                  Move to spam
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
