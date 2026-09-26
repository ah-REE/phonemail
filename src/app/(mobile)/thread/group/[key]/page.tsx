"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
import { GroupInfo } from "@/components/group-info";
import { MessageCard } from "@/components/message-card";
import { Spinner } from "@/components/spinner";
import { UserSheet } from "@/components/user-sheet";
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
 * The composer at the bottom is the spec's "in-thread compose" and it belongs to
 * the CREATOR - the member whose mail opened the conversation. Their messages are
 * broadcasts: every member reads them.
 *
 * Every other member replies instead, and a reply is PRIVATE: it is addressed to
 * the member whose mail it answers, carries this thread's key so it stays in the
 * conversation, and is visible to exactly two people - the member who wrote it and
 * the member who received it. Nobody else's payload contains it, and nobody else's
 * socket hears about it. That is why the payload carries a submission id (one
 * broadcast is one bubble, however many recipients) and a reply link (a reply
 * knows the mail it answers, which is also what makes it per-member).
 *
 * There is deliberately no way to add or remove a member from inside the thread.
 *
 * Deliberate day-6 scope: bubbles, unread marks and the long-message expansion
 * work here, but swipe-to-tag and reply-once stay pairwise-only affordances (the
 * data model has no per-group reply semantics). Noted in PROJECT.md.
 */

const LONG_MESSAGE_CHARS = 180;

interface GroupMessage {
  id: string;
  /** One value per submission: the key that makes a broadcast one bubble. */
  submissionId?: string | null;
  /** The row this message answers, when it is a reply. */
  replyToId?: string | null;
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
}

interface GroupThreadBody {
  threadKey?: string;
  creatorPhone?: string | null;
  members?: string[];
  memberNames?: (string | null)[];
  memberAddresses?: string[];
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
  const [memberNames, setMemberNames] = useState<(string | null)[]>([]);
  const [memberAddresses, setMemberAddresses] = useState<string[]>([]);
  const [creatorPhone, setCreatorPhone] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [memberSheet, setMemberSheet] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Locked recipient set: every member except me.
  const myNumber = user?.phoneNumber ?? "";
  const others = members.filter((member) => member !== myNumber);
  // The creator broadcasts; everyone else replies. Derived from the thread's own
  // first broadcast, so it needs no stored role.
  const isCreator = myNumber !== "" && creatorPhone !== null && myNumber === creatorPhone;

  /** The reply I already sent to this broadcast, if any. */
  const myReplyTo = (message: GroupMessage) =>
    messages.find((entry) => entry.mine && entry.replyToId === message.id);

  /** The reply URL for a broadcast: addressed to its sender, carrying the group. */
  function groupReplyHref(message: GroupMessage): string {
    const params = new URLSearchParams({
      to: phoneOf(message.from),
      replyTo: message.id,
      threadKey,
      origSubject: message.subject,
      quote: message.body.replace(/\s+/g, " ").slice(0, 160),
    });
    return `/compose?${params.toString()}`;
  }

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
        setMemberNames(body?.memberNames ?? []);
        setMemberAddresses(body?.memberAddresses ?? []);
        setCreatorPhone(body?.creatorPhone ?? null);
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

  // Same rule as the pairwise thread: a new message pulls the thread down to it.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : "";
  useEffect(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessageId]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !draft.trim() || others.length === 0) {
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

      // Sending is silent: the message appears when the SMTP round trip has
      // written the row, so there is nothing to announce.
      setDraft("");
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
      <header className="sticky top-0 z-20 flex h-[84px] w-full items-center gap-3 rounded-b-[24px] bg-chat-sheet px-4 shadow-card">
        <Link
          href="/"
          aria-label="Back to the chat list"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chat-rail text-on-surface"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        {/* Tapping the group opens its read-only details, and each member there is a person. */}
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="Group details"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
              <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 19a5.5 5.5 0 0 0-2.2-4.4" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-headline text-[17px] font-bold leading-tight text-on-surface">
              Group ({members.length || others.length + 1})
            </span>
            <span className="truncate text-[13px] leading-tight text-chat-meta" title={members.join(", ")}>
              {members.length > 0
                ? members.map((member, index) => memberNames[index]?.trim() || member).join(", ")
                : subject || "Loading members"}
            </span>
          </span>
        </button>
        <span className="shrink-0 text-[11px] text-chat-meta">group</span>
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

      <div ref={listRef} className="flex-1 overflow-y-auto bg-chat-canvas px-4 py-3">
        {messages.map((message) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;
          const original = message.replyToId
            ? messages.find((entry) => entry.id === message.replyToId)
            : undefined;
          // Members reply from a broadcast; the creator keeps the composer.
          const canReply = !message.mine && !message.replyToId;
          const answered = myReplyTo(message);

          return (
            <MessageCard
              key={message.submissionId ?? message.id}
              name={message.mine ? "You" : message.fromName?.trim() || phoneOf(message.from)}
              secondary={message.mine ? message.to : message.from}
              when={formatWhen(message.createdAt)}
              body={expanded || !long ? message.body : `${message.body.slice(0, LONG_MESSAGE_CHARS)}…`}
              isNew={message.wasUnread ?? false}
              tick={message.mine}
              quoted={
                original
                  ? `${original.mine ? "You" : original.fromName?.trim() || phoneOf(original.from)}: ${original.body.slice(0, 90)}`
                  : message.replyToId
                    ? "An earlier mail"
                    : null
              }
              replyHref={canReply && !answered ? groupReplyHref(message) : undefined}
              statusNote={message.mine ? "Sent" : canReply && answered ? "Replied" : null}
              footer={
                long && !expanded ? (
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-msg-accent"
                    onClick={() => setExpandedId(message.id)}
                  >
                    Read full message
                  </button>
                ) : long && expanded ? (
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-msg-accent"
                    onClick={() => setExpandedId(null)}
                  >
                    Collapse
                  </button>
                ) : null
              }
            />
          );
        })}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {!isCreator && (
        <p className="sticky bottom-0 z-20 w-full rounded-t-[28px] bg-chat-sheet px-5 pb-5 pt-4 text-center text-[13px] text-chat-meta shadow-overlay">
          Only the member who opened this conversation sends to everyone. Reply from the mail you are
          answering - your reply goes to them alone.
        </p>
      )}

      {isCreator && (
      <form
        className="sticky bottom-0 z-20 flex w-full flex-col gap-3 rounded-t-[28px] bg-chat-sheet px-5 pb-5 pt-4 shadow-overlay"
        onSubmit={handleSend}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-chat-meta">To (locked)</span>
          {others.map((member) => (
            <span
              key={member}
              className="flex h-9 items-center rounded-full bg-accent-soft px-3 text-[14px] font-medium text-accent"
              title="Locked: the recipient set of this thread cannot be changed"
            >
              {member}
            </span>
          ))}
          <Link
            href={`/compose?to=${encodeURIComponent(others.join(","))}&lockTo=1`}
            aria-label="Add a recipient in the traditional view"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-chat-rail text-accent"
            title="Add a recipient in the traditional view"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>

        <textarea
          className="min-h-[56px] w-full resize-none rounded-[28px] border border-outline-variant bg-chat-field px-5 py-4 text-base text-on-surface outline-none placeholder:text-outline"
          rows={1}
          placeholder="Message the group"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Message the group"
        />
        {notice && <p className="text-sm text-accent">{notice}</p>}
        <button
          type="submit"
          className="btn-brand w-full"
          disabled={sending || others.length === 0}
        >
          {sending ? (
            <Spinner label="Sending" />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12l16-8-6 16-2.6-6.4z" />
              </svg>
              Send to group
            </>
          )}
        </button>
      </form>
      )}

      {infoOpen && (
        <GroupInfo
          members={members}
          memberNames={memberNames}
          memberAddresses={memberAddresses}
          me={myNumber}
          onOpenMember={(member) => {
            setInfoOpen(false);
            setMemberSheet(member);
          }}
          onClose={() => setInfoOpen(false)}
        />
      )}

      {memberSheet && (
        <UserSheet
          subject={{
            phone: memberSheet,
            name: memberNames[members.indexOf(memberSheet)] ?? null,
            address:
              memberAddresses[members.indexOf(memberSheet)] || `${memberSheet}@phonemail.com`,
          }}
          onClose={() => setMemberSheet(null)}
        />
      )}
    </main>
  );
}
