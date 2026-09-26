"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
import { MailReader } from "@/components/mail-reader";
import { Spinner } from "@/components/spinner";
import { UserSheet } from "@/components/user-sheet";
import { ThreadSkeleton } from "@/components/skeleton";
import { EMAIL_TAGS } from "@/lib/tags";
import { appendProvisional, mergeThreadMessages } from "@/lib/threadMerge";
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
  fromName?: string | null;
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
  const [counterpartName, setCounterpartName] = useState<string | null>(null);
  const [counterpartAccountName, setCounterpartAccountName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // The mockup's paperclip: present per the design, honest about the backend.
  const [attachNotice, setAttachNotice] = useState(false);
  // The composer's own state. The thread sends its own messages now, so this is
  // no longer a label that navigates away.
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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
          counterpartName?: string | null;
          counterpartAccountName?: string | null;
          messages?: ThreadMessage[];
        };

        // Remember which messages were unread so the styling can mark them,
        // then mark the thread read (a separate POST — GETs never mutate).
        const incoming = (body.messages ?? []).map((message) => ({
          ...message,
          wasUnread: !message.mine && !message.isRead,
        }));

        // The server's answer wins, and a provisional bubble whose message has
        // now arrived for real is dropped - one message, one bubble.
        setMessages((current) => mergeThreadMessages(current, incoming));
        setSubject(body.subject ?? "");
        setCounterpartAddress(body.counterpartAddress ?? "");
        setCounterpartName(body.counterpartName ?? null);
        setCounterpartAccountName(body.counterpartAccountName ?? null);
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
      setMessages((current) =>
        appendProvisional(current, {
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
        }),
      );
      // Then let the server confirm it, so the provisional bubble is replaced by
      // the real row instead of standing beside it.
      window.setTimeout(() => void load(false), 1500);
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
   * The thread's composer: a normal new message to the counterpart. The recipient
   * set is the counterpart, one person, so nothing here is locked - locking
   * belongs to the reply flow, which is enforced server-side against the original
   * message. The subject continues the conversation, which is what keeps a plain
   * message from opening a new subject divider.
   */
  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !draft.trim()) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await authorizedFetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [phone],
          subject: subject.trim() || "Conversation",
          body: draft.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not send the message.");
        return;
      }

      // Sending succeeds silently: the message simply appears above, when the
      // SMTP round trip completes and the row is written.
      setDraft("");
      window.setTimeout(() => void load(false), 1400);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  /**
   * The reply URL. Replying is the ONE place a recipient set is locked, and the
   * original message rides along so the composer can show what is being answered:
   * its subject becomes the reply's subject, and its opening words become the
   * quoted context above the input. On the server the reply attaches to that exact
   * message id, so answering an older mail in a thread is answered correctly even
   * after a newer one has arrived.
   */
  function replyHrefFor(message: ThreadMessage): string {
    const params = new URLSearchParams({
      to: phone,
      replyTo: message.id,
      origSubject: message.subject,
      quote: message.body.replace(/\s+/g, " ").slice(0, 160),
    });
    return `/compose?${params.toString()}`;
  }

  if (status !== "authenticated") {
    return (
      <main className="flex h-dvh max-h-dvh flex-col overflow-hidden">
        <AppBar title={phone} backHref="/" />
        <ThreadSkeleton />
      </main>
    );
  }

  // A message from a number you have never written to opens as the traditional
  // reader (design/email_reader) instead of a lone chat bubble: first contact
  // reads like a letter, and the conversation starts when you reply. Everything
  // else stays a chat.
  const onlyIncoming =
    messages.length === 1 && !messages[0].mine && !messages[0].provisional ? messages[0] : null;

  return (
    <main className="flex h-dvh max-h-dvh flex-col overflow-hidden">
      <header className="sticky top-0 z-20 flex h-[84px] w-full shrink-0 items-center gap-3 rounded-b-[24px] bg-chat-sheet px-4 shadow-card">
        <Link
          href="/"
          aria-label="Back to the chat list"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-rail text-on-surface"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        {/* Tapping the person opens their details - which is how a person is saved. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Details for ${counterpartName?.trim() || phone}`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar size={48} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-headline text-[17px] font-bold leading-tight text-on-surface">
              {counterpartName?.trim() || phone}
            </span>
            <span className="truncate text-[13px] leading-tight text-chat-meta" title={headerSubject}>
              {headerSubject}
            </span>
          </span>
        </button>
        <span className="shrink-0 text-[11px] text-chat-meta" title="connection">
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

      {onlyIncoming ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container-lowest">
          <MailReader
            name={counterpartName?.trim() || phone}
            address={counterpartAddress || `${phone}@phonemail.com`}
            when={formatWhen(onlyIncoming.createdAt)}
            subject={onlyIncoming.subject || headerSubject}
            body={onlyIncoming.body}
            stateLabel={onlyIncoming.tag ? `Inbox • ${onlyIncoming.tag}` : "Inbox"}
            referenceId={onlyIncoming.id}
            newSender={!onlyIncoming.repliedAt}
            replyHref={onlyIncoming.repliedAt ? undefined : replyHrefFor(onlyIncoming)}
          />
        </div>
      ) : (
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-chat-canvas px-4 py-3">
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
        {messages.map((message, index) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;
          // A new subject opens a new chapter of the same conversation: the chat
          // simply continues, and the subject marks where it turned. A reply to an
          // OLDER message still lands in its own chronological place.
          const newSubject = index > 0 && messages[index - 1].subject !== message.subject;

          return (
            <div key={message.id}>
              {newSubject && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-surface-container-high px-3.5 py-1 text-xs font-semibold text-on-surface-variant">
                    {message.subject}
                  </span>
                </div>
              )}
              <div className={`mb-2 flex items-end gap-2 ${message.mine ? "justify-end" : "justify-start"}`}>
              {!message.mine && (
                <Avatar size={40} className="mb-0.5" />
              )}
              <div
                className={`bubble ${message.mine ? "bubble-out" : "bubble-in"}`}
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
                <div className="bubble-meta">
                  {message.wasUnread && (
                    <span className="rounded bg-accent px-1 text-[10px] font-semibold uppercase tracking-wide text-white">new</span>
                  )}
                  <span>{formatWhen(message.createdAt)}</span>
                  {message.mine && (
                    <span
                      className="ml-auto text-accent"
                      title="Sent - the mail service accepted this message"
                      aria-label="Sent"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                    </span>
                  )}
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
                      <Avatar size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">
                          {message.fromName?.trim() || message.from.replace(/@.*$/, "")}
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
                        href={replyHrefFor(message)}
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
                        href={replyHrefFor(message)}
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
            </div>
          );
        })}
      </div>
      )}

      {/* The composer. The field here used to be a LABEL that opened compose with
          the recipient list locked, so a normal new message could not be typed in
          the conversation at all - the locked state had leaked out of reply mode
          into the default flow. It is a real input now: type, send, and the
          message appears above it. The paperclip stays because the design shows it,
          reporting honestly that files have no backend; the camera keeps the
          traditional compose one tap away. Hidden while the reader is showing,
          where the reader's own Reply bar is the action. */}
      {!onlyIncoming && (
      <footer className="sticky bottom-0 z-20 flex w-full shrink-0 flex-col gap-3 rounded-t-[28px] bg-chat-sheet px-4 pb-4 pt-3 shadow-overlay">
        <form
          className="flex h-14 items-center gap-2 rounded-[28px] border border-outline-variant bg-chat-field px-4 text-on-surface-variant"
          onSubmit={handleSend}
        >
          <button
            type="button"
            aria-label="Attach documents"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            onClick={() => setAttachNotice(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11l-7.6 7.6a4.2 4.2 0 0 1-6-6L14 5a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2L15 8" />
            </svg>
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-outline"
            placeholder="Message"
            aria-label="Write a message in this conversation"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
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
          <Link
            href="/compose"
            aria-label="Start a new message"
            title="Start a new message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <button
            type="submit"
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-50"
            disabled={sending || draft.trim().length === 0}
          >
            {sending ? (
              <Spinner label="Sending" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l16-8-6 16-2.6-6.4z" />
              </svg>
            )}
          </button>
        </form>
      </footer>
      )}

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
      {sheetOpen && (
        <UserSheet
          subject={{
            phone,
            name: counterpartName,
            accountName: counterpartAccountName,
            address: counterpartAddress || `${phone}@phonemail.com`,
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </main>
  );
}
