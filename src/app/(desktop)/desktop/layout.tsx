import type { ReactNode } from "react";
import { Suspense } from "react";

import { DesktopRail } from "@/components/desktop-rail";
import { PinLock } from "@/components/pin-lock";

/**
 * Desktop shell.
 *
 * The desktop client lives under an explicit `/desktop` prefix (PROJECT.md Day 5):
 * evaluators open both interfaces directly, with no user-agent guessing. It
 * reuses the same auth, API and realtime layers as mobile - only the chrome and
 * the layout differ.
 *
 * ROUND 8 - THE COHERENCE PASS: the shell moved onto the design system's own
 * tokens and the display face.
 *
 * ROUND 9 - THE RAIL: the top bar is GONE and its jobs are in the rail, where the
 * brief puts them. The bar had the wordmark, a three-item nav (Inbox, Profile,
 * Settings) and the mobile link; the rail now carries the logo, the folder items
 * and profile/settings at its foot, which is one navigation instead of two and
 * leaves the whole width to the mail. `useSearchParams` needs a Suspense
 * boundary, hence the one around the rail.
 */
export default function DesktopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-surface-container-low">
      {/* ROUND 22: the app lock. Placed with the shell so it covers the rail too -
          a lock that leaves the conversation list visible is not a lock. */}
      <PinLock />
      <Suspense fallback={<div className="w-56 shrink-0 border-r border-outline-variant bg-surface-container-lowest" />}>
        <DesktopRail />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
