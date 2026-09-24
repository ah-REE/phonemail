"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

import { useAuth } from "@/lib/useAuth";

/**
 * WhatsApp-style chat list (mobile home).
 *
 * Data comes from GET /api/conversations. Realtime is Socket.io; if the socket
 * cannot connect the screen falls back to a 30s poll so the list still works —
 * the evaluator flow must never depend on websockets being available.
 */

interface ConversationThread {
  counterpart: string;
  counterpartAddress: string;
  subject: string;
  preview: string;
  lastAt: string;
  unread: number;
}

type Realtime = "connecting" | "socket" | "polling";

const POLL_INTERVAL_MS = 30_000;

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
  const { ready, token, authorizedFetch } = useAuth();

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [realtime, setRealtime] = useState<Realtime>("connecting");

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
      const body = (await response.json()) as { threads?: ConversationThread[] };
      setThreads(body.threads ?? []);
      setError(null);
    } catch {
      setError("Network error. Pull to retry.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, router]);

  useEffect(() => {
    if (ready && !token) {
      router.replace("/onboarding");
    }
  }, [ready, token, router]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void load();
  }, [token, load]);

  // Realtime with a polling fallback.
  const pollRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!token) {
      return;
    }

    const startPolling = () => {
      if (pollRef.current !== undefined) {
        return;
      }
      pollRef.current = window.setInterval(() => {
        void load();
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollRef.current !== undefined) {
        window.clearInterval(pollRef.current);
        pollRef.current = undefined;
      }
    };

    let socket: Socket | null = null;
    try {
      socket = io({ auth: { token }, path: "/socket.io", transports: ["websocket"] });

      socket.on("connect", () => {
        stopPolling();
        setRealtime("socket");
      });
      socket.on("new-email", (payload: unknown) => {
        console.log("[home] new-email received, refetching conversations", payload);
        void load();
      });
      socket.on("connect_error", (socketError: Error) => {
        console.warn("[home] socket unavailable, polling instead:", socketError.message);
        setRealtime("polling");
        startPolling();
      });
      socket.on("disconnect", () => {
        console.warn("[home] socket disconnected, polling instead");
        setRealtime("polling");
        startPolling();
      });
    } catch (socketError) {
      console.warn("[home] socket setup failed, polling instead", socketError);
      setRealtime("polling");
      startPolling();
    }

    return () => {
      stopPolling();
      socket?.close();
    };
  }, [token, load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return threads.filter((thread) => {
      if (filter === "unread" && thread.unread === 0) {
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

  const unreadTotal = threads.reduce((sum, thread) => sum + thread.unread, 0);

  if (!ready || !token) {
    return null;
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
        <span className="ml-auto text-xs text-wa-muted">
          {realtime === "socket" ? "live" : realtime === "polling" ? "polling" : "connecting…"}
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

      {loading && <p className="p-4 text-wa-muted">Loading conversations…</p>}
      {error && <p className="p-4 text-wa-alert">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="p-6 text-center text-wa-muted">
          {threads.length === 0 ? "No messages yet. Say hello with the compose button." : "Nothing matches that search."}
        </p>
      )}

      <ul className="flex-1 overflow-y-auto">
        {visible.map((thread) => (
          <li key={thread.counterpartAddress} className="border-b border-wa-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-wa-teal text-xl font-semibold text-white">
                {initialOf(thread.counterpart)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-lg font-semibold">{thread.counterpart}</p>
                  <span className="ml-auto shrink-0 text-xs text-wa-muted">{formatTime(thread.lastAt)}</span>
                </div>
                <p className="truncate text-sm text-wa-muted">{thread.subject}</p>
                <p className="truncate text-sm text-wa-muted">{thread.preview}</p>
              </div>
              {thread.unread > 0 && (
                <span className="ml-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-wa-green px-2 text-sm font-semibold text-white">
                  {thread.unread}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/compose"
        aria-label="Compose"
        className="absolute bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-wa-green text-3xl text-white shadow-none"
        style={{ position: "fixed" }}
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
            <button type="button" className="btn-quiet mt-4 w-full" onClick={() => setMenuOpen(false)}>
              Close
            </button>
          </nav>
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1"
            onClick={() => setMenuOpen(false)}
          />
        </div>
      )}
    </main>
  );
}
