import type { ReactNode } from "react";

import { BackButton } from "@/components/back-button";

/**
 * One top bar for every mobile screen, so the chrome cannot drift between
 * screens. Back navigation is a Link, not history.back(), so it works after a
 * refresh or a deep link.
 *
 * Visual refresh (fidelity audit): the design's bar is a 56px
 * bg-primary-container strip with a CENTRED title and no bottom border. The
 * earlier version was taller, left-aligned and carried a hairline the mockups do
 * not show.
 *
 * ROUND 4 (the header-alignment rule): the back control is now the shared
 * BackButton - the same 48x48 geometry every other header uses - and the bar's
 * inset is the rule's own 16px (px-4). The title stays centred on the bar's
 * vertical centre, so its optical middle meets the back glyph's on this screen
 * exactly as it does on every other screen with a back arrow.
 */
export function AppBar({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  /** The control's accessible name - a screen may say where it goes back to. */
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center bg-primary-container px-4 text-on-primary">
      {backHref && <BackButton href={backHref} label={backLabel} />}
      <div className="pointer-events-none absolute inset-x-0 text-center">
        <h1 className="truncate px-16 font-headline text-base font-semibold tracking-normal">{title}</h1>
        {subtitle && <p className="truncate px-16 text-xs opacity-80">{subtitle}</p>}
      </div>
      <div className="relative z-10 ml-auto flex items-center">{right}</div>
    </header>
  );
}
