"use client";

import { guardRedirect } from "@/lib/entry";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { AttachmentCards } from "@/components/attachments";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { MailReader } from "@/components/mail-reader";
import { MessageCard } from "@/components/message-card";
import { UserSheet } from "@/components/user-sheet";
import { ThreadSkeleton } from "@/components/skeleton";
import { EMAIL_TAGS } from "@/lib/tags";
import { dayLabel, startsNewDay, startsNewSubject } from "@/lib/timeline";
import { appendProvisional, mergeThreadMessages } from "@/lib/threadMerge";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Conversation thread — the hybrid chat/traditional screen from PROJECT.md §5.
 *
 *  - WhatsApp-style bubbles: theirs left (white), ours right (green)
 *  - the header is the PERSON only; the subject's home is the thread body
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
  /** The row this message answers, when it is a reply. */
  replyToId?: string | null;
  tag: string | null;
  /** Day 8: the files that travelled with this message (metadata; bytes on demand). */
  attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[] | null;
  /** Local-only: true when this message was unread when the thread opened. */
  wasUnread?: boolean;
  /** Local-only: a bubble built from the socket payload before the row arrived. */
  provisional?: boolean;
}

/**
 * ROUND 4 - how a subject is labelled. A mail that OPENED a subject says
 * "Subject: <subject>"; only a reply says "re: <subject>" (which is the subject
 * the server already stores on a reply). One place, so the divider and the
 * thread's subject pill cannot disagree about which of the two a mail is.
 */
function subjectHeading(subject: string, isReply: boolean): string {
  const text = subject.trim() || "Conversation";
  return isReply || text.toLowerCase().startsWith("re:") ? text : `Subject: ${text}`;
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
  // ROUND 6: swipe RIGHT *is* the reply gesture - it opens the reply compose for
  // that mail directly (quoted context, derived subject, replyToId, reply-once);
  // swipe LEFT keeps the tag/move panel. The old two-step (reveal a footer link,
  // then tap it) is gone, and so is the state that drove it.
  // ROUND 7: the paperclip no longer raises a "coming soon" panel - a thread has
  // no composer, so the honest door for a file is the traditional compose, which is
  // one tap away and locked to this counterpart. (The chip itself is unchanged; only
  // what it does is.)
  const [tagOpenId, setTagOpenId] = useState<string | null>(null);
  const swipeStart = useRef<{ id: string; x: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (markRead: boolean) => {
      if (!phone) {
        return;
      }
      try {
        const response = await authorizedFetch(`/api/conversations/${phone}`);
        if (response.status === 401) {
          guardRedirect(router);
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
      guardRedirect(router);
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

  // Keep the newest message in view: a chat should not open mid-thread, and a new
  // message - mine sending, or arriving live on the socket - pulls the thread down
  // to it without anyone reaching for the screen. The sentinel moves with the last
  // message, so this fires on an append even when the length is unchanged by a
  // reconciliation.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : "";
  useEffect(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessageId]);

  // The thread's LEADING subject is the one it OPENED with - the first message's -
  // and it must never be rewritten by a later arrival. (It used to be the server
  // payload's `subject`, which is the NEWEST subject, so a second subject silently
  // renamed the chapter the reader had already read. New subjects only ever ADD a
  // divider now.) The state stays as the fallback for the moment before the first
  // message has loaded.
  const headerSubject = useMemo(
    () => messages[0]?.subject || subject || "Conversation",
    [messages, subject],
  );

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

  /**
   * Day 6 folders, restored at the owner's request: moving a message is one PATCH
   * on its folder, exactly like a tag. It leaves the conversation (folder is
   * recipient-scoped state) and appears on the Spam or Trash screen.
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
        <BackButton href="/" tone="rail" label="Back to the chat list" />
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
            <span className="truncate text-[13px] leading-tight text-chat-meta">
              {counterpartAddress || `${phone}@phonemail.com`}
            </span>
          </span>
        </button>
        {/* No connection WORD. When the socket is live there is nothing worth saying,
            and a label that says "live" only teaches the reader to ignore it. A
            single quiet dot appears only when the connection is NOT live, which is
            the one case where it is news. */}
        {realtimeStatus !== "socket" && (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-chat-meta"
            title={realtimeStatus === "polling" ? "Polling for new mail" : "Connecting"}
            aria-label={realtimeStatus === "polling" ? "Polling for new mail" : "Connecting"}
          />
        )}
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
        {/* The thread's subject as the mockup's centred pill. ROUND 4: a mail
            that opened a subject reads "Subject: <subject>"; only replies read
            "re: <subject>". */}
        {headerSubject && headerSubject !== "Conversation" && (
          <div className="mb-4 flex justify-center">
            <span className="rounded-full bg-surface-container-high px-3.5 py-1 text-xs font-semibold text-on-surface-variant">
              {subjectHeading(headerSubject, false)}
            </span>
          </div>
        )}
        {messages.map((message, index) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;
          // Two boundaries, one shared rule (lib/timeline): a calendar day change
          // draws a date pill, a subject change draws a chapter divider. Both are
          // DERIVED from the ordered list, so a message that arrived over the
          // socket gets its divider exactly like a refetched one.
          const newDay = index > 0 && startsNewDay(messages[index - 1].createdAt, message.createdAt);
          const newSubject = startsNewSubject(messages[index - 1]?.subject, message.subject);
          const original = message.replyToId
            ? messages.find((entry) => entry.id === message.replyToId)
            : undefined;

          // RUNS: consecutive messages from one sender are one person talking, so the
          // sender's name lands on the run's first bubble and their avatar once at
          // its foot, and the messages inside a run sit closer than runs sit apart.
          const runIndex = messages.indexOf(message);
          const sameRun = (other: (typeof messages)[number] | undefined) =>
            Boolean(
              other &&
                other.mine === message.mine &&
                (message.mine || other.from === message.from),
            );
          const isFirstInRun = !sameRun(messages[runIndex - 1]);
          const isLastInRun = !sameRun(messages[runIndex + 1]);

          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-surface-container-high px-3 py-1 text-[11px] uppercase tracking-wider text-on-surface-variant">
                    {dayLabel(message.createdAt)}
                  </span>
                </div>
              )}

              {newSubject && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-surface-container-high px-3.5 py-1 text-xs font-semibold text-on-surface-variant">
                    {subjectHeading(message.subject, Boolean(message.replyToId))}
                  </span>
                </div>
              )}

              <MessageCard
                mine={message.mine}
                isFirstInRun={isFirstInRun}
                isLastInRun={isLastInRun}
                name={message.mine ? "You" : message.fromName?.trim() || phone}
                secondary={message.mine ? counterpartAddress : message.from}
                when={formatWhen(message.createdAt)}
                body={expanded || !long ? message.body : `${message.body.slice(0, LONG_MESSAGE_CHARS)}…`}
                tick={message.mine}
                attachments={<AttachmentCards attachments={message.attachments} />}
                quoted={
                  original
                    ? `${original.mine ? "You" : original.fromName?.trim() || original.from}: ${original.body.slice(0, 90)}`
                    : message.replyToId
                      ? "An earlier message"
                      : null
                }
                replyHref={
                  message.mine || message.provisional || message.repliedAt ? undefined : replyHrefFor(message)
                }
                statusNote={
                  message.mine
                    ? "Sent"
                    : message.provisional
                      ? "Arriving…"
                      : message.repliedAt
                        ? "Replied"
                        : null
                }
                onMore={
                  message.mine || message.provisional
                    ? undefined
                    : () => setTagOpenId(tagOpenId === message.id ? null : message.id)
                }
                moreOpen={tagOpenId === message.id}
                moreContent={
                  /* ROUND 4: the chevron opens a FOUR-ACTION row - Move to Spam,
                     Move to Trash, Favorite, Reply - each a 56px target. The
                     remaining tags stay reachable on a quieter second line so
                     nothing the tag panel could do is lost. */
                  <div className="flex flex-col gap-2 border-t border-wa-line pt-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="flex min-h-tap items-center rounded-full border border-wa-line px-4 text-sm font-semibold"
                        onClick={() => void moveMessage(message.id, "spam")}
                      >
                        Move to Spam
                      </button>
                      <button
                        type="button"
                        className="flex min-h-tap items-center rounded-full border border-wa-line px-4 text-sm font-semibold"
                        onClick={() => void moveMessage(message.id, "trash")}
                      >
                        Move to Trash
                      </button>
                      <button
                        type="button"
                        aria-pressed={message.tag === "favorite"}
                        className="flex min-h-tap items-center rounded-full border border-wa-line px-4 text-sm font-semibold"
                        onClick={() =>
                          void setTag(message.id, message.tag === "favorite" ? null : "favorite")
                        }
                      >
                        {message.tag === "favorite" ? "Favorite \u2713" : "Favorite"}
                      </button>
                      {!message.mine && !message.provisional && !message.repliedAt && (
                        <Link
                          href={replyHrefFor(message)}
                          className="flex min-h-tap items-center rounded-full bg-msg-action px-4 text-sm font-semibold text-msg-accent"
                        >
                          Reply
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-chat-meta">Tags</span>
                      {EMAIL_TAGS.filter((tag) => tag !== "favorite").map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="min-h-9 rounded-full border border-wa-line px-3 text-[13px]"
                          onClick={() => void setTag(message.id, tag)}
                        >
                          {tag}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="min-h-9 rounded-full border border-wa-line px-3 text-[13px]"
                        onClick={() => void setTag(message.id, null)}
                      >
                        clear
                      </button>
                    </div>
                  </div>
                }
                footer={
                  long && !expanded ? (
                    <button
                      type="button"
                      className="min-h-0 text-sm font-semibold text-msg-accent"
                      onClick={() => setExpandedId(message.id)}
                    >
                      Read full message
                    </button>
                  ) : long && expanded ? (
                    <button
                      type="button"
                      className="min-h-0 text-sm font-semibold text-msg-accent"
                      onClick={() => setExpandedId(null)}
                    >
                      Collapse
                    </button>
                  ) : null
                }
                onPointerDown={(event) => {
                  swipeStart.current = { id: message.id, x: event.clientX };
                }}
                onPointerUp={(event) => {
                  const start = swipeStart.current;
                  swipeStart.current = null;
                  if (!start || start.id !== message.id) {
                    return;
                  }
                  const travelled = event.clientX - start.x;
                  if (travelled >= SWIPE_REVEAL_PX) {
                    // The reply swipe, all the way through: a mail I can answer
                    // opens its reply compose; one I cannot (mine, still arriving,
                    // or already answered) has nothing to open, so the gesture is
                    // inert rather than offering a dead end.
                    setTagOpenId(null);
                    if (!message.mine && !message.provisional && !message.repliedAt) {
                      router.push(replyHrefFor(message));
                    }
                    return;
                  }
                  if (-travelled >= SWIPE_REVEAL_PX) {
                    setTagOpenId(tagOpenId === message.id ? null : message.id);
                  }
                }}
              />
            </div>
          );
        })}

        <div ref={bottomRef} aria-hidden="true" />
      </div>
      )}

      {/* ROUND 4 - THE REPLY MODEL. There is no free composer inside a thread any
          more: a message box that mails whoever happens to be in the thread is how
          an intended reply accidentally becomes a fresh send. The bar is the NEW
          MAIL button, and in a 1:1 it opens the traditional compose with To locked
          to this counterpart - the one place a recipient set is locked. The
          paperclip chip stays: the design shows it and it reports honestly that
          files have no backend. Hidden while the reader is showing, where the
          reader's own Reply bar is the action. */}
      {!onlyIncoming && (
      <footer className="sticky bottom-0 z-20 flex w-full shrink-0 items-center gap-2 rounded-t-[28px] bg-chat-sheet px-4 pb-4 pt-3 shadow-overlay">
        <Link
          href={`/compose?to=${encodeURIComponent(phone)}&lockTo=1`}
          aria-label="Attach a file in the traditional compose"
          title="Attach a file in the traditional compose"
          className="flex min-h-0 h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chat-rail text-on-surface-variant"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 11l-7.6 7.6a4.2 4.2 0 0 1-6-6L14 5a2.8 2.8 0 0 1 4 4l-7.6 7.6a1.4 1.4 0 0 1-2-2L15 8" />
          </svg>
        </Link>
        <Link
          href={`/compose?to=${encodeURIComponent(phone)}&lockTo=1`}
          className="btn-brand flex-1"
          aria-label="Start a new mail to this number (To is locked)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New mail
        </Link>
      </footer>
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
          onSaved={(name) => setCounterpartName(name)}
          onDeleteChat={async () => {
            // The DELETE hides MY side only; the counterpart keeps their copy. Back to
            // the list, which no longer has this conversation in it.
            const response = await authorizedFetch(
              `/api/conversations/${encodeURIComponent(phone)}`,
              { method: "DELETE" },
            );
            if (response.ok) {
              setSheetOpen(false);
              router.push("/");
            }
          }}
        />
      )}
    </main>
  );
}
