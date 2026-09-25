"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { ThreadSkeleton } from "@/components/skeleton";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Group conversation thread (Day 6, PROJECT.md Section 9).
 *
 * A group thread is not stored anywhere: the URL carries the DERIVED thread key
 * ("grp:" + sha256 of the member set) and the server returns every row that
 * carries it. Every member therefore sees the WHOLE conversation, including the
 * rows that were addressed to other members - which is the point of the feature.
 *
 * The composer at the bottom is the spec's "in-thread compose": it sends to all
 * the OTHER members of the open thread and the recipient set is LOCKED. There is
 * deliberately no way to add or remove a member from inside the thread; the Day
 * 6 regression asserts that lock.
 *
 * Deliberate day-6 scope: bubbles, unread marks and the long-message expansion
 * work here, but swipe-to-tag and reply-once stay pairwise-only affordances (the
 * data model has no per-group reply semantics). Noted in PROJECT.md.
 */

const LONG_MESSAGE_CHARS = 180;

interface GroupMessage {
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
}

interface GroupThreadBody {
  threadKey?: string;
  members?: string[];
  subject?: string;
  unread?: number;
  messages?: GroupMessage[];
  error?: string;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : `${date.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

export default function GroupThreadPage() {
  const router = useRouter();
  const params = useParams<{ key: string }>();
  const threadKey = params?.key ? decodeURIComponent(params.key) : "";
  const { status, token, user, authorizedFetch } = useAuth();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Locked recipient set: every member except me.
  const myNumber = user?.phoneNumber ?? "";
  const others = members.filter((member) => member !== myNumber);

  const load = useCallback(
    async (markRead: boolean) => {
      if (!threadKey) {
        return;
      }
      try {
        const response = await authorizedFetch(
          `/api/conversations/thread/${encodeURIComponent(threadKey)}`,
        );
        if (response.status === 401) {
          router.replace("/onboarding");
          return;
        }
        const body = (await response.json().catch(() => null)) as GroupThreadBody | null;

        if (!response.ok) {
          setError(body?.error ?? "Could not load this conversation.");
          setLoading(false);
          return;
        }

        const incoming = (body?.messages ?? []).map((message) => ({
          ...message,
          wasUnread: !message.mine && !message.isRead,
        }));

        setMessages(incoming);
        setMembers(body?.members ?? []);
        setSubject(body?.subject ?? "");
        setError(null);
        setLoading(false);

        if (markRead && incoming.some((message) => message.wasUnread)) {
          void authorizedFetch(
            `/api/conversations/thread/${encodeURIComponent(threadKey)}/read`,
            { method: "POST" },
          );
        }
      } catch {
        setError("Network error.");
        setLoading(false);
      }
    },
    [authorizedFetch, router, threadKey],
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  useEffect(() => {
    if (token && threadKey) {
      void load(true);
    }
  }, [token, threadKey, load]);

  // Any new mail may belong to this thread; a refetch is cheap and always right.
  useRealtime({
    token,
    onNewEmail: () => void load(false),
    onFallbackPoll: () => void load(false),
  });

  useEffect(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages.length]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || others.length === 0) {
      return;
    }

    setSending(true);
    setNotice(null);
    setError(null);

    try {
      const response = await authorizedFetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // LOCKED: the other members, all of them, always.
          to: others,
          subject: subject.toLowerCase().startsWith("re:") ? subject : `re: ${subject || "Group message"}`,
          body: draft.trim(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not send the message.");
        return;
      }

      setDraft("");
      setNotice("Handed to the mail service.");
      // The row appears when the SMTP round trip completes.
      window.setTimeout(() => void load(false), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex h-screen flex-col">
        <AppBar title="Group" backHref="/" />
        <ThreadSkeleton />
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      {/* The thread design plus the members header the brief asks for. */}
      <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between bg-primary-container px-4 text-on-primary">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full" aria-label="Back to the chat list">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container font-headline text-base font-bold text-primary-container">
              {members.length || others.length + 1}
            </span>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate font-headline text-base leading-tight">
                Group ({members.length || others.length + 1})
              </h1>
              <span className="truncate text-xs leading-tight opacity-90" title={members.join(", ")}>
                {members.length > 0 ? members.join(", ") : subject || "Loading members"}
              </span>
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs opacity-80">group</span>
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
              >
                <div className="flex items-baseline gap-2">
                  {message.wasUnread && (
                    <span className="rounded bg-wa-green px-1 text-xs font-semibold text-white">new</span>
                  )}
                  {/* The sender matters in a group: name it on incoming bubbles. */}
                  {!message.mine && (
                    <span className="text-xs font-semibold">{phoneOf(message.from)}</span>
                  )}
                  <span className="text-xs text-wa-muted">{formatWhen(message.createdAt)}</span>
                </div>

                {expanded ? (
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
                      {long ? `${message.body.slice(0, LONG_MESSAGE_CHARS)}.` : message.body}
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
              </div>
            </div>
          );
        })}
      </div>

      <form className="sticky bottom-0 z-20 border-t border-wa-line bg-surface-container-lowest p-3" onSubmit={handleSend}>
        <p className="mb-2 text-xs text-on-surface-variant">
          To (locked): {others.length > 0 ? others.join(", ") : "no other members"}
        </p>
        <div className="mb-2 flex flex-wrap gap-2">
          {others.map((member) => (
            <span
              key={member}
              className="rounded-full border border-wa-line bg-wa-panel px-3 py-1 text-sm"
              title="Locked: the recipient set of this thread cannot be changed"
            >
              {member}
            </span>
          ))}
        </div>
        <textarea
          className="field mb-2 min-h-20 w-full py-2"
          rows={3}
          placeholder="Message the group"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Message the group"
        />
        {notice && <p className="mb-2 text-sm text-wa-teal">{notice}</p>}
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={sending || others.length === 0}
        >
          {sending ? "Sending." : "Send to group"}
        </button>
      </form>
    </main>
  );
}
