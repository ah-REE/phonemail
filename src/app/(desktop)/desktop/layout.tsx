import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/wordmark";

/**
 * Desktop shell.
 *
 * The desktop client lives under an explicit `/desktop` prefix (PROJECT.md Day 5):
 * evaluators open both interfaces directly, with no user-agent guessing. It
 * reuses the same auth, API and realtime layers as mobile — only the chrome and
 * the layout differ.
 *
 * ROUND 8 - THE COHERENCE PASS. The desktop palette was already the mark's (the
 * legacy `wa-*` names hid that: wa-teal is the mark's navy), so this round moved the
 * shell onto the design system's own token names and the display face, rather than
 * inventing a second visual language for the same product. Structure, navigation and
 * behaviour are unchanged; the chrome is now the same navy the phone client uses.
 */
export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-container-low">
      <header className="flex items-center gap-4 border-b border-primary-container/20 bg-primary-container px-6 py-3 text-on-primary">
        {/* ROUND 4: the desktop shell carries the same wordmark, inverted for the
            indigo chrome. */}
        <Link href="/desktop/inbox" className="text-xl font-semibold">
          <Wordmark as="span" size={22} invert />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {[
            { href: "/desktop/inbox", label: "Inbox" },
            { href: "/desktop/profile", label: "Profile" },
            { href: "/desktop/settings", label: "Settings" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 font-medium transition-colors duration-ui hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {/* ROUND 8: the phone layout has an explicit URL now, so this link points at
            it rather than at `/`, which would hand a laptop straight back to here. */}
        <Link href="/mobile" className="ml-auto text-sm underline">
          Mobile version
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
