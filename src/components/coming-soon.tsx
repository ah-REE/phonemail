"use client";

import Link from "next/link";

/**
 * Placeholder screens reached from the home menu / profile icon.
 * Days 4-5 build the real Drafts, Spam, Trash and Profile screens; these exist
 * now so every control on the home screen goes somewhere real.
 */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex min-h-tap items-center gap-3 bg-wa-teal px-4 py-3 text-white">
        <Link href="/" className="min-h-tap min-w-tap text-2xl leading-none">
          ←
        </Link>
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold text-wa-ink">{title} is coming soon</p>
        <p className="text-sm text-wa-muted">{note}</p>
      </div>
    </main>
  );
}
