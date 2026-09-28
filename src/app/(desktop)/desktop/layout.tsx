import type { ReactNode } from "react";
import { Suspense } from "react";

import { DesktopRail } from "@/components/desktop-rail";
import { PinGate } from "@/components/pin-lock";

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
    /*
     * ROUND 23: THE SHELL WAITS ON THE RESOLVED PHASE.
     *
     * It used to render unconditionally and let the rail gate itself, and it put the
     * PIN pad over the top of an already-rendered shell. Both of those meant the app
     * existed on screen before either question was answered: measured at 87ms of
     * readable mail with no pad on a warm local stack, and as long as a round trip on
     * a cold one - which is what "the app opens straight in" and "the rail is missing"
     * were. Now nothing of the shell exists until PinGate says the phase is resolved:
     *
     *   checking -> a resolving screen, no rail, no mail, no login flash
     *   locked   -> the pad, and nothing else
     *   open     -> this shell
     */
    <PinGate>
      <div className="flex h-screen bg-surface-container-low">
        <Suspense fallback={<div className="w-56 shrink-0 border-r border-outline-variant bg-surface-container-lowest" />}>
          <DesktopRail />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </PinGate>
  );
}
