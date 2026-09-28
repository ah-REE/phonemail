"use client";

import { Suspense, type ReactNode } from "react";

import { DesktopRail } from "@/components/desktop-rail";
import { useAuth } from "@/lib/useAuth";

/**
 * THE DESKTOP SHELL (round 23b) - ONE decision about who gets chrome.
 *
 * WHY THIS EXISTS. The rail used to decide for itself whether to render: it called
 * `useAuth()` and returned null unless the phase was authenticated. The layout
 * decided nothing. Two independent hook instances reading the same storage is two
 * chances to disagree - and if the rail's instance saw "no session" while the page's
 * saw one, the result was exactly the reported screenshot: the mail client fully
 * rendered, with no rail beside it. (The rail read its session once at mount, so an
 * instance that mounted after a transient 401 - which clears the stored session -
 * stayed null for the rest of that tab's life, while the page that was already
 * mounted kept the token in its own state. A reload fixed it, which is the "appears
 * only after a refresh" half of the report.)
 *
 * Now the shell asks ONCE and hands the answer to its own render: authenticated gets
 * the rail beside the content, anything else gets the content alone (which is how a
 * signed-out visitor sees only the login card). There is no longer a state in which
 * the mail renders beside an absent rail, because the rail is not a decision the rail
 * makes.
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const withChrome = status === "authenticated";

  return (
    <div className="flex h-screen bg-surface-container-low">
      {withChrome && (
        /*
         * `useSearchParams` needs a Suspense boundary, hence the one around the rail.
         * The fallback is a placeholder of the rail's own width, so a suspension is a
         * quiet column rather than a layout jump - and it is the same component that
         * renders the rail, so the two can never be one without the other.
         */
        <Suspense
          fallback={
            <div
              className="flex w-[260px] shrink-0 flex-col gap-1 bg-accent p-4 text-accent-ink"
              aria-hidden="true"
            />
          }
        >
          <DesktopRail />
        </Suspense>
      )}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
