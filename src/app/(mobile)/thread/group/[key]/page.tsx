"use client";

import { guardRedirect } from "@/lib/entry";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { AttachmentCards } from "@/components/attachments";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { GroupInfo } from "@/components/group-info";
import { ActionToast } from "@/components/action-toast";
import { Collapsing } from "@/components/collapsing";
import { AnimatedFavoriteChip, FavoriteStar } from "@/components/favorite-star";
import { MessageCard } from "@/components/message-card";
import type { MemberTag } from "@/lib/roles";
import { EMAIL_TAGS } from "@/lib/tags";
import { UserSheet } from "@/components/user-sheet";
import { ThreadSkeleton } from "@/components/skeleton";
import { dayLabel, startsNewDay, startsNewSubject } from "@/lib/timeline";
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
  /** ROUND 9: the sender's role in this conversation ('sender' | 'receiver' | 'cc'). */
  fromTag?: MemberTag | null;
  from: string;
  to: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  repliedAt: string | null;
  tag: string | null;
  /** Day 8: the files on this row (metadata; bytes fetched on demand). */
  attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[] | null;
  /** Local-only: true when this message was unread when the thread opened. */
  wasUnread?: boolean;
}

interface GroupThreadBody {
  threadKey?: string;
  creatorPhone?: string | null;
  members?: string[];
  memberNames?: (string | null)[];
  memberAddresses?: string[];
  /** ROUND 9: member role tags, keyed by canonical phone number. */
  memberTags?: Record<string, MemberTag>;
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

/**
 * The round-4 subject rule, shared with the 1:1 thread: a mail that OPENED a
 * subject reads "Subject: <subject>", and only a reply reads "re: <subject>".
 */
function subjectHeading(subject: string, isReply: boolean): string {
  const text = subject.trim() || "Conversation";
  return isReply || text.toLowerCase().startsWith("re:") ? text : `Subject: ${text}`;
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
  // ROUND 9: the role tags, keyed by canonical phone number. The thread payload
  // derives them from the founding mail, so the thread and the group info read the
  // same map rather than deriving it twice.
  const [memberTags, setMemberTags] = useState<Record<string, MemberTag>>({});
  const [creatorPhone, setCreatorPhone] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [memberSheet, setMemberSheet] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /**
   * ROUND 30 follow-up 1 (the owner: "mobile cards doesnt have action menu
   * like desktop"): which bubble's action panel is open - the same chevron
   * the 1:1 thread and the desktop cards carry.
   */

  /** ROUND 31: the id whose favorite chip just activated - its star pops once. */
  const [starPop, setStarPop] = useState<string | null>(null);
  /** ROUND 31: the move-collapse machine - one bubble at a time. */
  const [collapse, setCollapse] = useState<{ id: string; phase: "closing" | "expanding" } | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    label: string;
    snapshot: GroupMessage;
    index: number;
  } | null>(null);
  const moveRef = useRef<{
    id: string;
    folder: "spam" | "trash";
    snapshot: GroupMessage;
    index: number;
    patch: "pending" | "ok" | "failed";
    collapsed: boolean;
  } | null>(null);
  const [tagOpenId, setTagOpenId] = useState<string | null>(null);
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
          guardRedirect(router);
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
      setMemberTags(body?.memberTags ?? {});
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
      guardRedirect(router);
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

  /**
   * ROUND 30 follow-up 1: moving and tagging, exactly the 1:1 thread's routes -
   * one PATCH on the row the bubble stands for (the payload picks the VIEWER's
   * own row), then a quiet refetch. Spam and Trash are the recipient's filing,
   * so the panel only offers them where they apply.
   */
  /**
   * ROUND 31: moving a message is a motion flow now - the bubble collapses
   * (240ms), THEN the row leaves the list, and the undo toast holds the door
   * open for five seconds. The PATCH and the collapse race; whichever finishes
   * last commits. A failed PATCH re-expands instead, so the message never
   * silently disappears when the server refused.
   */
  function moveMessage(messageId: string, folder: "spam" | "trash") {
    setTagOpenId(null);
    setError(null);
    const index = messages.findIndex((message) => message.id === messageId);
    const snapshot = messages[index];
    if (!snapshot || moveRef.current) {
      return;
    }
    moveRef.current = { id: messageId, folder, snapshot, index, patch: "pending", collapsed: false };
    setCollapse({ id: messageId, phase: "closing" });
    void (async () => {
      const response = await authorizedFetch(`/api/emails/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      const move = moveRef.current;
      if (!move || move.id !== messageId) {
        return;
      }
      if (!response.ok) {
        move.patch = "failed";
        setError("Could not move that message.");
        if (move.collapsed) {
          moveRef.current = null;
          setCollapse({ id: messageId, phase: "expanding" });
        }
        return;
      }
      move.patch = "ok";
      if (move.collapsed) {
        commitMove();
      }
    })();
  }

  /** Both halves done (collapse + PATCH): the row leaves and the toast opens. */
  function commitMove() {
    const move = moveRef.current;
    if (!move) {
      return;
    }
    moveRef.current = null;
    setMessages((current) => current.filter((message) => message.id !== move.id));
    setCollapse(null);
    setUndo({
      id: move.id,
      label: move.folder === "trash" ? "Moved to Trash" : "Moved to Spam",
      snapshot: move.snapshot,
      index: move.index,
    });
  }

  function onCollapseDone(phase: "closing" | "expanding") {
    if (phase === "expanding") {
      setCollapse(null);
      return;
    }
    const move = moveRef.current;
    if (!move) {
      setCollapse(null);
      return;
    }
    move.collapsed = true;
    if (move.patch === "ok") {
      commitMove();
    } else if (move.patch === "failed") {
      moveRef.current = null;
      setCollapse({ id: move.id, phase: "expanding" });
    }
    // "pending": the PATCH's own completion handler commits.
  }

  /** ROUND 31: undo = the folder goes back and the bubble re-expands in place. */
  async function undoMove() {
    const entry = undo;
    if (!entry) {
      return;
    }
    setUndo(null);
    setMessages((current) => {
      const next = [...current];
      next.splice(Math.min(entry.index, next.length), 0, entry.snapshot as GroupMessage);
      return next;
    });
    setCollapse({ id: entry.id, phase: "expanding" });
    const response = await authorizedFetch(`/api/emails/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder: "inbox" }),
    });
    if (!response.ok) {
      setError("Could not restore that message.");
      void load(false);
    }
  }


  async function setTag(messageId: string, tag: string | null) {
    setTagOpenId(null);
    if (tag === "favorite") {
      // ROUND 31: the chip mounts because of THIS action, so its star pops.
      setStarPop(messageId);
      window.setTimeout(() => setStarPop((current) => (current === messageId ? null : current)), 360);
    }
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

  // Same rule as the pairwise thread: a new message pulls the thread down to it.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : "";
  useEffect(() => {
    const node = listRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastMessageId]);

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
        <BackButton href="/" tone="rail" label="Back to the chat list" />
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
                ? `${members.length} members · ${members
                    .map((member, index) => memberNames[index]?.trim() || member)
                    .join(", ")}`
                : "Loading members"}
            </span>
          </span>
        </button>
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
        {messages.map((message, index) => {
          const long = message.body.length > LONG_MESSAGE_CHARS;
          const expanded = expandedId === message.id;
          const original = message.replyToId
            ? messages.find((entry) => entry.id === message.replyToId)
            : undefined;
          // Members reply from a broadcast; the creator keeps the composer.
          const canReply = !message.mine && !message.replyToId;
          const answered = myReplyTo(message);

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

          // ROUND 5: the same two boundaries the 1:1 thread draws, from the same
          // shared rule - a day pill on a calendar change (the group had none) and
          // a subject divider on a new subject, which is the parity the last
          // session's report left open.
          const newDay = index === 0 || startsNewDay(messages[index - 1].createdAt, message.createdAt);
          const newSubject = startsNewSubject(messages[index - 1]?.subject, message.subject);

          return (
            <Collapsing
              key={message.submissionId ?? message.id}
              data-message-id={message.id}
              phase={collapse && collapse.id === message.id ? collapse.phase : "idle"}
              onDone={onCollapseDone}
            >
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
              key={message.submissionId ?? message.id}
              mine={message.mine}
              isFirstInRun={isFirstInRun}
              isLastInRun={isLastInRun}
              showName
              name={message.mine ? "You" : message.fromName?.trim() || phoneOf(message.from)}
              senderTag={message.fromTag ?? null}
              secondary={message.mine ? message.to : message.from}
              tags={<AnimatedFavoriteChip show={message.tag === "favorite"} pop={starPop === message.id} />}
              when={formatWhen(message.createdAt)}
              body={expanded || !long ? message.body : `${message.body.slice(0, LONG_MESSAGE_CHARS)}…`}
              tick={message.mine}
              attachments={<AttachmentCards attachments={message.attachments} />}
              quoted={
                original
                  ? `${original.mine ? "You" : original.fromName?.trim() || phoneOf(original.from)}: ${original.body.slice(0, 90)}`
                  : message.replyToId
                    ? "An earlier mail"
                    : null
              }
              replyHref={canReply && !answered ? groupReplyHref(message) : undefined}
              statusNote={message.mine ? "Sent" : canReply && answered ? "Replied" : null}
              onMore={() => setTagOpenId(tagOpenId === message.id ? null : message.id)}
              moreOpen={tagOpenId === message.id}
              moreContent={
                /* ROUND 30 follow-up 1 (the owner: "mobile cards doesnt have action
                   menu like desktop"): the group bubble carries the same chevron
                   tab the 1:1 thread and the desktop cards do - the sender's own
                   actions on your mail (Trash, Favorite, Forward), the fuller set
                   on anyone else's (Spam, Trash, Favorite, Reply, Forward), and
                   the quieter tags line for received mail, the 1:1 panel's shape. */
                <div className="flex flex-col gap-2 border-t border-wa-line pt-2">
                  <div className="flex flex-wrap gap-2">
                    {!message.mine && (
                      <button
                        type="button"
                        className="press flex min-h-tap items-center rounded-full border border-wa-line bg-surface/75 px-4 text-sm font-semibold"
                        onClick={() => void moveMessage(message.id, "spam")}
                      >
                        Move to Spam
                      </button>
                    )}
                    <button
                      type="button"
                      className="press flex min-h-tap items-center rounded-full border border-wa-line bg-surface/75 px-4 text-sm font-semibold"
                      onClick={() => void moveMessage(message.id, "trash")}
                    >
                      Move to Trash
                    </button>
                    <button
                      type="button"
                      aria-pressed={message.tag === "favorite"}
                      className="press flex min-h-tap items-center rounded-full border border-wa-line bg-surface/75 px-4 text-sm font-semibold"
                      onClick={() =>
                        void setTag(message.id, message.tag === "favorite" ? null : "favorite")
                      }
                    >
                      <span className="flex items-center gap-1.5">
                        <FavoriteStar active={message.tag === "favorite"} />
                        {message.tag === "favorite" ? "Favorite ✓" : "Favorite"}
                      </span>
                    </button>
                    {canReply && !answered && (
                      <Link
                        href={groupReplyHref(message)}
                        className="press flex min-h-tap items-center rounded-full bg-msg-action px-4 text-sm font-semibold text-msg-accent"
                      >
                        Reply
                      </Link>
                    )}
                    <Link
                      href={`/compose?forwardOf=${encodeURIComponent(message.id)}`}
                      className="press flex min-h-tap items-center rounded-full border border-wa-line bg-surface/75 px-4 text-sm font-semibold"
                    >
                      Forward
                    </Link>
                  </div>
                  {!message.mine && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] uppercase tracking-wide text-chat-meta">Tags</span>
                      {EMAIL_TAGS.filter((tag) => tag !== "favorite").map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="press min-h-9 rounded-full border border-wa-line px-3 text-[13px]"
                          onClick={() => void setTag(message.id, tag)}
                        >
                          {tag}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="press min-h-9 rounded-full border border-wa-line px-3 text-[13px]"
                        onClick={() => void setTag(message.id, null)}
                      >
                        clear
                      </button>
                    </div>
                  )}
                </div>
              }
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
            </Collapsing>
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

      {/* ROUND 4 - THE REPLAY MODEL, groups: the CREATOR does not get a free
          composer either. Their message box is the NEW MAIL button, which opens
          the multi-recipient traditional compose with the member set locked. The
          members never had a composer - their per-mail Reply buttons are the
          model - so this bar belongs to the creator alone. */}
      {isCreator && (
        <div className="sticky bottom-0 z-20 flex w-full shrink-0 flex-col gap-2 rounded-t-[28px] bg-chat-sheet px-4 pb-4 pt-3 shadow-overlay">
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
          </div>
          <Link
            href={`/compose?to=${encodeURIComponent(others.join(","))}&lockTo=1`}
            className="btn-brand w-full"
            aria-label="Start a new mail to the group (recipients locked)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New mail
          </Link>
        </div>
      )}

      {infoOpen && (
        <GroupInfo
          members={members}
          memberNames={memberNames}
          memberAddresses={memberAddresses}
          memberTags={memberTags}
          me={myNumber}
          onOpenMember={(member) => {
            setInfoOpen(false);
            setMemberSheet(member);
          }}
          onClose={() => setInfoOpen(false)}
        />
      )}

      {undo && (
        <ActionToast
          variant="mobile"
          label={undo.label}
          onUndo={() => void undoMove()}
          onExpire={() => {
            setUndo(null);
            void load(false);
          }}
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
          onSaved={(name) => {
            const index = members.indexOf(memberSheet);
            if (index >= 0) {
              setMemberNames((current) => {
                const next = [...current];
                next[index] = name;
                return next;
              });
            }
          }}
        />
      )}
    </main>
  );
}
