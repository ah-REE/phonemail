"use client";

import { AppBar } from "@/components/app-bar";

/**
 * Placeholder screens reached from the home menu / profile icon.
 * Days 4-5 build the real Drafts, Spam, Trash and Profile screens; these exist
 * now so every control on the home screen goes somewhere real.
 */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <main className="flex flex-1 flex-col">
      <AppBar title={title} backHref="/" />

      {/* ROUND 6: this screen was the last one carrying the old wa-teal header.
          (It is currently unreferenced - no screen imports ComingSoon - but it is
          fixed rather than left as a trap for the next reader.) */}

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-7 text-center">
        <p className="text-lg font-semibold text-on-surface">{title} is coming soon</p>
        <p className="text-sm text-on-surface-variant">{note}</p>
      </div>
    </main>
  );
}
