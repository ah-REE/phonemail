"use client";

import { guardRedirect } from "@/lib/entry";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Spinner } from "@/components/spinner";
import type { DeviceKind } from "@/lib/device";
import { useAuth } from "@/lib/useAuth";

/**
 * SIGNED-IN DEVICES, on the phone - its own screen (round 29 follow-up 3, the
 * owner's request): the list moved out of Profile and each row now leads with
 * the device's own glyph (phone, tablet, desktop - lib/device's kind), so a
 * glance down the list is shapes, not strings.
 *
 * The same endpoints as every client (`/api/sessions`, `DELETE /api/sessions/:id`)
 * and the same logout semantics the profile section always had: another device
 * loses its token; THIS device signs out and returns to the door.
 */

interface Session {
  id: string;
  device: string;
  kind: DeviceKind;
  current: boolean;
  createdAt: string;
  lastActive: string;
}

export default function MobileDevicesPage() {
  const router = useRouter();
  const { status, authorizedFetch, signOut } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loggingOutId, setLoggingOutId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      guardRedirect(router);
    }
  }, [status, router]);

  const loadSessions = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/sessions");
      if (!response.ok) {
        setSessionsError("Could not read your signed-in devices.");
        return;
      }
      const body = (await response.json()) as { sessions?: Session[] };
      setSessions(body.sessions ?? []);
      setSessionsError(null);
    } catch {
      setSessionsError("Network error.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadSessions();
    }
  }, [status, loadSessions]);

  /**
   * Log ONE device out by deleting its session. Deleting the row is what ends
   * that token: the next request from that device is refused. When it is THIS
   * device, the client clears its own session and returns to the door, which is
   * what signing out has always done.
   */
  async function logOutDevice(session: Session) {
    setLoggingOutId(session.id);
    try {
      const response = await authorizedFetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      if (session.current || response.status === 401) {
        signOut();
        router.push("/onboarding");
        return;
      }
      if (response.ok) {
        await loadSessions();
      }
    } finally {
      setLoggingOutId(null);
    }
  }

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-chat-sheet">
        <Spinner label="Opening" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chat-sheet pb-24">
      <AppBar title="Signed-in devices" backHref="/profile" />
      <section className="px-4 pt-4">
        <SectionHeading>Signed-in devices</SectionHeading>
        <Card>
          {sessionsError ? (
            <p className="px-4 py-3 text-sm text-wa-alert" role="alert">
              {sessionsError}
            </p>
          ) : null}
          {sessions.length === 0 && !sessionsError ? (
            <p className="px-4 py-3 text-sm text-settings-quiet">Reading your devices...</p>
          ) : null}
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3"
            >
              <DeviceGlyph kind={session.kind} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[17px] font-semibold text-settings-ink">
                    {session.device}
                  </span>
                  {session.current ? (
                    <span className="shrink-0 rounded-full bg-settings-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-settings-quiet">
                      This device
                    </span>
                  ) : null}
                </span>
                <span className="text-[13px] text-settings-quiet">
                  Signed in {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
                  {session.lastActive}
                </span>
              </span>
              <button
                type="button"
                className="min-h-0 shrink-0 rounded-full bg-settings-pill px-4 py-2 text-[14px] font-semibold text-settings-ink disabled:opacity-60"
                disabled={loggingOutId === session.id}
                onClick={() => void logOutDevice(session)}
              >
                {loggingOutId === session.id ? "Logging out..." : "Log out"}
              </button>
            </div>
          ))}
        </Card>
        <p className="mt-3 px-1 text-[13px] text-settings-quiet">
          Every sign-in is a device; logging one out ends only that device&apos;s session.
        </p>
      </section>
    </div>
  );
}

/** The local row grammar the profile screen established: heading, card, glyph. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-settings-faint">
      {children}
    </h3>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-settings-hair bg-settings-card">
      {children}
    </div>
  );
}

function DeviceGlyph({ kind }: { kind: DeviceKind }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "phone") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-settings-quiet" {...stroke} aria-hidden="true">
        <rect x="7.5" y="2.5" width="9" height="19" rx="2.5" />
        <path d="M10.5 5.5h3M11 18.5h2" />
      </svg>
    );
  }
  if (kind === "tablet") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-settings-quiet" {...stroke} aria-hidden="true">
        <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
        <path d="M10 6.5h4M11.2 18h1.6" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="shrink-0 text-settings-quiet" {...stroke} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}
