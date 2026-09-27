"use client";

import Link from "next/link";
import { ChatListSkeleton, ThreadSkeleton } from "@/components/skeleton";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AttachmentCards } from "@/components/attachments";
import { MemberTagChip } from "@/components/member-tag-chip";
import { isEmailFolder, type EmailFolder } from "@/lib/folders";
import type { MemberTag } from "@/lib/roles";
import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Desktop inbox - three zones: rail, thread list, reading pane.
 *
 * Selecting a thread loads it into the pane and marks it read (the same
 * endpoints mobile uses). "new-email" from the socket refreshes the list live,
 * with the 30s polling fallback; no page navigation anywhere.
 *
 * ROUND 9, TWO CHANGES.
 *
 * 1. THE TOOLBAR. Compose moved out of the chrome and into the strip above the
 *    message list, next to the folder's own name, so the action sits with the
 *    thing it acts on. The folder name is also the folder parameter the rail
 *    links with (`?folder=spam`), and the list endpoint answers it - the rail's
 *    items are the three real values of Email.folder, not decoration.
 *
 * 2. THE READING PANE IS TRADITIONAL MAIL, not chat. It used to render bubbles -
 *    aligned left and right in accent-soft - in a Gmail-shaped window, which is
 *    the one thing this client should not be: the phone app is the chat, this is
 *    the mail client. Each message is now a stacked EMAIL with its own header
 *    block (sender and role, To, the date, the subject), its full body, its
 *    attachment cards, and its own Reply action that opens the traditional
 *    compose. Groups render the same way with each sender named and their role
 *    tag beside the name. There are no bubbles anywhere in this pane.
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

/**
 * Day 6: a group conversation. /api/conversations has always returned these -
 * the desktop list simply never rendered them, which is why group mail was
 * invisible here.
 */
interface GroupThread {
  threadKey: string;
  members: string[];
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

function InboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, token, authorizedFetch } = useAuth();

  // The rail's folder links. An unknown value falls back to the inbox rather than
  // to an empty list, so a hand-typed URL still shows mail.
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [notice, setNotice] = useState<string | null>(null);

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
        // Opening a thread marks it read; refresh the list so the badge clears.
        await authorizedFetch(`/api/conversations/${phone}/read`, { method: "POST" });
        void loadThreads();
      } finally {
        setLoadingThread(false);
      }
    },
    [authorizedFetch, loadThreads],
  );

  /**
   * Day 6: open a group thread by its derived key. Same reading pane, same
   * mark-read semantics as mobile - a group thread is addressed to the whole
   * member set, and the reader only ever clears their own rows.
   */
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

  async function sendCompose(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    const response = await authorizedFetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compose),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not send the message.");
      return;
    }
    const body = (await response.json()) as { to?: string };
    setNotice(`Handed to the mail service for ${body.to ?? compose.to}.`);
    setCompose({ to: "", subject: "", body: "" });
    setComposeOpen(false);
    // The row appears when delivery completes; refresh shortly after.
    window.setTimeout(() => void loadThreads(), 2500);
  }

  /**
   * The traditional compose, opened from a message: the same screen the phone
   * client uses, prefilled with what a reply needs. In a group the thread key
   * rides along, so a reply addressed to one member still lands in the GROUP
   * conversation rather than in that member's 1:1 chat.
   */
  function replyHrefFor(message: Message): string {
    const params = new URLSearchParams({ replyTo: message.id, origSubject: message.subject });
    if (selectedGroup) {
      const others = selectedGroup.members.filter((member) => member !== phoneOf(message.from));
      params.set("to", (others.length > 0 ? others : selectedGroup.members).join(","));
      params.set("threadKey", selectedGroup.threadKey);
    } else {
      params.set("to", selectedThread?.counterpart ?? phoneOf(message.from));
    }
    params.set("quote", message.body.replace(/\s+/g, " ").slice(0, 160));
    return `/compose?${params.toString()}`;
  }

  if (status !== "authenticated") {
    return <p className="p-10 text-on-surface-variant">Loading...</p>;
  }

  return (
    <main className="flex h-screen min-w-0 flex-1 overflow-hidden">
      {/* Thread list, with the toolbar the brief asks for: the folder's name and
          the Compose action, above the message list. */}
      <section className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
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
          <button
            type="button"
            className="btn-primary ml-auto min-h-0 px-4 py-2 text-sm"
            onClick={() => {
              setSelected(null);
              setComposeOpen(true);
            }}
          >
            Compose
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingList && <ChatListSkeleton rows={5} />}
          {!loadingList && threads.length + groups.length === 0 && (
            <p className="p-4 text-on-surface-variant">Nothing in {FOLDER_TITLES[folder]}.</p>
          )}
          {groups.length > 0 && (
            <ul className="border-b-2 border-primary-container/30">
              {groups.map((group) => (
                <li key={group.threadKey} className="border-b border-outline-variant">
                  <button
                    type="button"
                    onClick={() => void openGroup(group.threadKey)}
                    className={`w-full px-4 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                      selected === group.threadKey ? "bg-surface-container-low" : ""
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate ${group.unread > 0 ? "font-bold" : "font-semibold"}`}>
                        Group -{" "}
                        {group.members
                          .map((member, index) => (group as { memberNames?: (string | null)[] }).memberNames?.[index]?.trim() || member)
                          .join(", ")}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-on-surface-variant">
                        {formatWhen(group.lastAt)}
                      </span>
                    </span>
                    <span className="block truncate text-sm">{group.subject}</span>
                    <span className="block truncate text-sm text-on-surface-variant">
                      {group.members.length} members - {group.preview}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul>
            {threads.map((thread) => (
              <li key={thread.counterpartAddress} className="border-b border-outline-variant">
                <button
                  type="button"
                  onClick={() => void openThread(thread.counterpart)}
                  className={`w-full px-4 py-3 text-left transition-colors duration-ui hover:bg-surface-container-low ${
                    selected === thread.counterpart ? "bg-surface-container-low" : ""
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate ${thread.unread > 0 ? "font-bold" : "font-semibold"}`}>
                      {thread.counterpartName?.trim() || thread.counterpart}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-on-surface-variant">{formatWhen(thread.lastAt)}</span>
                  </span>
                  <span className="block truncate text-sm">{thread.subject}</span>
                  <span className="block truncate text-sm text-on-surface-variant">{thread.preview}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Reading pane: stacked EMAILS, never bubbles. */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-container-low">
        {!selected && !composeOpen && (
          <p className="p-10 text-on-surface-variant">
            Select a conversation to read it, or write a new message.
          </p>
        )}

        {composeOpen && (
          <form className="flex max-w-3xl flex-col gap-3 p-6" onSubmit={sendCompose}>
            <h2 className="font-headline text-lg font-bold text-on-surface">New message</h2>
            <input
              className="field"
              placeholder="To (number or alias)"
              value={compose.to}
              onChange={(event) => setCompose({ ...compose, to: event.target.value })}
              required
            />
            <input
              className="field"
              placeholder="Subject"
              value={compose.subject}
              onChange={(event) => setCompose({ ...compose, subject: event.target.value })}
              required
            />
            <textarea
              className="field min-h-40 py-3"
              placeholder="Write your message"
              value={compose.body}
              onChange={(event) => setCompose({ ...compose, body: event.target.value })}
              required
            />
            <div className="flex gap-3">
              <button type="submit" className="btn-primary">
                Send
              </button>
              <button type="button" className="btn-quiet" onClick={() => setComposeOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {notice && <p className="px-6 pt-4 text-sm text-primary-container">{notice}</p>}
        {error && (
          <p className="px-6 pt-4 text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        {selected && !composeOpen && (
          <>
            <header className="border-b border-outline-variant bg-surface-container-lowest px-6 py-4">
              <h2 className="font-headline text-xl font-bold tracking-[-0.01em] text-on-surface">
                {selectedGroup
                  ? `Group - ${selectedGroup.members.join(", ")}`
                  : selectedThread?.counterpartName?.trim() || selected}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {threadSubject || selectedThread?.subject}{" "}
                {messages.length > 0 && `- ${messages.length} ${messages.length === 1 ? "message" : "messages"}`}
              </p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {loadingThread && <ThreadSkeleton bubbles={3} />}
              {!loadingThread &&
                messages.map((message) => (
                  <article
                    key={message.submissionId ?? message.id}
                    className="mb-4 rounded-card border border-outline-variant bg-surface-container-lowest shadow-card"
                  >
                    {/* The header block: who, from where, to where, when. */}
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-outline-variant px-5 py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-base font-bold text-on-surface">
                          {message.mine ? "You" : message.fromName?.trim() || phoneOf(message.from)}
                        </span>
                        {message.fromTag ? <MemberTagChip tag={message.fromTag} /> : null}
                      </span>
                      <span className="min-w-0 truncate text-xs text-outline">
                        From: {message.from}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-outline" title={formatFull(message.createdAt)}>
                        {formatFull(message.createdAt)}
                      </span>
                    </div>

                    <div className="px-5 pt-3">
                      <p className="text-xs text-outline">To: {message.to}</p>
                      <h3 className="mt-2 font-headline text-[17px] font-bold text-on-surface">
                        {message.subject}
                      </h3>
                    </div>

                    <div className="px-5 pb-4 pt-2">
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-on-surface">
                        {message.body}
                      </p>

                      <AttachmentCards attachments={message.attachments} />

                      <div className="mt-4 flex items-center gap-3">
                        <Link
                          href={replyHrefFor(message)}
                          className="inline-flex min-h-0 items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold text-accent"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 7L4 12l5 5" />
                            <path d="M4 12h9a6 6 0 0 1 6 6v1" />
                          </svg>
                          Reply
                        </Link>
                        {message.repliedAt && (
                          <span className="text-xs text-on-surface-variant">Replied</span>
                        )}
                        {message.tag && (
                          <span className="text-xs text-on-surface-variant">{message.tag}</span>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
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
