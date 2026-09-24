import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Desktop shell.
 *
 * The desktop client lives under an explicit `/desktop` prefix (PROJECT.md Day 5):
 * evaluators open both interfaces directly, with no user-agent guessing. It
 * reuses the same auth, API and realtime layers as mobile — only the chrome and
 * the layout differ.
 */
export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-wa-bg">
      <header className="flex items-center gap-4 border-b border-wa-line bg-wa-teal px-6 py-3 text-white">
        <Link href="/desktop/inbox" className="text-xl font-semibold">
          PhoneMail
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/desktop/inbox" className="hover:underline">
            Inbox
          </Link>
          <Link href="/desktop/profile" className="hover:underline">
            Profile
          </Link>
          <Link href="/desktop/settings" className="hover:underline">
            Settings
          </Link>
        </nav>
        <Link href="/" className="ml-auto text-sm underline">
          Mobile version
        </Link>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
