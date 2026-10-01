"use client";

import { ChatListSkeleton, ThreadSkeleton } from "@/components/skeleton";

import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ActionToast } from "@/components/action-toast";
import { AttachmentCards } from "@/components/attachments";
import { Collapsing } from "@/components/collapsing";
import { AnimatedFavoriteChip, FavoriteStar } from "@/components/favorite-star";

import { DesktopCompose, type DesktopComposeRequest } from "@/components/desktop-compose";
import { DesktopUserDetail, type DesktopUserDetailSubject } from "@/components/desktop-user-detail";
import { GroupInfo } from "@/components/group-info";
import { MemberTagChip } from "@/components/member-tag-chip";
import { isEmailFolder, type EmailFolder } from "@/lib/folders";
import type { MemberTag } from "@/lib/roles";
import { useAuth } from "@/lib/useAuth";
import { useFlipList } from "@/lib/use-flip";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Desktop inbox - three zones: rail, thread list, reading pane.
 *
 * ROUND 13, three fixes the owner's screenshot review asked for.
 *
 * 1. THE PANE NEVER OPENS WITH A COMPOSE FORM. Its default is the empty state,
 *    and it can only ever show a conversation. Compose is an OVERLAY
 *    (components/desktop-compose.tsx) summoned by the toolbar's action or by a
 *    mail's Reply - so "the pane happens to be showing a form" is no longer a
 *    state this screen can reach.
 *
 * 2. NO PHONE SCREEN ON THE DESKTOP. A mail's Reply used to navigate to
 *    /compose, which is the PHONE's compose screen: a phone-shaped screen in a
 *    laptop window. It now opens the desktop composer in reply mode, carrying the
 *    same linkage (replyToId, the group key, the locked recipients, the quoted
 *    opening) the phone path carried.
 *
 * 3. PROPORTIONS. Rail ~240px, list ~380px, the pane flexible with its content
 *    capped at a readable ~720px instead of stretching across a 1600px window -
 *    the Gmail measures, with one 1px divider between the zones.
 *
 * Everything else is unchanged: the same endpoints, the same realtime subscription,
 * the same mark-read semantics, the same folder parameter the rail links with.
 */

interface Thread {
  counterpart: string;
  counterpartName?: string | null;
  counterpartAddress: string;
  subject: string;
  preview: string;
  lastAt: string;
  unread: number;
}

interface Message {
  id: string;
  /** One value per submission: a broadcast is one bubble, not one per recipient. */
  submissionId?: string | null;
  replyToId?: string | null;
  mine: boolean;
  from: string;
  fromName?: string | null;
  fromTag?: MemberTag | null;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  repliedAt: string | null;
  tag: string | null;
  attachments?: { id: string; filename: string; contentType: string; sizeBytes: number }[] | null;
}

interface GroupThread {
  threadKey: string;
  members: string[];
  memberNames?: (string | null)[];
  memberAddresses: string[];
  subject: string;
  preview: string;
  lastAt: string;
  unread: number;
}

const FOLDER_TITLES: Record<EmailFolder, string> = {
  inbox: "Inbox",
  spam: "Spam",
  trash: "Trash",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatFull(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

/** The design system's empty-state pattern: a mark, a line, and where to go next. */
function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-hair bg-surface text-accent">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7.5l9 6 9-6" />
          <path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
        </svg>
      </span>
      <p className="font-headline text-lg font-bold text-on-surface">{title}</p>
      <p className="max-w-sm text-sm text-on-surface-variant">{hint}</p>
    </div>
  );
}

function InboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, token, user, authorizedFetch } = useAuth();

  const folderParam = searchParams?.get("folder") ?? "inbox";
  const folder: EmailFolder = isEmailFolder(folderParam) ? folderParam : "inbox";

  const [threads, setThreads] = useState<Thread[]>([]);
  const [groups, setGroups] = useState<GroupThread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadSubject, setThreadSubject] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The composer overlay's request, or null when it is closed. */
  const [composeRequest, setComposeRequest] = useState<DesktopComposeRequest | null>(null);

  /**
   * ROUND 28: the two surfaces the phone has always had, for the desktop.
   * These card the payload-fresh identity of the open conversation and the
   * group's members - the same fields the mobile thread screens keep.
   */
  const [threadIdentity, setThreadIdentity] = useState<{
    name: string | null;
    accountName: string | null;
    address: string;
  } | null>(null);
  /** ROUND 34: the group's creator (from the thread payload) - members reply
      only to their mail. */
  const [threadCreator, setThreadCreator] = useState<string | null>(null);
  const [groupDetails, setGroupDetails] = useState<{
    members: string[];
    memberNames: (string | null)[];
    memberAddresses: string[];
    memberTags: Record<string, MemberTag>;
  } | null>(null);
  /** Which user's detail modal is open, if any. */
  const [detailSubject, setDetailSubject] = useState<DesktopUserDetailSubject | null>(null);
  /** Whether the group-info card is open. */
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  /** ROUND 29: which card's action row is revealed, if any. */
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null);
  /** ROUND 31: the move-collapse machine (reading pane) + its undo toast. */
  const [collapse, setCollapse] = useState<{ id: string; phase: "closing" | "expanding" } | null>(null);
  const [undo, setUndo] = useState<{
    id: string;
    label: string;
    snapshot: Message;
    index: number;
  } | null>(null);
  const moveRef = useRef<{
    id: string;
    folder: "spam" | "trash";
    snapshot: Message;
    index: number;
    patch: "pending" | "ok" | "failed";
    collapsed: boolean;
  } | null>(null);
  /** ROUND 31: the pair row that is collapsing after a delete-chat. */
  const [leavingThread, setLeavingThread] = useState<string | null>(null);
  /** ROUND 31: the middle column settles with a FLIP when rows move. */
  const flipRef = useFlipList<HTMLUListElement>([threads, groups]);
  /** ROUND 31: the first data load staggers the first rows in. */
  const [entering, setEntering] = useState(false);
  const enteredOnce = useRef(false);
  /** ROUND 31: the id whose favorite chip just activated - its star pops once. */
  const [starPop, setStarPop] = useState<string | null>(null);

  /**
   * ROUND 22: THE SEARCH BOX. The desktop list had no search at all; this adds one,
   * backed by the same endpoint the phone uses, so both clients answer the same
   * question with the same rows. Three characters or more runs it, debounced; below
   * that the list is the list.
   */
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ kind: "pair" | "group"; key: string; label: string; subject: string; snippet: string; matches: number; href: string }>
  >([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 3) {
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

  const searching_ = query.trim().length >= 3;

  const loadThreads = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/api/conversations?folder=${folder}`);
      if (response.status === 401) {
        router.replace("/desktop");
        return;
      }
      if (!response.ok) {
        setError("Could not load the inbox.");
        return;
      }
      const body = (await response.json()) as { threads?: Thread[]; groupThreads?: GroupThread[] };
      setThreads(body.threads ?? []);
      setGroups(body.groupThreads ?? []);
      if (!enteredOnce.current) {
        enteredOnce.current = true;
        setEntering(true);
        window.setTimeout(() => setEntering(false), 900);
      }
      setError(null);
    } catch {
      setError("Network error.");
    } finally {
      setLoadingList(false);
    }
  }, [authorizedFetch, router, folder]);

  const openThread = useCallback(
    async (phone: string) => {
      setSelected(phone);
      setLoadingThread(true);
      try {
        const response = await authorizedFetch(`/api/conversations/${phone}`);
        if (!response.ok) {
          setError("Could not load that conversation.");
          return;
        }
        const body = (await response.json()) as {
          subject?: string;
          messages?: Message[];
          counterpartName?: string | null;
          counterpartAccountName?: string | null;
          counterpartAddress?: string;
        };
        setMessages(body.messages ?? []);
        setThreadSubject(body.subject ?? "");
        // ROUND 28: the counterpart's identity, kept payload-fresh for the user
        // detail modal (the same fields the phone's thread carries).
        setThreadIdentity({
          name: body.counterpartName ?? null,
          accountName: body.counterpartAccountName ?? null,
          address: body.counterpartAddress || `${phone}@phonemail.com`,
        });
        await authorizedFetch(`/api/conversations/${phone}/read`, { method: "POST" });
        void loadThreads();
      } finally {
        setLoadingThread(false);
      }
    },
    [authorizedFetch, loadThreads],
  );

  const openGroup = useCallback(
    async (threadKey: string) => {
      setSelected(threadKey);
      setLoadingThread(true);
      try {
        const response = await authorizedFetch(
          `/api/conversations/thread/${encodeURIComponent(threadKey)}`,
        );
        if (!response.ok) {
          setError("Could not load that conversation.");
          return;
        }
        const body = (await response.json()) as {
          subject?: string;
          messages?: Message[];
          members?: string[];
          memberNames?: (string | null)[];
          memberAddresses?: string[];
          memberTags?: Record<string, MemberTag>;
          creatorPhone?: string | null;
        };
        setThreadCreator(body.creatorPhone ?? null);
        setMessages(body.messages ?? []);
        setThreadSubject(body.subject ?? "");
        // ROUND 28: the member list and role tags, from the thread payload itself,
        // so the group-info card cannot disagree with the thread it describes.
        setGroupDetails({
          members: body.members ?? [],
          memberNames: body.memberNames ?? [],
          memberAddresses: body.memberAddresses ?? [],
          memberTags: body.memberTags ?? {},
        });
        await authorizedFetch(`/api/conversations/thread/${encodeURIComponent(threadKey)}/read`, {
          method: "POST",
        });
        void loadThreads();
      } finally {
        setLoadingThread(false);
      }
    },
    [authorizedFetch, loadThreads],
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      setLoadingList(true);
      setSelected(null);
      setMessages([]);
      setThreadIdentity(null);
      setGroupDetails(null);
      setDetailSubject(null);
      setGroupInfoOpen(false);
      void loadThreads();
    }
  }, [status, loadThreads]);

  const realtimeStatus = useRealtime({
    token,
    onNewEmail: () => {
      void loadThreads();
      if (selected) {
        void openThread(selected);
      }
    },
    onFallbackPoll: () => void loadThreads(),
  });

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.counterpart === selected),
    [threads, selected],
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.threadKey === selected),
    [groups, selected],
  );

  function openNewCompose() {
    setComposeRequest({ to: [], kind: "new" });
  }

  /**
   * A mail's Reply: the same linkage the phone's reply carries - the row it
   * answers, the original subject and a quoted opening, the conversation's
   * recipients locked, and the GROUP's thread key when the conversation is a
   * group so the reply lands in the group rather than in one member's 1:1 chat.
   */
  function openReplyTo(message: Message) {
    const quoted = message.body.replace(/\s+/g, " ").slice(0, 160);
    if (selectedGroup) {
      // ROUND 34: inside a group a reply is addressed to the MAIL'S AUTHOR alone -
      // the creator's mail for members - never the group or another member.
      setComposeRequest({
        to: [phoneOf(message.from)],
        subject: message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`,
        quoted,
        replyToId: message.id,
        threadKey: selectedGroup.threadKey,
        lockRecipients: true,
        kind: "reply",
      });
      return;
    }
    setComposeRequest({
      to: [selectedThread?.counterpart ?? phoneOf(message.from)],
      subject: message.subject.toLowerCase().startsWith("re:") ? message.subject : `Re: ${message.subject}`,
      quoted,
      replyToId: message.id,
      lockRecipients: true,
      kind: "reply",
    });
  }

  /**
   * ROUND 29: the phone's chevron actions, for the desktop card - the same row
   * pattern (chevron reveal; documented choice) and the SAME endpoints: spam,
   * trash and tag are PATCH /api/emails/[id] state changes - recipient-owned,
   * with Trash on your own mail being the sender's per-viewer removal
   * (follow-up 4).
   */
  function moveMessage(messageId: string, folder: "spam" | "trash") {
    setActionsOpenId(null);
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

  /** Both halves done (collapse + PATCH): the card leaves and the toast opens. */
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

  /** ROUND 31: undo = the folder goes back and the card re-expands in place. */
  async function undoMove() {
    const entry = undo;
    if (!entry) {
      return;
    }
    setUndo(null);
    setMessages((current) => {
      const next = [...current];
      next.splice(Math.min(entry.index, next.length), 0, entry.snapshot);
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
      if (selected) {
        void openThread(selected);
      }
    }
  }

  /** ROUND 31: the deleted chat's row finished collapsing - drop it for real. */
  function onThreadLeaveDone(phone: string) {
    setLeavingThread((current) => (current === phone ? null : current));
    setThreads((current) => current.filter((thread) => thread.counterpart !== phone));
    if (selected === phone) {
      setSelected(null);
      setMessages([]);
      setThreadSubject("");
      setActionsOpenId(null);
    }
  }

  /**
   * ROUND 29 follow-up 4 (the owner's request: empty the trash): one POST
   * marks every message in the caller's trash as deleted-for-recipient - the
   * same per-viewer removal the row actions use - so the trash empties for
   * its owner and nobody else's copy is touched. An open thread closes with
   * it, because its mail just left.
   */
  async function emptyTrash() {
    setError(null);
    const response = await authorizedFetch("/api/emails/empty-trash", { method: "POST" });
    if (!response.ok) {
      setError("Could not empty the trash.");
      return;
    }
    setActionsOpenId(null);
    setSelected(null);
    setMessages([]);
    void loadThreads();
  }

  /** The favorite toggle, optimistic the way the phone's is. */
  async function setMessageTag(messageId: string, tag: string | null) {
    setActionsOpenId(null);
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
      if (selected) {
        void openThread(selected);
      }
    }
  }

  /**
   * ROUND 29: Forward. The opposite lock from reply - To and Cc are FREE, the
   * subject derives as Fwd:, and the body opens with a forwarded header block
   * over the original. The source's attachments ride the server's copy;
   * forwardOfId is the only thing that has to travel.
   */
  function openForward(message: Message) {
    setActionsOpenId(null);
    const header = [
      "---------- Forwarded message ----------",
      `From: ${message.from}`,
      `Date: ${formatFull(message.createdAt)}`,
      `Subject: ${message.subject}`,
      "",
      message.body,
    ].join("\n");
    setComposeRequest({
      to: [],
      subject: message.subject.toLowerCase().startsWith("fwd:")
        ? message.subject
        : `Fwd: ${message.subject}`,
      body: header,
      forwardOfId: message.id,
      forwardAttachments: message.attachments ?? [],
      kind: "forward",
    });
  }

  /** ROUND 28: the counterpart's detail, from the reading pane's header. */
  function openCounterpartDetail() {
    if (!selected || selectedGroup) {
      return;
    }
    setDetailSubject({
      phone: selected,
      name: threadIdentity?.name?.trim() || selectedThread?.counterpartName?.trim() || null,
      accountName: threadIdentity?.accountName ?? null,
      address: threadIdentity?.address || `${selected}@phonemail.com`,
    });
  }

  /**
   * ROUND 28: a member of the group, from the group-info card. The card closes
   * first - the modal is the next thing, not a layer over it - exactly as the
   * phone's group page sequences the two.
   */
  function openMemberDetail(member: string) {
    const index = selectedGroup?.members.indexOf(member) ?? -1;
    setGroupInfoOpen(false);
    setDetailSubject({
      phone: member,
      name: index >= 0 ? (groupDetails?.memberNames[index]?.trim() ?? null) : null,
      accountName: null,
      address:
        index >= 0
          ? groupDetails?.memberAddresses[index] || `${member}@phonemail.com`
          : `${member}@phonemail.com`,
    });
  }

  /** The saved name lands on the surface that opened the modal, immediately. */
  function handleDetailSaved(name: string | null) {
    if (!detailSubject) {
      return;
    }
    if (selectedGroup) {
      const index = selectedGroup.members.indexOf(detailSubject.phone);
      if (index >= 0) {
        setGroupDetails((current) => {
          if (!current) {
            return current;
          }
          const memberNames = [...current.memberNames];
          memberNames[index] = name;
          return { ...current, memberNames };
        });
      }
      return;
    }
    if (detailSubject.phone === selected) {
      setThreadIdentity((current) => (current ? { ...current, name } : current));
    }
  }

  if (status !== "authenticated") {
    return <p className="p-10 text-on-surface-variant">Loading...</p>;
  }

  const unreadCount = threads.reduce((total, thread) => total + thread.unread, 0);

  return (
    <main className="flex h-screen min-w-0 flex-1 overflow-hidden bg-surface-container-lowest">
      {/* THE LIST: ~380px, one 1px divider, rows at the system's own height. */}
      {/* ROUND 14: the reference measures the list at ~360px, and shows NO rule under
          its header - the header is separated by the rows' own dividers instead. */}
      <section className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r border-neutral-hair">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <h1 className="font-headline text-lg font-bold tracking-[-0.01em] text-on-surface">
              {FOLDER_TITLES[folder]}
            </h1>
            {realtimeStatus !== "socket" && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-on-surface-variant"
                title={realtimeStatus}
                aria-label={`Connection: ${realtimeStatus}`}
              />
            )}
            {/* ROUND 29 follow-up 4b (the owner's report): a trash holding only
                a GROUP thread must still offer Empty trash - the first cut counted
                pairwise threads only, so exactly that case hid the button. The
                empty state below always counted both; this now matches it. */}
            {folder === "trash" && !loadingList && threads.length + groups.length > 0 && (
              <button
                type="button"
                className="ml-auto inline-flex min-h-0 shrink-0 items-center whitespace-nowrap rounded-lg border border-neutral-hair bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper"
                onClick={() => void emptyTrash()}
              >
                Empty trash
              </button>
            )}
            <button
              type="button"
              className="ml-auto inline-flex min-h-0 items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors duration-ui hover:brightness-105"
              onClick={openNewCompose}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            Compose
            </button>
          </div>

          {/* ROUND 29 (owner request): the search field moved onto its own line,
              full width, under the title and the Compose action. */}
          <input
            type="search"
            className="field mt-3 min-h-0 w-full py-1.5 text-sm"
            placeholder="Search mail"
            aria-label="Search mail"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingList && <ChatListSkeleton rows={6} />}
          {!loadingList && threads.length + groups.length === 0 && (
            <EmptyState
              title={`Nothing in ${FOLDER_TITLES[folder]}`}
              hint="Mail you receive lands here. Write to someone with Compose and the conversation appears."
            />
          )}
          {searching_ && (
            <ul aria-label="Search results">
              <li className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                {searching ? "Searching..." : `Messages (${results.length})`}
              </li>
              {results.map((result) => (
                <li key={`${result.kind}:${result.key}`}>
                  <button
                    type="button"
                    onClick={() =>
                      result.kind === "group" ? void openGroup(result.key) : void openThread(result.key)
                    }
                    className="press flex min-h-[64px] w-full flex-col justify-center gap-0.5 border-b border-outline-variant px-5 py-2 text-left transition-colors duration-ui hover:bg-surface-container-low"
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
                  </button>
                </li>
              ))}
              {!searching && results.length === 0 && (
                <li className="px-5 py-3 text-sm text-on-surface-variant">
                  No messages match &quot;{query.trim()}&quot;.
                </li>
              )}
            </ul>
          )}

          {!searching_ && (
          <ul ref={flipRef}>
            {groups.map((group) => {
              const active = selected === group.threadKey;
              const enteringRow = entering && groups.indexOf(group) < 3;
              const names = group.members
                .map((member, index) => group.memberNames?.[index]?.trim() || member)
                .join(", ");
              return (
                <li
                  key={group.threadKey}
                  data-flip-key={`group:${group.threadKey}`}
                  className={enteringRow ? `enter ${groups.indexOf(group) === 0 ? "enter-1" : groups.indexOf(group) === 1 ? "enter-2" : "enter-3"}` : ""}
                >
                  <button
                    type="button"
                    onClick={() => void openGroup(group.threadKey)}
                    aria-current={active ? "true" : undefined}
                    className={`press flex min-h-[72px] w-full flex-col justify-center gap-0.5 border-b px-5 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                      active ? "border-l-4 border-accent bg-accent-tint pl-4" : "border-neutral-hair"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[15px] ${group.unread > 0 ? "font-bold" : "font-semibold"} text-on-surface`}>
                        Group - {names}
                      </span>
                      <span className={`ml-auto shrink-0 text-xs ${active ? "text-accent" : "text-neutral-muted"}`}>{formatWhen(group.lastAt)}</span>
                    </span>
                    <span className="truncate text-sm font-medium text-on-surface">{group.subject}</span>
                    <span className="truncate text-sm text-neutral-muted">
                      {group.members.length} members - {group.preview}
                    </span>
                  </button>
                </li>
              );
            })}
            {threads.map((thread) => {
              const active = selected === thread.counterpart;
              const enteringRow = entering && threads.indexOf(thread) < 3;
              return (
                <li
                  key={thread.counterpartAddress}
                  data-flip-key={`pair:${thread.counterpart}`}
                  className={enteringRow ? `enter ${threads.indexOf(thread) === 0 ? "enter-1" : threads.indexOf(thread) === 1 ? "enter-2" : "enter-3"}` : ""}
                >
                  <Collapsing
                    phase={leavingThread === thread.counterpart ? "closing" : "idle"}
                    onDone={() => onThreadLeaveDone(thread.counterpart)}
                  >
                  <button
                    type="button"
                    onClick={() => void openThread(thread.counterpart)}
                    aria-current={active ? "true" : undefined}
                    className={`press flex min-h-[72px] w-full flex-col justify-center gap-0.5 border-b px-5 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                      active ? "border-l-4 border-accent bg-accent-tint pl-4" : "border-neutral-hair"
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[15px] ${thread.unread > 0 ? "font-bold" : "font-semibold"} text-on-surface`}>
                        {thread.counterpartName?.trim() || thread.counterpart}
                      </span>
                      <span className={`ml-auto shrink-0 text-xs ${active ? "text-accent" : "text-neutral-muted"}`}>{formatWhen(thread.lastAt)}</span>
                    </span>
                    <span className="truncate text-sm font-medium text-on-surface">{thread.subject}</span>
                    <span className="truncate text-sm text-neutral-muted">{thread.preview}</span>
                  </button>
                  </Collapsing>
                </li>
              );
            })}
          </ul>
          )}
        </div>
      </section>

      {/* THE READING PANE: flexible, with the content capped at a readable width.
          Its default is the empty state - never a form. */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-paper">
        {notice && (
          <p className="border-b border-outline-variant bg-surface-container-lowest px-6 py-2 text-sm text-accent" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="border-b border-outline-variant bg-surface-container-lowest px-6 py-2 text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        {!selected && (
          <EmptyState
            title="Select a conversation"
            hint={
              unreadCount > 0
                ? `You have ${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}. Pick one from the list, or start a new one with Compose.`
                : "Pick a conversation from the list, or start a new one with Compose."
            }
          />
        )}

        {selected && (
          <>
            <header className="border-b border-neutral-hair bg-surface px-8 py-4">
              <div className="mx-auto max-w-[720px]">
                <h2 className="font-headline text-xl font-bold tracking-[-0.01em] text-on-surface">
                  {selectedGroup ? (
                    <button
                      type="button"
                      onClick={() => setGroupInfoOpen(true)}
                      aria-label="Group details"
                      className="rounded-card text-left transition-colors duration-ui hover:text-accent"
                    >
                      {`Group - ${selectedGroup.members.join(", ")}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={openCounterpartDetail}
                      aria-label={`Details for ${threadIdentity?.name?.trim() || selectedThread?.counterpartName?.trim() || selected}`}
                      className="rounded-card text-left transition-colors duration-ui hover:text-accent"
                    >
                      {threadIdentity?.name?.trim() || selectedThread?.counterpartName?.trim() || selected}
                    </button>
                  )}
                </h2>
                <p className="text-sm text-on-surface-variant">
                  {threadSubject || selectedThread?.subject}{" "}
                  {messages.length > 0 && `- ${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
              {loadingThread && <ThreadSkeleton bubbles={3} />}
              {!loadingThread && messages.length === 0 && (
                <EmptyState title="No messages yet" hint="This conversation is empty." />
              )}
              <div className="mx-auto max-w-[720px]">
                {!loadingThread &&
                  messages.map((message) => (
                    <Collapsing
                      key={message.submissionId ?? message.id}
                      data-message-id={message.id}
                      phase={collapse && collapse.id === message.id ? collapse.phase : "idle"}
                      onDone={onCollapseDone}
                    >
                    <article
                      /* ROUND 32 (the owner): my own mail is visually MINE on the
                         desktop too - the same outgoing token the phone's bubble
                         wears, adapted to the card. Received mail is unchanged. */
                      className={`mb-4 rounded-lg border border-neutral-hair ${message.mine ? "bg-chat-out" : "bg-surface"}`}
                    >
                      {/* ROUND 28.5: the design's two-row card header - the name with its role chip, then the address this mail arrived through and the time. */}
                      <div className="border-b border-neutral-hair px-6 pb-4 pt-5">
                        <div className="flex items-center gap-3">
                          {/* ROUND 30: the sender's name opens their detail modal -
                              the desktop mail card's own "who is this?" door. */}
                          {message.mine ? (
                            <span className="truncate text-[15px] font-bold text-on-surface">You</span>
                          ) : (
                            <button
                              type="button"
                              className="truncate text-left text-[15px] font-bold text-on-surface transition-colors duration-ui hover:text-accent"
                              onClick={() =>
                                setDetailSubject({
                                  phone: phoneOf(message.from),
                                  name: message.fromName?.trim() || null,
                                  accountName: null,
                                  address: message.from,
                                })
                              }
                            >
                              {message.fromName?.trim() || phoneOf(message.from)}
                            </button>
                          )}
                          {message.fromTag ? <MemberTagChip tag={message.fromTag} tone="frame" /> : null}
                        </div>
                        <div className="mt-1 flex items-baseline gap-3">
                          <span className="min-w-0 truncate text-xs text-neutral-body">via {message.from}</span>
                          <span className="ml-auto shrink-0 text-xs text-neutral-muted" title={formatFull(message.createdAt)}>
                            {formatFull(message.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* BUG 1 FIX: the subject belongs to the MAIL, not only to the
                          conversation header. Every card names what it is about, so a
                          stacked thread can be read card by card without referring back
                          to the top of the pane. */}
                      <h3 className="px-6 pt-4 font-headline text-[18px] font-bold leading-snug text-on-surface">
                        {message.subject}
                      </h3>

                      <div className="px-6 pb-6 pt-1">
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-on-surface-variant">
                          {message.body}
                        </p>

                        <AttachmentCards attachments={message.attachments} />

                        <div className="mt-4 flex items-center gap-3">
                          {/* ROUND 34: members answer the creator's mail only;
                              nobody answers their own, and the answered mail says
                              "Replied" instead. */}
                          {!message.mine &&
                            !message.repliedAt &&
                            (!selectedGroup ||
                              (threadCreator !== null &&
                                String(message.from).startsWith(`${threadCreator}@`))) && (
                              <button
                                type="button"
                                className="press inline-flex min-h-0 items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-semibold text-accent transition-colors duration-ui hover:bg-accent-tint"
                                onClick={() => openReplyTo(message)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M9 7L4 12l5 5" />
                                  <path d="M4 12h9a6 6 0 0 1 6 6v1" />
                                </svg>
                                Reply
                              </button>
                            )}
                          {message.repliedAt && <span className="text-xs text-on-surface-variant">Replied</span>}
                          {message.tag === "favorite" ? (
                            <AnimatedFavoriteChip show pop={starPop === message.id} />
                          ) : message.tag ? (
                            <span className="text-xs text-on-surface-variant">{message.tag}</span>
                          ) : null}
                          {/* ROUND 29: the phone's action row, revealed by the same
                              chevron (the pattern choice, documented: it is the phone's
                              own, so the two clients teach one gesture). EVERY card
                              carries it - on your own mail it opens the actions that
                              are yours (Trash, Favorite, Forward). */}
                          <button
                            type="button"
                              className="press ml-auto inline-flex min-h-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-on-surface-variant transition-colors duration-ui hover:bg-surface-container-low"
                              aria-expanded={actionsOpenId === message.id}
                              aria-label={`More actions for ${message.subject}`}
                              onClick={() =>
                                setActionsOpenId(actionsOpenId === message.id ? null : message.id)
                              }
                            >
                              Actions
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={actionsOpenId === message.id ? "rotate-180" : undefined}>
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                          </button>
                        </div>

                        {actionsOpenId === message.id && (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-hair pt-3">
                            {/* ROUND 29 follow-up 4 (the owner's correction): the row
                                is on EVERY card. On your own mail, Trash removes the
                                message from YOUR views (the row's folder belongs to
                                the recipient); Spam is gone from sent mail, and
                                Favorite labels it. Forward is below, on every
                                card. */}
                            {message.mine ? (
                              <>
                                <button type="button" className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => void moveMessage(message.id, "trash")}>
                                  Move to Trash
                                </button>
                                <button type="button" aria-pressed={message.tag === "favorite"} className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => void setMessageTag(message.id, message.tag === "favorite" ? null : "favorite")}>
                                  <span className="flex items-center gap-1.5">
                                    <FavoriteStar active={message.tag === "favorite"} />
                                    {message.tag === "favorite" ? "Favorite ✓" : "Favorite"}
                                  </span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => void moveMessage(message.id, "spam")}>
                                  Move to Spam
                                </button>
                                <button type="button" className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => void moveMessage(message.id, "trash")}>
                                  Move to Trash
                                </button>
                                <button type="button" aria-pressed={message.tag === "favorite"} className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => void setMessageTag(message.id, message.tag === "favorite" ? null : "favorite")}>
                                  <span className="flex items-center gap-1.5">
                                    <FavoriteStar active={message.tag === "favorite"} />
                                    {message.tag === "favorite" ? "Favorite ✓" : "Favorite"}
                                  </span>
                                </button>
                              </>
                            )}
                            <button type="button" className="press flex min-h-tap items-center rounded-lg border border-neutral-hair bg-surface px-4 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-paper" onClick={() => openForward(message)}>
                              Forward
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                    </Collapsing>
                  ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ROUND 28: the phone's two "who is this?" surfaces, wired into the
          desktop reading pane - the group-info card and the user-detail modal. */}
      {groupInfoOpen && selectedGroup && (
        <GroupInfo
          variant="card"
          members={groupDetails?.members ?? selectedGroup.members}
          memberNames={groupDetails?.memberNames ?? selectedGroup.memberNames ?? []}
          memberAddresses={groupDetails?.memberAddresses ?? selectedGroup.memberAddresses}
          memberTags={groupDetails?.memberTags ?? {}}
          me={user?.phoneNumber ?? ""}
          onOpenMember={openMemberDetail}
          onClose={() => setGroupInfoOpen(false)}
        />
      )}

      {undo && (
        <ActionToast
          variant="desktop"
          label={undo.label}
          onUndo={() => void undoMove()}
          onExpire={() => {
            setUndo(null);
            if (selected) {
              void openThread(selected);
            }
            void loadThreads();
          }}
        />
      )}

      {detailSubject && (
        <DesktopUserDetail
          subject={detailSubject}
          onClose={() => setDetailSubject(null)}
          onSaved={handleDetailSaved}
          onChatDeleted={() => {
            const phone = detailSubject?.phone;
            if (phone) {
              setLeavingThread(phone);
            }
          }}
        />
      )}

      {/* THE COMPOSER, an overlay - never a pane default. */}
      {composeRequest && (
        <DesktopCompose
          request={composeRequest}
          onClose={() => setComposeRequest(null)}
          onSent={(message) => {
            setNotice(message);
            window.setTimeout(() => void loadThreads(), 2500);
          }}
        />
      )}
    </main>
  );
}

export default function DesktopInboxPage() {
  // useSearchParams needs a Suspense boundary when the route is prerendered.
  return (
    <Suspense fallback={<p className="p-10 text-on-surface-variant">Loading...</p>}>
      <InboxInner />
    </Suspense>
  );
}
