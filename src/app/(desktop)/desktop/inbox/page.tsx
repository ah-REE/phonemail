"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";
import { useRealtime } from "@/lib/useRealtime";

/**
 * Desktop inbox — three zones: rail, thread list, reading pane.
 *
 * Selecting a thread loads it into the pane and marks it read (the same
 * endpoints mobile uses). "new-email" from the socket refreshes the list live,
 * with the 30s polling fallback; no page navigation anywhere.
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
  mine: boolean;
  from: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  repliedAt: string | null;
  tag: string | null;
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

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function DesktopInboxPage() {
  const router = useRouter();
  const { status, token, authorizedFetch } = useAuth();

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
      const response = await authorizedFetch("/api/conversations");
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
  }, [authorizedFetch, router]);

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

  if (status !== "authenticated") {
    return <p className="p-10 text-wa-muted">Loading…</p>;
  }

  return (
    <main className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Left rail */}
      <nav className="flex w-56 flex-col gap-2 border-r border-wa-line bg-wa-panel p-4">
        <button type="button" className="btn-primary w-full" onClick={() => setComposeOpen(true)}>
          Compose
        </button>
        <span className="mt-2 rounded-card bg-wa-bg px-3 py-2 text-sm font-semibold text-wa-ink">Inbox</span>
        <span className="px-3 py-2 text-sm text-wa-muted">Live: {realtimeStatus}</span>
      </nav>

      {/* Thread list */}
      <section className="flex w-96 flex-col overflow-y-auto border-r border-wa-line bg-wa-panel">
        <h1 className="border-b border-wa-line px-4 py-3 text-lg font-semibold">Inbox</h1>
        {loadingList && <p className="p-4 text-wa-muted">Loading…</p>}
        {!loadingList && threads.length + groups.length === 0 && (
          <p className="p-4 text-wa-muted">No conversations yet.</p>
        )}
        {groups.length > 0 && (
          <ul className="border-b-2 border-wa-teal/30">
            {groups.map((group) => (
              <li key={group.threadKey} className="border-b border-wa-line">
                <button
                  type="button"
                  onClick={() => void openGroup(group.threadKey)}
                  className={`w-full px-4 py-3 text-left transition-colors duration-ui hover:bg-wa-bg ${
                    selected === group.threadKey ? "bg-wa-bg" : ""
                  }`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate ${group.unread > 0 ? "font-bold" : "font-semibold"}`}>
                      Group -{" "}
                      {group.members
                        .map((member, index) => (group as { memberNames?: (string | null)[] }).memberNames?.[index]?.trim() || member)
                        .join(", ")}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-wa-muted">
                      {formatWhen(group.lastAt)}
                    </span>
                  </span>
                  <span className="block truncate text-sm">{group.subject}</span>
                  <span className="block truncate text-sm text-wa-muted">
                    {group.members.length} members - {group.preview}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul>
          {threads.map((thread) => (
            <li key={thread.counterpartAddress} className="border-b border-wa-line">
              <button
                type="button"
                onClick={() => void openThread(thread.counterpart)}
                className={`w-full px-4 py-3 text-left transition-colors duration-ui hover:bg-wa-bg ${
                  selected === thread.counterpart ? "bg-wa-bg" : ""
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className={`truncate ${thread.unread > 0 ? "font-bold" : "font-semibold"}`}>
                    {thread.counterpartName?.trim() || thread.counterpart}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-wa-muted">{formatWhen(thread.lastAt)}</span>
                </span>
                <span className="block truncate text-sm">{thread.subject}</span>
                <span className="block truncate text-sm text-wa-muted">{thread.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Reading pane */}
      <section className="flex flex-1 flex-col overflow-hidden bg-wa-panel">
        {!selected && !composeOpen && (
          <p className="p-10 text-wa-muted">Select a conversation to read it.</p>
        )}
        {composeOpen && (
          <form className="flex max-w-3xl flex-col gap-3 p-6" onSubmit={sendCompose}>
            <h2 className="text-lg font-semibold">New message</h2>
            <input
              className="field"
              placeholder="To (9876543210)"
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
        {notice && <p className="px-6 text-sm text-wa-teal">{notice}</p>}
        {error && (
          <p className="px-6 text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        {selected && !composeOpen && (
          <>
            <header className="border-b border-wa-line px-6 py-4">
              <h2 className="text-xl font-semibold">
                {selectedGroup
                  ? `Group - ${selectedGroup.members.join(", ")}`
                  : selectedThread?.counterpartName?.trim() || selected}
              </h2>
              <p className="text-sm text-wa-muted">{threadSubject || selectedThread?.subject}</p>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingThread && <p className="text-wa-muted">Loading…</p>}
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`mb-4 rounded-card border p-4 ${
                    message.mine ? "ml-auto max-w-[75%] border-wa-teal/20 bg-wa-bubble" : "max-w-[75%] border-wa-line"
                  }`}
                >
                  <p className="text-xs text-wa-muted">
                    {message.from} · {formatWhen(message.createdAt)}
                    {message.tag ? ` · ${message.tag}` : ""}
                    {message.repliedAt ? " · replied" : ""}
                  </p>
                  <p className="mt-1 text-base font-semibold">{message.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-base">{message.body}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
