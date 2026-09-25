"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChatListSkeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Chat list (mobile home).
 *
 * Data comes from GET /api/conversations. Each row opens the thread for that
 * counterpart. Realtime is Socket.io via the shared hook; when the socket is
 * unavailable the hook polls every 30s so the list still works.
 *
 * Visual refresh: the layout follows design/phonemail_home - 60px top bar with
 * the menu button, the wordmark and the account avatar; a pill search field; a
 * horizontally scrolling chip row; 76px conversation rows with a 48px avatar, a
 * time and an unread badge; the encryption footer; and the 48px circular compose
 * button pinned bottom-right.
 *
 * Two things the mockup predates and that therefore had to be placed WITHOUT
 * breaking its proportions: the live/polling indicator (moved down to the
 * encryption footer) and the search-to-chat offer, which renders as one more row
 * directly under the search field while a complete number is typed.
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
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary-container px-1.5 text-[11px] font-bold text-on-secondary-container">
      {count}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { status, token, user, authorizedFetch } = useAuth();

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

  // Never redirect while the phase is unknown - that is the refresh-race fix.
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
        <header className="flex h-[60px] shrink-0 items-center px-4">
          <span className="skeleton h-6 w-40 rounded-full" />
        </header>
        <ChatListSkeleton />
      </main>
    );
  }

  const chips: Array<{ key: typeof filter; label: string }> = [
    { key: "all", label: "All" },
    { key: "unread", label: unreadTotal > 0 ? `Unread (${unreadTotal})` : "Unread" },
    { key: "favorites", label: "Favorites" },
    { key: "attachments", label: "Attachments" },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <div className="relative flex w-full flex-1 flex-col">

        {/* 1. Top bar */}
        <header className="flex h-[60px] w-full shrink-0 select-none items-center justify-between px-4">
          <button
            type="button"
            aria-label="Open menu"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-opacity duration-ui active:opacity-75"
            onClick={() => setMenuOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="3" y="6" width="18" height="2" rx="1" />
              <rect x="3" y="11" width="18" height="2" rx="1" />
              <rect x="3" y="16" width="18" height="2" rx="1" />
            </svg>
          </button>

          <h1 className="font-headline text-[22px] font-bold leading-[28px] tracking-[-0.01em]">PhoneMail</h1>

          <Link
            href="/profile"
            aria-label="Profile and settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container font-headline text-base font-bold text-on-secondary-container"
          >
            {initialOf(user?.phoneNumber ?? "")}
          </Link>
        </header>

        {/* 2. Search */}
        <div className="w-full px-4 py-3">
          <div className="flex h-11 w-full items-center rounded-full bg-surface-container-high px-4">
            <span className="mr-3 shrink-0 text-outline" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
            </span>
            <input
              className="w-full bg-transparent p-0 text-sm text-on-surface outline-none placeholder:text-outline"
              placeholder="Search messages or a number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search messages"
            />
          </div>
        </div>

        {/* 3. Filter chips */}
        <div className="flex w-full gap-2 overflow-x-auto px-4 pb-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-ui ${
                filter === chip.key
                  ? "bg-wa-teal text-white"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Search-to-chat offer */}
        {searchNumber && (
          <div className="w-full px-4 pb-2">
            <Link
              href={`/thread/${searchNumber}`}
              className="flex h-[76px] w-full items-center border-b border-surface-container-high bg-surface-container-low px-4"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-base font-bold">Message {searchNumber}</span>
                <span className="mt-0.5 truncate text-sm text-on-surface-variant">
                  Start a conversation with this number
                </span>
              </span>
            </Link>
          </div>
        )}

        {loading && <ChatListSkeleton rows={4} />}
        {error && (
          <p className="px-4 text-wa-alert" role="alert">
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
            <p className="text-sm text-on-surface-variant">
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

        {/* 4. Conversation rows */}
        <div className="flex w-full flex-col pb-28">
          {visibleGroups.map((group) => (
            <Link
              key={group.threadKey}
              href={`/thread/group/${encodeURIComponent(group.threadKey)}`}
              className="flex h-[76px] w-full cursor-pointer items-center border-b border-surface-container-high px-4 active:bg-surface-container-high/40"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container font-headline text-base font-bold text-on-primary">
                {group.members.length}
              </span>
              <span className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-base font-bold">Group - {group.members.join(", ")}</span>
                <span className="mt-0.5 truncate text-sm text-on-surface-variant">{group.subject}</span>
                <span className="truncate text-sm text-on-surface-variant">{group.preview}</span>
              </span>
              <span className="ml-2 flex shrink-0 flex-col items-end justify-center">
                <span className="text-xs text-outline">{formatTime(group.lastAt)}</span>
                <UnreadBadge count={group.unread} />
              </span>
            </Link>
          ))}

          {visible.map((thread) => (
            <Link
              key={thread.counterpartAddress}
              href={`/thread/${thread.counterpart}`}
              className="flex h-[76px] w-full cursor-pointer items-center border-b border-surface-container-high px-4 active:bg-surface-container-high/40"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-container font-headline text-base font-bold text-on-primary">
                {initialOf(thread.counterpart)}
              </span>
              <span className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-base font-bold">{thread.counterpart}</span>
                <span className="mt-0.5 truncate text-sm text-on-surface-variant">{thread.subject}</span>
                <span className="truncate text-sm text-on-surface-variant">{thread.preview}</span>
              </span>
              <span className="ml-2 flex shrink-0 flex-col items-end justify-center">
                <span className="text-xs text-outline">{formatTime(thread.lastAt)}</span>
                <UnreadBadge count={thread.unread} />
              </span>
            </Link>
          ))}

          <div className="flex w-full select-none items-center justify-center gap-1.5 px-6 py-8 text-xs text-outline">
            <span className="shrink-0" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="5" y="10.5" width="14" height="9" rx="2" />
                <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
              </svg>
            </span>
            <span>Your personal emails are end-to-end encrypted</span>
            <span aria-hidden="true">·</span>
            <span title="connection">
              {realtimeStatus === "socket" ? "live" : realtimeStatus === "polling" ? "polling" : "connecting"}
            </span>
          </div>
        </div>

        {/* 5. Floating compose button */}
        <div className="fixed bottom-6 right-6 z-10">
          <Link
            href="/compose"
            aria-label="Compose email"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container transition-opacity duration-ui active:opacity-90"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z" />
              <path d="M13.5 6.5l4 4" />
            </svg>
          </Link>
        </div>

        {menuOpen && (
          <div className="fixed inset-0 z-20 flex bg-black/40" role="dialog" aria-modal="true">
                      <nav className="flex w-4/5 max-w-xs flex-col bg-surface">
              <div className="flex flex-col bg-primary-container px-5 pb-6 pt-5 text-on-primary">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container font-headline text-xl font-bold text-on-secondary-container">
                  {initialOf(user?.phoneNumber ?? "")}
                </span>
                <p className="mt-3 text-lg font-bold">{user?.phoneNumber ?? ""}</p>
                <p className="truncate text-xs opacity-80">{user?.phoneNumber ?? ""}@phonemail.com</p>
              </div>

              <Link
                href="/"
                className="flex min-h-[60px] items-center gap-5 bg-surface-container-low px-5 text-base text-on-surface"
                onClick={() => setMenuOpen(false)}
              >
                <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20H4z" /></svg></span>
                <span>Home</span>
              </Link>
              <Link
                href="/drafts"
                className="flex min-h-[60px] items-center gap-5 px-5 text-base text-on-surface"
                onClick={() => setMenuOpen(false)}
              >
                <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></svg></span>
                <span>Drafts</span>
              </Link>
              <Link
                href="/spam"
                className="flex min-h-[60px] items-center gap-5 px-5 text-base text-on-surface"
                onClick={() => setMenuOpen(false)}
              >
                <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v6c0 4-3.4 6.8-8 8-4.6-1.2-8-4-8-8V7z" /></svg></span>
                <span>Spam</span>
              </Link>
              <Link
                href="/trash"
                className="flex min-h-[60px] items-center gap-5 px-5 text-base text-on-surface"
                onClick={() => setMenuOpen(false)}
              >
                <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg></span>
                <span>Trash</span>
              </Link>

              <div className="mt-auto">
                <div className="h-[1px] w-full bg-surface-variant" />
                <Link
                  href="/profile"
                  className="flex min-h-[60px] items-center gap-5 px-5 text-base text-on-surface"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg></span>
                  <span>Settings</span>
                </Link>
                <Link
                  href="/desktop"
                  className="flex min-h-[60px] items-center gap-5 px-5 text-base text-on-surface"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="shrink-0 text-primary-container"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20H4z" /></svg></span>
                  <span>Desktop version</span>
                </Link>
                <button
                  type="button"
                  className="btn-quiet m-4 w-[calc(100%-2rem)]"
                  onClick={() => setMenuOpen(false)}
                >
                  Close
                </button>
              </div>
            </nav>
            <button type="button" aria-label="Close menu" className="flex-1" onClick={() => setMenuOpen(false)} />
          </div>
        )}
      </div>
    </main>
  );
}
