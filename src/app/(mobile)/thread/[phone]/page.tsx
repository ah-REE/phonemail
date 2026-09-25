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
  // The mockup's paperclip: present per the design, honest about the backend.
  const [attachNotice, setAttachNotice] = useState(false);
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

  /**
   * Day 6 folders: moving a message is one PATCH on its folder, exactly like a
   * tag. It leaves the conversation (folder is recipient-scoped state) and
   * appears on the Spam or Trash screen.
   */
  async function moveMessage(messageId: string, folder: "inbox" | "spam" | "trash") {
    setTagOpenId(null);
    setError(null);
    const response = await authorizedFetch(`/api/emails/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!response.ok) {
      setError("Could not move that message.");
      return;
    }
    void load(false);
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
            <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between bg-primary-container px-4 text-on-primary">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" aria-label="Back to the chat list">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container font-headline text-base font-bold text-primary-container">
              {phone.slice(0, 1) || "?"}
            </span>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate font-headline text-base leading-tight">{phone}</h1>
              <span className="truncate text-xs leading-tight opacity-90" title={headerSubject}>
                {headerSubject}
              </span>
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs opacity-80" title="connection">
          {realtimeStatus === "socket" ? "live" : realtimeStatus === "polling" ? "polling" : "connecting"}
        </span>
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

      <div ref={listRef} className="flex-1 overflow-y-auto bg-surface-container p-4">
        {/* The mockup's date divider, then its subject pill. */}
        <div className="mb-4 flex justify-center">
          <span className="rounded-full bg-surface-container-high px-3 py-1 text-[11px] uppercase tracking-wider text-on-surface-variant">
            {formatWhen(messages[0]?.createdAt ?? new Date().toISOString()).split(",")[0]}
          </span>
        </div>
        {/* The thread's subject as the mockup's centred pill. */}
        {headerSubject && headerSubject !== "Conversation" && (
          <div className="mb-4 flex justify-center">
            <span className="rounded-full bg-surface-container-high px-3.5 py-1 text-xs font-semibold text-on-surface-variant">
              {headerSubject}
            </span>
          </div>
        )}
        {messages.map((message) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;

          return (
            <div key={message.id} className={`mb-3 flex ${message.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-3 ${
                  message.mine
                    ? "ml-auto rounded-tr-sm bg-secondary-container text-on-surface"
                    : "rounded-tl-sm bg-surface-container text-on-surface"
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
                    {/* The email-reader mockup: sender block, subject heading,
                        hairline, then the body at the mockup's generous leading. */}
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-container font-headline text-base font-bold text-primary-container">
                        {message.from.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">
                          {message.from.replace(/@.*$/, "")}
                        </p>
                        <p className="select-all truncate text-xs text-outline">
                          {message.from}
                        </p>
                      </div>
                      <span className="shrink-0 pt-0.5 text-xs text-outline">
                        {formatWhen(message.createdAt)}
                      </span>
                    </div>
                    <span className="mt-4 inline-block rounded bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                      To: {message.to}
                    </span>
                    <h3 className="mt-2 font-headline text-[22px] font-bold leading-snug">
                      {message.subject}
                    </h3>
                    <div className="my-3 h-[1px] w-full bg-surface-container" />
                    <p className="whitespace-pre-wrap text-base leading-[30px]">{message.body}</p>
                    {!message.mine && !message.provisional && !message.repliedAt && (
                      <Link
                        href={`/compose?to=${encodeURIComponent(phone)}&replyTo=${encodeURIComponent(message.id)}`}
                        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-wa-teal text-base font-bold text-white"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 7L4 12l5 5" />
                          <path d="M4 12h9a6 6 0 0 1 6 6v1" />
                        </svg>
                        Reply
                      </Link>
                    )}
                    {message.repliedAt && (
                      <p className="mt-4 text-sm text-on-surface-variant">Replied</p>
                    )}
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
                    <button
                      type="button"
                      className="min-h-tap rounded border border-wa-line px-2 text-sm"
                      onClick={() => void moveMessage(message.id, "spam")}
                    >
                      Spam
                    </button>
                    <button
                      type="button"
                      className="min-h-tap rounded border border-wa-line px-2 text-sm"
                      onClick={() => void moveMessage(message.id, "trash")}
                    >
                      Trash
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The mockup's bottom bar: paperclip on the left, the message field, and
          the traditional-compose button in the camera slot on the right. The field
          opens compose - the app has no inline sender - and the paperclip is
          present because the design shows it, reporting honestly that files have
          no backend yet. */}
      <footer className="sticky bottom-0 z-20 flex w-full items-center gap-2 bg-surface-container-lowest px-3 py-2.5">
        <button
          type="button"
          aria-label="Attach documents"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant active:bg-surface-container"
          onClick={() => setAttachNotice(true)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11l-7.6 7.6a4.2 4.2 0 0 1-6-6L14 5a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2L15 8" />
          </svg>
        </button>
        <div className="flex h-12 flex-1 items-center gap-2 rounded-full bg-surface-container px-4 text-sm text-on-surface-variant">
          <span className="flex-1 truncate">Message {phone}</span>
          <Link
            href={`/compose?to=${encodeURIComponent(phone)}&lockTo=1`}
            aria-label="Write to this number in the traditional view (locked recipients)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </Link>
        </div>
        <Link
          href={`/compose?to=${encodeURIComponent(phone)}&lockTo=1`}
          aria-label={`Write to ${phone} in the traditional view`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container text-on-surface"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
        </Link>
      </footer>

      {attachNotice && (
        <button
          type="button"
          onClick={() => setAttachNotice(false)}
          aria-label="Dismiss"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 pb-28"
        >
          <span className="surface flex w-full max-w-sm flex-col items-center gap-1 p-4 text-center">
            <span className="text-base font-semibold">Attachments coming soon</span>
            <span className="text-sm text-on-surface-variant">
              PhoneMail cannot carry files yet. Your message text is unaffected.
            </span>
          </span>
        </button>
      )}
    </main>
  );
}
