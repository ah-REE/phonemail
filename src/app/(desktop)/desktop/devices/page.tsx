"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/spinner";
import type { DeviceKind } from "@/lib/device";
import { useAuth } from "@/lib/useAuth";

/**
 * SIGNED-IN DEVICES - its own page (round 29 follow-up 3, the owner's request).
 *
 * The list used to sit inside Settings; the owner asked for it on a page of its
 * own, drawn with interactive device icons. Each session is a TILE: a glyph for
 * the device's shape (phone, tablet, desktop - from lib/device's kind), the
 * readable label, when it was last active, and the "This device" mark where it
 * applies. Clicking a tile selects it and opens the detail strip below; the strip
 * is where a device is signed out. The current device is never signed out from
 * here - the strip says so instead, because ending the session you are reading
 * from is the login door's job, not a stray click on a tile's.
 *
 * Same endpoints as every client (`/api/sessions`, `DELETE /api/sessions/:id`);
 * only the chrome differs.
 */

interface Device {
  id: string;
  device: string;
  kind: DeviceKind;
  current: boolean;
  createdAt: string;
  lastActive: string;
}

export default function DesktopDevicesPage() {
  const router = useRouter();
  const { status, authorizedFetch } = useAuth();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/sessions");
      if (!response.ok) {
        setError("Could not read your signed-in devices.");
        return;
      }
      const body = (await response.json()) as { sessions?: Device[] };
      setDevices(body.sessions ?? []);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (status === "authenticated") {
      void load();
    }
  }, [status, load]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  const selected = devices.find((device) => device.id === selectedId) ?? null;

  async function logOutDevice(device: Device) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/sessions/${device.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not sign that device out.");
        return;
      }
      setNotice(`Signed out ${device.device}.`);
      setSelectedId(null);
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen overflow-y-auto bg-paper">
      <div className="mx-auto max-w-[760px] p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          <Link href="/desktop/settings" className="underline">
            Settings
          </Link>
        </p>
        <h1 className="mt-1 font-headline text-2xl font-bold tracking-[-0.015em] text-on-surface">
          Signed-in devices
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Every sign-in is a device. Pick one to see when it signed in and to end its token -
          logging a device out ends only that device&apos;s session.
        </p>

        {notice && (
          <p className="mt-4 text-sm text-accent" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="mt-4 text-sm text-wa-alert" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          {devices.map((device) => (
            <button
              key={device.id}
              type="button"
              aria-pressed={selectedId === device.id}
              aria-label={device.current ? `${device.device} (this device)` : device.device}
              onClick={() => {
                setSelectedId(selectedId === device.id ? null : device.id);
                setNotice(null);
                setError(null);
              }}
              className={`flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-card border px-4 py-5 text-center transition-colors duration-ui ${
                selectedId === device.id
                  ? "border-accent bg-accent-tint"
                  : "border-neutral-hair bg-surface hover:bg-paper"
              }`}
            >
              <DeviceGlyph kind={device.kind} />
              <span className="w-full truncate text-sm font-semibold text-on-surface">{device.device}</span>
              <span className="text-xs text-neutral-muted">{device.lastActive}</span>
              {device.current && (
                <span className="rounded-full border border-neutral-hair bg-paper px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  This device
                </span>
              )}
            </button>
          ))}
        </div>
        {devices.length === 0 && !error && (
          <p className="mt-6 text-sm text-on-surface-variant">Reading your devices...</p>
        )}

        {selected && (
          <div className="mt-6 rounded-card border border-neutral-hair bg-surface p-5">
            <div className="flex items-center gap-4">
              <DeviceGlyph kind={selected.kind} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-on-surface">{selected.device}</p>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  Signed in {new Date(selected.createdAt).toLocaleString()} - {selected.lastActive}
                </p>
              </div>
              {selected.current ? (
                <span className="shrink-0 text-xs font-semibold text-accent">This device</span>
              ) : (
                <button
                  type="button"
                  className="btn-quiet min-h-0 shrink-0 px-4 py-2 text-sm"
                  onClick={() => void logOutDevice(selected)}
                  disabled={busy}
                >
                  {busy ? <Spinner label="Signing out" /> : "Log out this device"}
                </button>
              )}
            </div>
            {selected.current && (
              <p className="mt-3 text-xs text-neutral-muted">
                The device you are using right now - this page is being read from it. Signing it out is the
                login door&apos;s job, not a tile&apos;s.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

/** The three glyphs a device tile can draw. Tokens only; sized for the tile. */
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
      <svg width="34" height="34" viewBox="0 0 24 24" className="text-accent" {...stroke} aria-hidden="true">
        <rect x="7.5" y="2.5" width="9" height="19" rx="2.5" />
        <path d="M10.5 5.5h3M11 18.5h2" />
      </svg>
    );
  }
  if (kind === "tablet") {
    return (
      <svg width="34" height="34" viewBox="0 0 24 24" className="text-accent" {...stroke} aria-hidden="true">
        <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
        <path d="M10 6.5h4M11.2 18h1.6" />
      </svg>
    );
  }
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" className="text-accent" {...stroke} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}
