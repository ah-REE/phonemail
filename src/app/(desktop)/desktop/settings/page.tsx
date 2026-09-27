"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FONT_SIZES, applyFontSize, readFontSize, type FontSizeId } from "@/lib/fontSize";
import { useAuth } from "@/lib/useAuth";

/**
 * Desktop settings. Both controls are visual placeholders for Day 6/7 work:
 * the language selector has no other locale to switch to yet, and the
 * notification toggle is not yet wired to a preference — it is labelled as such
 * rather than pretending.
 */
export default function DesktopSettingsPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [notifications, setNotifications] = useState(true);
  // The same display preference the phone's settings carry: one system, one number,
  // applied by the head script before first paint.
  const [fontSize, setFontSize] = useState<FontSizeId>("normal");

  useEffect(() => {
    setFontSize(readFontSize());
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return <p className="p-10 text-on-surface-variant">Loading…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="font-headline text-2xl font-bold tracking-[-0.015em] text-on-surface">Settings</h1>
      <div className="surface mt-6 flex items-center justify-between gap-6 p-5">
        <div>
          <p className="font-semibold">Font size</p>
          <p className="text-sm text-on-surface-variant">
            Scales the whole interface. Remembered on this device.
          </p>
        </div>
        <select
          aria-label="Font size"
          className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface"
          value={fontSize}
          onChange={(event) => {
            const next = event.target.value as FontSizeId;
            setFontSize(next);
            applyFontSize(next);
          }}
        >
          {FONT_SIZES.map((size) => (
            <option key={size.id} value={size.id}>
              {size.label}
            </option>
          ))}
        </select>
      </div>
      <div className="surface mt-6 p-5">
        <p className="font-semibold">Language</p>
        <p className="text-sm text-on-surface-variant">English (more languages land with the translations).</p>
      </div>
      <div className="surface mt-4 flex items-center justify-between p-5">
        <div>
          <p className="font-semibold">Notify me about new mail by SMS</p>
          <p className="text-sm text-on-surface-variant">
            Visual only for now — server side notifications are sent automatically and are not yet
            switchable per account.
          </p>
        </div>
        <input
          type="checkbox"
          className="h-6 w-6"
          checked={notifications}
          onChange={(event) => setNotifications(event.target.checked)}
          aria-label="Notify me about new mail by SMS"
        />
      </div>
    </main>
  );
}