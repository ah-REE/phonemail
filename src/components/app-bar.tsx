import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One top bar for every mobile screen, so the chrome cannot drift between
 * screens. Back navigation is a Link, not history.back(), so it works after a
 * refresh or a deep link.
 *
 * Visual refresh (fidelity audit): the design's bar is a 56px
 * bg-primary-container strip with a CENTRED title and no bottom border. The
 * earlier version was taller, left-aligned and carried a hairline the mockups do
 * not show.
 */
export function AppBar({
  title,
  subtitle,
  backHref,
  right,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center bg-primary-container px-2 text-on-primary">
      {backHref && (
        <Link
          href={backHref}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full active:bg-white/10"
          aria-label="Back"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      )}
      <div className="pointer-events-none absolute inset-x-0 text-center">
        <h1 className="truncate px-14 font-headline text-base font-semibold tracking-normal">{title}</h1>
        {subtitle && <p className="truncate px-14 text-xs opacity-80">{subtitle}</p>}
      </div>
      <div className="relative z-10 ml-auto flex items-center">{right}</div>
    </header>
  );
}
