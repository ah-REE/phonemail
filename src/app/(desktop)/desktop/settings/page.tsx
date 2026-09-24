"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return <p className="p-10 text-wa-muted">Loading…</p>;
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="surface mt-6 p-5">
        <p className="font-semibold">Language</p>
        <p className="text-sm text-wa-muted">English (more languages land with the translations).</p>
      </div>
      <div className="surface mt-4 flex items-center justify-between p-5">
        <div>
          <p className="font-semibold">Notify me about new mail by SMS</p>
          <p className="text-sm text-wa-muted">
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