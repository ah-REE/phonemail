"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { ThreadSkeleton } from "@/components/skeleton";
import { EMAIL_TAGS } from "@/lib/tags";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Conversation thread — the hybrid chat/traditional screen from PROJECT.md §5.
 *
 *  - WhatsApp-style bubbles: theirs left (white), ours right (green)
 *  - the subject is the thread header line; timestamps under each bubble
 *  - messages that were UNREAD when the thread opened are visually marked
 *  - a long message shows a preview with "Read full message", which expands to
 *    the traditional full view (complete body + From/To/Subject header block)
 *  - received messages offer reply ONCE; afterwards the affordance is gone
 *  - swiping a message reveals tag actions (a "⋯" button does the same thing
 *    for anyone who cannot or does not want to swipe)
 *  - a message that arrives while the thread is open is appended in place by the
 *    socket handler — no refetch is needed for it to appear
 */

const LONG_MESSAGE_CHARS = 180;
const SWIPE_REVEAL_PX = 40;


interface ThreadMessage {
  id: string;
  mine: boolean;
  from: string;
  to: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  repliedAt: string | null;
  tag: string | null;
  /** Local-only: true when this message was unread when the thread opened. */
  wasUnread?: boolean;
  /** Local-only: a bubble built from the socket payload before the row arrived. */
  provisional?: boolean;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : `${date.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ThreadPage() {
  const router = useRouter();
  const params = useParams<{ phone: string }>();
  const phone = params?.phone ?? "";
  const { status, token, authorizedFetch } = useAuth();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [counterpartAddress, setCounterpartAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tagOpenId, setTagOpenId] = useState<string | null>(null);
  const swipeStart = useRef<{ id: string; x: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (markRead: boolean) => {
      if (!phone) {
        return;
      }
      try {
        const response = await authorizedFetch(`/api/conversations/${phone}`);
        if (response.status === 401) {
          router.replace("/onboarding");
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Could not load this conversation.");
          setLoading(false);
          return;
        }

        const body = (await response.json()) as {
          subject?: string;
          counterpartAddress?: string;
          messages?: ThreadMessage[];
        };

        // Remember which messages were unread so the styling can mark them,
        // then mark the thread read (a separate POST — GETs never mutate).
        const incoming = (body.messages ?? []).map((message) => ({
          ...message,
          wasUnread: !message.mine && !message.isRead,
        }));

        setMessages(incoming);
        setSubject(body.subject ?? "");
        setCounterpartAddress(body.counterpartAddress ?? "");
        setError(null);
        setLoading(false);

        if (markRead && incoming.some((message) => message.wasUnread)) {
          void authorizedFetch(`/api/conversations/${phone}/read`, { method: "POST" });
        }
      } catch {
        setError("Network error.");
        setLoading(false);
      }
    },
    [authorizedFetch, phone, router],
  );

  // Never redirect while the phase is unknown — see the refresh-race fix.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  useEffect(() => {
    if (token) {
      void load(true);
    }
  }, [token, load]);

  // Realtime: append in place, no refetch required for the message to appear.
  const realtimeStatus = useRealtime({
    token,
    onNewEmail: (payload) => {
      const event = payload as { from?: string; subject?: string; preview?: string } | undefined;
      if (!event?.from || event.from !== counterpartAddress) {
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: `pending-${Date.now()}`,
          mine: false,
          from: event.from as string,
          to: "",
          subject: event.subject ?? "",
          body: event.preview ?? "",
          isRead: true,
          createdAt: new Date().toISOString(),
          repliedAt: null,
          tag: null,
          provisional: true,
        },
      ]);
    },
    onFallbackPoll: () => void load(false),
  });

  // Keep the newest message in view: a chat should not open mid-thread.
  useEffect(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages.length]);

  const headerSubject = useMemo(() => subject || "Conversation", [subject]);

  async function setTag(messageId: string, tag: string | null) {
    setTagOpenId(null);
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, tag } : message)),
    );
    const response = await authorizedFetch(`/api/emails/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    if (!response.ok) {
      setError("Could not save that tag.");
      void load(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex h-screen flex-col">
        <AppBar title={phone} backHref="/" />
        <ThreadSkeleton />
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b border-wa-line bg-wa-teal text-white">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{phone}</p>
            <p className="truncate text-xs opacity-90" title={headerSubject}>
              {headerSubject}
            </p>
          </div>
          <span className="text-xs opacity-80" title="connection">
            {realtimeStatus === "socket" ? "live" : realtimeStatus === "polling" ? "polling" : "…"}
          </span>
        </div>
      </header>

      {loading && <ThreadSkeleton />}
      {error && (
        <p className="p-4 text-wa-alert" role="alert">
          {error}
        </p>
      )}
      {!loading && messages.length === 0 && !error && (
        <p className="p-6 text-center text-wa-muted">No messages in this conversation yet.</p>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;

          return (
            <div key={message.id} className={`mb-3 flex ${message.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-bubble border px-3 py-2.5 ${
                  message.mine ? "border-wa-teal/20 bg-wa-bubble" : "border-wa-line bg-wa-panel"
                }`}
                onPointerDown={(event) => {
                  swipeStart.current = { id: message.id, x: event.clientX };
                }}
                onPointerUp={(event) => {
                  const start = swipeStart.current;
                  swipeStart.current = null;
                  if (!start || start.id !== message.id) {
                    return;
                  }
                  if (Math.abs(event.clientX - start.x) >= SWIPE_REVEAL_PX) {
                    setTagOpenId(message.id);
                  }
                }}
              >
                <div className="flex items-baseline gap-2">
                  {message.wasUnread && (
                    <span className="rounded bg-wa-green px-1 text-xs font-semibold text-white">new</span>
                  )}
                  <span className="text-xs text-wa-muted">{formatWhen(message.createdAt)}</span>
                  {message.tag && (
                    <span className="rounded border border-wa-line px-1 text-xs text-wa-muted">
                      {message.tag}
                    </span>
                  )}
                  {message.provisional && <span className="text-xs text-wa-muted">arriving…</span>}
                </div>

                {expanded ? (
                  // Traditional full view: the complete message plus its header block.
                  <div className="mt-1 border-t border-wa-line pt-2">
                    <dl className="mb-2 text-xs text-wa-muted">
                      <div>
                        <dt className="inline font-semibold">From: </dt>
                        <dd className="inline">{message.from}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">To: </dt>
                        <dd className="inline">{message.to}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Subject: </dt>
                        <dd className="inline">{message.subject}</dd>
                      </div>
                    </dl>
                    <p className="whitespace-pre-wrap text-base">{message.body}</p>
                    <button
                      type="button"
                      className="mt-2 text-sm font-semibold text-wa-teal"
                      onClick={() => setExpandedId(null)}
                    >
                      Collapse
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-base">
                      {long ? `${message.body.slice(0, LONG_MESSAGE_CHARS)}…` : message.body}
                    </p>
                    {long && (
                      <button
                        type="button"
                        className="mt-1 text-sm font-semibold text-wa-teal"
                        onClick={() => setExpandedId(message.id)}
                      >
                        Read full message
                      </button>
                    )}
                  </>
                )}

                {!message.mine && !message.provisional && (
                  <div className="mt-2 flex items-center gap-3">
                    {message.repliedAt ? (
                      <span className="text-xs text-wa-muted">Replied</span>
                    ) : (
                      <Link
                        href={`/compose?to=${encodeURIComponent(phone)}&replyTo=${encodeURIComponent(message.id)}`}
                        className="min-h-tap text-sm font-semibold text-wa-teal"
                      >
                        Reply
                      </Link>
                    )}
                    <button
                      type="button"
                      className="min-h-tap text-sm text-wa-muted"
                      aria-label="Tag this message"
                      onClick={() => setTagOpenId(tagOpenId === message.id ? null : message.id)}
                    >
                      ⋯
                    </button>
                  </div>
                )}

                {tagOpenId === message.id && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-wa-line pt-2">
                    {EMAIL_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="min-h-tap rounded border border-wa-line px-2 text-sm"
                        onClick={() => void setTag(message.id, tag)}
                      >
                        {tag}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="min-h-tap rounded border border-wa-line px-2 text-sm"
                      onClick={() => void setTag(message.id, null)}
                    >
                      clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-wa-line p-3">
        <Link href={`/compose?to=${encodeURIComponent(phone)}`} className="btn-primary w-full">
          Message {phone}
        </Link>
      </div>
    </main>
  );
}
