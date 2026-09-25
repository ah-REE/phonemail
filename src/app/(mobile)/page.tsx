"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChatListSkeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * WhatsApp-style chat list (mobile home).
 *
 * Data comes from GET /api/conversations. Each row opens the thread for that
 * counterpart. Realtime is Socket.io via the shared hook; when the socket is
 * unavailable the hook polls every 30s so the list still works.
 */

interface ConversationThread {
  counterpart: string;
  counterpartAddress: string;
  subject: string;
  preview: string;
  lastAt: string;
  unread: number;
  favorite?: boolean;
  attachments?: number;
}

/** Day 6: a group conversation, keyed by its DERIVED thread key. */
interface ConversationGroup {
  threadKey: string;
  members: string[];
  memberAddresses: string[];
  subject: string;
  preview: string;
  lastAt: string;
  unread: number;
  favorite?: boolean;
  attachments?: number;
}

function initialOf(counterpart: string): string {
  return counterpart.slice(0, 1) || "?";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function HomePage() {
  const router = useRouter();
  const { status, token, authorizedFetch } = useAuth();

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [groupThreads, setGroupThreads] = useState<ConversationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "favorites" | "attachments">("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/conversations");
      if (response.status === 401) {
        router.replace("/onboarding");
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not load conversations.");
        return;
      }
      const body = (await response.json()) as {
        threads?: ConversationThread[];
        groupThreads?: ConversationGroup[];
      };
      setThreads(body.threads ?? []);
      setGroupThreads(body.groupThreads ?? []);
      setError(null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, router]);

  // Never redirect while the phase is unknown — that is the refresh-race fix.
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

  const realtimeStatus = useRealtime({
    token,
    onNewEmail: (payload) => {
      console.log("[home] new-email received, refetching conversations", payload);
      void load();
    },
    onFallbackPoll: () => {
      console.log("[home] polling for conversations");
      void load();
    },
  });

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (filter === "unread" && thread.unread === 0) {
        return false;
      }
      if (filter === "favorites" && !thread.favorite) {
        return false;
      }
      // No attachment backend exists in this build, so this filter is always
      // empty - that is the point of the chip: a friendly, honest empty state.
      if (filter === "attachments" && !thread.attachments) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        thread.counterpart.includes(needle) ||
        thread.counterpartAddress.toLowerCase().includes(needle) ||
        thread.subject.toLowerCase().includes(needle) ||
        thread.preview.toLowerCase().includes(needle)
      );
    });
  }, [threads, query, filter]);

  // Day 6: group threads answer the same search and filter question.
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groupThreads.filter((group) => {
      if (filter === "unread" && group.unread === 0) {
        return false;
      }
      if (filter === "favorites" && !group.favorite) {
        return false;
      }
      if (filter === "attachments" && !group.attachments) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        group.members.some((member) => member.includes(needle)) ||
        group.subject.toLowerCase().includes(needle) ||
        group.preview.toLowerCase().includes(needle)
      );
    });
  }, [groupThreads, query, filter]);

  const unreadTotal =
    threads.reduce((sum, thread) => sum + thread.unread, 0) +
    groupThreads.reduce((sum, group) => sum + group.unread, 0);

  // Search-to-chat: a COMPLETE 10-digit number in the search box is an
  // invitation to start a conversation with it. Partial or invalid input offers
  // nothing - a wrong offer is worse than no offer.
  const searchNumber = /^[6-9]\d{9}$/.test(query.trim()) ? query.trim() : null;

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col">
        <header className="bg-wa-teal px-4 py-3 text-white">
          <h1 className="text-xl font-semibold">PhoneMail</h1>
        </header>
        <ChatListSkeleton />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="bg-wa-teal text-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <h1 className="flex-1 text-xl font-semibold">PhoneMail</h1>
          <Link href="/profile" aria-label="Profile" className="min-h-tap min-w-tap text-2xl leading-none">
            ◎
          </Link>
        </div>
        <div className="px-4 pb-3">
          <input
            className="field bg-white text-wa-ink"
            placeholder="Search messages"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search messages"
          />
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-wa-line px-4 py-2">
        <button
          type="button"
          className={`min-h-tap rounded-full px-4 text-sm font-semibold ${filter === "all" ? "bg-wa-teal text-white" : "bg-wa-line text-wa-ink"}`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`min-h-tap rounded-full px-4 text-sm font-semibold ${filter === "unread" ? "bg-wa-teal text-white" : "bg-wa-line text-wa-ink"}`}
          onClick={() => setFilter("unread")}
        >
          Unread {unreadTotal > 0 ? `(${unreadTotal})` : ""}
        </button>
        <button
          type="button"
          className={`min-h-tap rounded-full px-4 text-sm font-semibold ${filter === "favorites" ? "bg-wa-teal text-white" : "bg-wa-line text-wa-ink"}`}
          onClick={() => setFilter("favorites")}
        >
          Favorites
        </button>
        <button
          type="button"
          className={`min-h-tap rounded-full px-4 text-sm font-semibold ${filter === "attachments" ? "bg-wa-teal text-white" : "bg-wa-line text-wa-ink"}`}
          onClick={() => setFilter("attachments")}
        >
          Attachments
        </button>
        <span className="ml-auto text-xs text-wa-muted">
          {realtimeStatus === "socket" ? "live" : realtimeStatus === "polling" ? "polling" : "connecting…"}
        </span>
        <button
          type="button"
          aria-label="Menu"
          className="min-h-tap min-w-tap text-xl leading-none"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
      </div>

      {searchNumber && (
        <Link
          href={`/thread/${searchNumber}`}
          className="row border-b border-wa-line bg-surface-container-low"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-teal text-xl font-semibold text-white">
            +
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">Message {searchNumber}</span>
            <span className="block truncate text-sm text-wa-muted">
              Start a conversation with this number
            </span>
          </span>
        </Link>
      )}

      {loading && <ChatListSkeleton rows={4} />}
      {error && (
        <p className="p-4 text-wa-alert" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && visible.length + visibleGroups.length === 0 && (
        <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <p className="text-lg font-semibold">
            {filter === "attachments"
              ? "No messages with attachments yet"
              : threads.length + groupThreads.length === 0
                ? "No messages yet"
                : "Nothing matches that search"}
          </p>
          <p className="text-sm text-wa-muted">
            {filter === "attachments"
              ? "Attachments are not supported yet - this is where they will appear."
              : filter === "favorites"
                ? "Open a message and use the tag button to mark it a favorite."
                : threads.length + groupThreads.length === 0
                  ? "Start a conversation and it will appear here."
                  : "Try a different name, subject or number."}
          </p>
          {threads.length + groupThreads.length === 0 && (
            <Link href="/compose" className="btn-primary">
              Write a message
            </Link>
          )}
        </div>
      )}

      {visibleGroups.length > 0 && (
        <ul className="border-b-2 border-wa-teal/30">
          {visibleGroups.map((group) => (
            <li key={group.threadKey} className="border-b border-wa-line">
              <Link href={`/thread/group/${encodeURIComponent(group.threadKey)}`} className="row">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-teal text-lg font-semibold text-white">
                  {group.members.length}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-lg font-semibold">
                      Group - {group.members.join(", ")}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-wa-muted">
                      {formatTime(group.lastAt)}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-wa-muted">{group.subject}</span>
                  <span className="block truncate text-sm text-wa-muted">{group.preview}</span>
                </span>
                {group.unread > 0 && (
                  <span className="ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-wa-green px-2 text-sm font-semibold text-white">
                    {group.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ul className="flex-1 overflow-y-auto">
        {visible.map((thread) => (
          <li key={thread.counterpartAddress} className="border-b border-wa-line">
            <Link href={`/thread/${thread.counterpart}`} className="row">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-teal text-xl font-semibold text-white">
                {initialOf(thread.counterpart)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-lg font-semibold">{thread.counterpart}</span>
                  <span className="ml-auto shrink-0 text-xs text-wa-muted">{formatTime(thread.lastAt)}</span>
                </span>
                <span className="block truncate text-sm text-wa-muted">{thread.subject}</span>
                <span className="block truncate text-sm text-wa-muted">{thread.preview}</span>
              </span>
              {thread.unread > 0 && (
                <span className="ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-wa-green px-2 text-sm font-semibold text-white">
                  {thread.unread}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/compose"
        aria-label="Compose"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-wa-green text-3xl text-white"
      >
        +
      </Link>

      {menuOpen && (
        <div className="fixed inset-0 z-10 flex bg-black/40" role="dialog" aria-modal="true">
          <nav className="w-3/4 max-w-xs bg-wa-panel p-4">
            <p className="mb-2 text-sm uppercase tracking-wide text-wa-muted">Menu</p>
            <Link href="/" className="block min-h-tap py-3 text-lg" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link href="/drafts" className="block min-h-tap py-3 text-lg" onClick={() => setMenuOpen(false)}>
              Drafts
            </Link>
            <Link href="/spam" className="block min-h-tap py-3 text-lg" onClick={() => setMenuOpen(false)}>
              Spam
            </Link>
            <Link href="/trash" className="block min-h-tap py-3 text-lg" onClick={() => setMenuOpen(false)}>
              Trash
            </Link>
            <Link href="/desktop" className="block min-h-tap py-3 text-lg" onClick={() => setMenuOpen(false)}>
              Desktop version
            </Link>
            <button type="button" className="btn-quiet mt-4 w-full" onClick={() => setMenuOpen(false)}>
              Close
            </button>
          </nav>
          <button type="button" aria-label="Close menu" className="flex-1" onClick={() => setMenuOpen(false)} />
        </div>
      )}
    </main>
  );
}
