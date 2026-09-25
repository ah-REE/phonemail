"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * A folder list (Spam / Trash) - the spec's menu items, made real.
 *
 * Lists the signed-in user's messages in one folder and lets them move a message
 * back to the inbox. The move is one PATCH on the message's `folder`, the same
 * route that already carries the tags.
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

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-wa-line bg-wa-teal px-4 py-3 text-white">
        <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back to the chat list">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold">{title}</h1>
        <span className="ml-auto text-sm opacity-90">{messages.length}</span>
      </header>

      {loading && <p className="p-4 text-wa-muted">Loading.</p>}

      {error && (
        <p className="p-4 text-wa-alert" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && messages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-lg font-semibold">Nothing in {title.toLowerCase()}</p>
          <p className="text-sm text-wa-muted">{emptyNote}</p>
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
                className="min-h-tap rounded-full border border-wa-outline px-4 text-sm font-semibold text-primary-container"
                onClick={() => void move(message.id, "inbox")}
              >
                Move to inbox
              </button>
              {folder === "spam" ? (
                <button
                  type="button"
                  className="min-h-tap rounded-full border border-wa-outline px-4 text-sm text-wa-muted"
                  onClick={() => void move(message.id, "trash")}
                >
                  Move to trash
                </button>
              ) : (
                <button
                  type="button"
                  className="min-h-tap rounded-full border border-wa-outline px-4 text-sm text-wa-muted"
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
