"use client";

import { ChatListSkeleton, ThreadSkeleton } from "@/components/skeleton";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AttachmentCards } from "@/components/attachments";
import { Avatar } from "@/components/avatar";
import { DesktopCompose, type DesktopComposeRequest } from "@/components/desktop-compose";
import { MemberTagChip } from "@/components/member-tag-chip";
import { isEmailFolder, type EmailFolder } from "@/lib/folders";
import type { MemberTag } from "@/lib/roles";
import { useAuth } from "@/lib/useAuth";
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
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7.5l9 6 9-6" />
          <path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
        </svg>
      </span>
      <p className="font-headline text-base font-bold text-on-surface">{title}</p>
      <p className="max-w-sm text-sm text-on-surface-variant">{hint}</p>
    </div>
  );
}

function InboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, token, authorizedFetch } = useAuth();

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
        const body = (await response.json()) as { subject?: string; messages?: Message[] };
        setMessages(body.messages ?? []);
        setThreadSubject(body.subject ?? "");
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
        const body = (await response.json()) as { subject?: string; messages?: Message[] };
        setMessages(body.messages ?? []);
        setThreadSubject(body.subject ?? "");
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
      const others = selectedGroup.members.filter((member) => member !== phoneOf(message.from));
      setComposeRequest({
        to: others.length > 0 ? others : selectedGroup.members,
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

  if (status !== "authenticated") {
    return <p className="p-10 text-on-surface-variant">Loading...</p>;
  }

  const unreadCount = threads.reduce((total, thread) => total + thread.unread, 0);

  return (
    <main className="flex h-screen min-w-0 flex-1 overflow-hidden bg-surface-container-lowest">
      {/* THE LIST: ~380px, one 1px divider, rows at the system's own height. */}
      {/* ROUND 14: the reference measures the list at ~360px, and shows NO rule under
          its header - the header is separated by the rows' own dividers instead. */}
      <section className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r border-outline-variant">
        <div className="flex items-center gap-3 px-5 py-4">
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
          <button type="button" className="btn-brand ml-auto min-h-0 px-4 py-2 text-sm" onClick={openNewCompose}>
            Compose
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingList && <ChatListSkeleton rows={6} />}
          {!loadingList && threads.length + groups.length === 0 && (
            <EmptyState
              title={`Nothing in ${FOLDER_TITLES[folder]}`}
              hint="Mail you receive lands here. Write to someone with Compose and the conversation appears."
            />
          )}
          <ul>
            {groups.map((group) => {
              const active = selected === group.threadKey;
              const names = group.members
                .map((member, index) => group.memberNames?.[index]?.trim() || member)
                .join(", ");
              return (
                <li key={group.threadKey}>
                  <button
                    type="button"
                    onClick={() => void openGroup(group.threadKey)}
                    aria-current={active ? "true" : undefined}
                    className={`flex min-h-[72px] w-full flex-col justify-center gap-0.5 border-b border-outline-variant px-5 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                      active ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[15px] ${group.unread > 0 ? "font-bold" : "font-semibold"} text-on-surface`}>
                        Group - {names}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-on-surface-variant">{formatWhen(group.lastAt)}</span>
                    </span>
                    <span className="truncate text-sm font-medium text-on-surface">{group.subject}</span>
                    <span className="truncate text-sm text-on-surface-variant">
                      {group.members.length} members - {group.preview}
                    </span>
                  </button>
                </li>
              );
            })}
            {threads.map((thread) => {
              const active = selected === thread.counterpart;
              return (
                <li key={thread.counterpartAddress}>
                  <button
                    type="button"
                    onClick={() => void openThread(thread.counterpart)}
                    aria-current={active ? "true" : undefined}
                    className={`flex min-h-[72px] w-full flex-col justify-center gap-0.5 border-b border-outline-variant px-5 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                      active ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[15px] ${thread.unread > 0 ? "font-bold" : "font-semibold"} text-on-surface`}>
                        {thread.counterpartName?.trim() || thread.counterpart}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-on-surface-variant">{formatWhen(thread.lastAt)}</span>
                    </span>
                    <span className="truncate text-sm font-medium text-on-surface">{thread.subject}</span>
                    <span className="truncate text-sm text-on-surface-variant">{thread.preview}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* THE READING PANE: flexible, with the content capped at a readable width.
          Its default is the empty state - never a form. */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-container-low">
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
            <header className="border-b border-outline-variant bg-surface-container-lowest px-8 py-4">
              <div className="mx-auto max-w-[720px]">
                <h2 className="font-headline text-xl font-bold tracking-[-0.01em] text-on-surface">
                  {selectedGroup
                    ? `Group - ${selectedGroup.members.join(", ")}`
                    : selectedThread?.counterpartName?.trim() || selected}
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
                    <article
                      key={message.submissionId ?? message.id}
                      className="mb-4 rounded-card border border-outline-variant bg-surface-container-lowest shadow-card"
                    >
                      {/* The reference's header line: a small avatar, the sender's name in
                          bold, their address in grey beside it, and the date on the right -
                          with no "From:"/"To:" labels and NO repeated subject, because the
                          pane's own header already names the conversation. The member role
                          chip rides with the name, as it does on the phone. */}
                      <div className="flex items-center gap-3 border-b border-outline-variant px-5 py-3">
                        <span className="shrink-0">
                          <Avatar size={36} />
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-bold text-on-surface">
                            {message.mine ? "You" : message.fromName?.trim() || phoneOf(message.from)}
                          </span>
                          {message.fromTag ? <MemberTagChip tag={message.fromTag} /> : null}
                          <span className="min-w-0 truncate text-sm text-outline">&lt;{message.from}&gt;</span>
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-outline" title={formatFull(message.createdAt)}>
                          {formatFull(message.createdAt)}
                        </span>
                      </div>

                      <p className="px-5 pt-3 text-xs text-on-surface-variant">
                        to {message.to} ▾ · from {message.from}
                      </p>

                      {/* BUG 1 FIX: the subject belongs to the MAIL, not only to the
                          conversation header. Every card names what it is about, so a
                          stacked thread can be read card by card without referring back
                          to the top of the pane. */}
                      <h3 className="px-5 pt-2 font-headline text-[17px] font-bold leading-snug text-on-surface">
                        {message.subject}
                      </h3>

                      <div className="px-5 pb-4 pt-1">
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-on-surface">
                          {message.body}
                        </p>

                        <AttachmentCards attachments={message.attachments} />

                        <div className="mt-4 flex items-center gap-3">
                          <button
                            type="button"
                            className="inline-flex min-h-0 items-center gap-2 rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-on-surface transition-colors duration-ui hover:bg-surface-container-low"
                            onClick={() => openReplyTo(message)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M9 7L4 12l5 5" />
                              <path d="M4 12h9a6 6 0 0 1 6 6v1" />
                            </svg>
                            Reply
                          </button>
                          {message.repliedAt && <span className="text-xs text-on-surface-variant">Replied</span>}
                          {message.tag && <span className="text-xs text-on-surface-variant">{message.tag}</span>}
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
          </>
        )}
      </section>

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
