"use client";

import { guardRedirect } from "@/lib/entry";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChatListSkeleton } from "@/components/skeleton";
import { Avatar } from "@/components/avatar";
import { BottomBar } from "@/components/bottom-bar";
import { Wordmark } from "@/components/wordmark";
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
 * breaking its proportions: the search-to-chat offer, which renders as one more row
 * directly under the search field while a complete number is typed.
 */

interface ConversationThread {
  counterpart: string;
  counterpartName?: string | null;
  counterpartAddress: string;
  subject: string;
  preview: string;
  /** The newest message is one this user sent, so the row reads "You: ...". */
  outgoing?: boolean;
  lastAt: string;
  unread: number;
  favorite?: boolean;
  attachments?: number;
}

/** Day 6: a group conversation, keyed by its DERIVED thread key. */
interface ConversationGroup {
  threadKey: string;
  members: string[];
  memberNames?: (string | null)[];
  memberAddresses: string[];
  subject: string;
  preview: string;
  outgoing?: boolean;
  lastAt: string;
  unread: number;
  favorite?: boolean;
  attachments?: number;
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
    <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
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

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/conversations");
      if (response.status === 401) {
        guardRedirect(router);
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
      guardRedirect(router);
    }
  }, [status, router]);

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token, load]);

  // A thread marks itself read while this list is still mounted behind it, and the
  // App Router keeps that tree alive - so the unread badges could sit there stale
  // until a hard reload. Refresh whenever the list is shown again.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("popstate", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("popstate", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  // The bottom bar's Favorites tab is this same list, filtered. The filter
  // arrives in the query string and is read straight off the location here:
  // useSearchParams would force a Suspense boundary around this screen, which
  // currently prerenders fine without one.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const wanted = new URLSearchParams(window.location.search).get("filter");
    if (wanted === "unread" || wanted === "favorites" || wanted === "attachments") {
      setFilter(wanted);
    }
  }, []);

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

  /**
   * ROUND 22: THE SERVER'S SEARCH, under the local filter above.
   *
   * The local filter can only answer from the rows already loaded and only from the
   * subject and preview the list carries. This asks the server for the rest: older
   * mail, and hits in the BODY. It is debounced, because a request per keystroke is
   * a request per keystroke, and it stands down entirely for a complete number,
   * whose meaning here is "start a conversation", not "search".
   */
  const [results, setResults] = useState<
    Array<{ kind: "pair" | "group"; key: string; label: string; subject: string; snippet: string; matches: number; href: string }>
  >([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3 || /^[6-9]\d{9}$/.test(needle)) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await authorizedFetch(`/api/search?q=${encodeURIComponent(needle)}`);
        const body = (await response.json().catch(() => null)) as { threads?: typeof results } | null;
        if (!cancelled) {
          setResults(body?.threads ?? []);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, authorizedFetch]);

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

  // What the reference's top-right badge counts.
  const totalUnread =
    threads.reduce((sum, thread) => sum + (thread.unread ?? 0), 0) +
    groupThreads.reduce((sum, group) => sum + (group.unread ?? 0), 0);

  return (
    <main className="flex flex-1 flex-col">
      {/* ROUND 9: the wide-screen handover moved to the route group's layout, so it
          also covers the screens that redirect a signed-out reader - see
          components/wide-screen-redirect.tsx. */}
      <div className="relative flex w-full flex-1 flex-col">

        {/* 1. Top bar */}
        <header className="flex h-[60px] w-full shrink-0 select-none items-center justify-between px-4">
          {/* The reference sets the wordmark left, with the second half in the brand
              gradient. ROUND 4: that treatment now lives in the shared Wordmark
              component - this screen is its origin, not a second copy of it - so
              the name cannot drift between screens. */}
          <Wordmark as="h1" size={22} />

          {/* The door into settings, and it is a PERSON mark - never a digit and
              never a badge. The count lived here once and read as somebody else's
              phone number; it is a badge on the conversation rows, where it belongs,
              and the owner asked for it gone from here entirely. */}
          <Link
            href="/profile"
            aria-label="Profile and settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <Avatar size={40} />
          </Link>
        </header>

        {/* 2. Search */}
        <div className="w-full px-4 py-3">
          <div className="flex h-12 w-full items-center rounded-full bg-surface-container px-4">
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
              className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition-colors duration-ui ${
                filter === chip.key
                  ? "bg-accent text-white"
                  : "bg-surface-container text-on-surface"
              }`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* ROUND 22: the server's results, under the local ones. A hit here is a
            THREAD (with how many of its messages matched and a snippet around the
            first), because one broadcast is one message however many people it
            reached. */}
        {query.trim().length >= 3 && !searchNumber && (
          <section className="flex w-full flex-col border-b border-surface-container-high" aria-label="Messages">
            <p className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {searching ? "Searching..." : `Messages (${results.length})`}
            </p>
            {results.map((result) => (
              <Link
                key={`${result.kind}:${result.key}`}
                href={result.href}
                className="flex min-h-[64px] w-full flex-col justify-center gap-0.5 border-b border-surface-container-high px-4 py-2 active:bg-surface-container-high/40"
              >
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-on-surface">
                    {result.kind === "group" ? `Group - ${result.label}` : result.label}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-on-surface-variant">
                    {result.matches} {result.matches === 1 ? "match" : "matches"}
                  </span>
                </span>
                <span className="truncate text-xs font-medium text-on-surface-variant">{result.subject}</span>
                <span className="truncate text-xs text-on-surface-variant">{result.snippet}</span>
              </Link>
            ))}
            {!searching && results.length === 0 && (
              <p className="px-4 py-3 text-sm text-on-surface-variant">
                No messages match &quot;{query.trim()}&quot;.
              </p>
            )}
          </section>
        )}

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
          /* ROUND 6: the one empty-state rule - gap-2 / px-6 / py-7, a semibold
             title in on-surface, a description in on-surface-variant, the system's
             primary button. Every screen's empty state now reads the same way. */
          <div className="flex flex-col items-center gap-2 px-6 py-7 text-center">
            <p className="text-lg font-semibold text-on-surface">
              {filter === "attachments"
                ? "No messages with attachments yet"
                : threads.length + groupThreads.length === 0
                  ? "No messages yet"
                  : "Nothing matches that search"}
            </p>
            <p className="text-sm text-on-surface-variant">
              {filter === "attachments"
                ? "Attach a file to a message and it will appear here."
                : filter === "favorites"
                  ? "Open a message and use the tag button to mark it a favorite."
                  : threads.length + groupThreads.length === 0
                    ? "Start a conversation and it will appear here."
                    : "Try a different name, subject or number."}
            </p>
            {threads.length + groupThreads.length === 0 && (
              <Link href="/compose" className="btn-brand">
                Write a message
              </Link>
            )}
          </div>
        )}

        {/* 4. Conversation rows. The bottom padding clears the bottom bar AND
            the compose button that floats above it. */}
        <div className="flex w-full flex-col pb-44">
          {visibleGroups.map((group) => (
            <Link
              key={group.threadKey}
              href={`/thread/group/${encodeURIComponent(group.threadKey)}`}
              className="flex h-[76px] w-full cursor-pointer items-center border-b border-surface-container-high px-4 active:bg-surface-container-high/40"
            >
              <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                <span className="absolute left-0 top-0 h-9 w-9 rounded-full bg-avatar-sky" aria-hidden="true" />
                <span className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="9" cy="8" r="3.2" />
                    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 19a5.5 5.5 0 0 0-2.2-4.4" />
                  </svg>
                </span>
              </span>
              <span className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-base font-bold">
                  Group -{" "}
                  {group.members
                    .map((member, index) => group.memberNames?.[index]?.trim() || member)
                    .join(", ")}
                </span>
                <span className="mt-1 truncate text-sm text-on-surface-variant">
                  {group.outgoing ? "You: " : ""}
                  {group.preview}
                </span>
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
              <Avatar size={48} />
              <span className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-base font-bold">
                  {thread.counterpartName?.trim() || thread.counterpart}
                </span>
                <span className="mt-1 truncate text-sm text-on-surface-variant">
                  {thread.outgoing ? "You: " : ""}
                  {thread.preview}
                </span>
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
            <span>Your mail stays between you and the people you write to</span>
          </div>
        </div>

        {/* 5. Floating compose button, clear of the bottom bar */}
        <div className="fixed bottom-[92px] right-6 z-10">
          <Link
            href="/compose"
            aria-label="Compose email"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] transition-all duration-ui ease-out-quint active:scale-[0.96]"
          >
            {/* Our own pencil, drawn so its mass sits centre: the body and tip in
                one stroke, the ferrule in another. */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16.6 3.9l3.5 3.5-11 11-4.4 1 1-4.4z" />
              <path d="M14.4 6.1l3.5 3.5" />
            </svg>
          </Link>
        </div>
      </div>
      <BottomBar active={filter === "favorites" ? "favorites" : "home"} />
    </main>
  );
}
