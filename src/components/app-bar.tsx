import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One top bar for every mobile screen, so the chrome (height, padding, colour,
 * back affordance) cannot drift between screens. Back navigation is a Link, not
 * history.back(), so it works after a refresh or a deep link.
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
    <header className="sticky top-0 z-10 flex min-h-[56px] items-center gap-3 border-b border-black/10 bg-wa-teal px-4 py-3 text-white">
      {backHref && (
        <Link href={backHref} className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back">
          ←
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-white/80">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}
