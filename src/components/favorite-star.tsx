"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * ROUND 31 - the favorite star and its chip.
 *
 * The star POPS (1 -> 1.25 -> 1, soft-spring, 200ms) the moment it becomes
 * active - the app's only bounce. The chip crossfades in at 180ms, and out on
 * the same curve when the tag is removed.
 */
export function FavoriteStar({ active, size = 14, pop = false }: { active: boolean; size?: number; pop?: boolean }) {
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    if (!pop || prefersReducedMotion()) {
      setPopping(false);
      return;
    }
    setPopping(true);
    const timer = window.setTimeout(() => setPopping(false), 240);
    return () => window.clearTimeout(timer);
  }, [pop]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={popping ? "star-pop" : undefined}
    >
      <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
    </svg>
  );
}

/**
 * The chip itself, mounted by whoever owns the tag state. It animates OUT
 * before it leaves the DOM, so "Favorite off" is a crossfade rather than a
 * pop-out.
 */
export function AnimatedFavoriteChip({ show, pop = false, className = "" }: { show: boolean; pop?: boolean; className?: string }) {
  const [rendered, setRendered] = useState(show);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (show) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) {
      return;
    }
    if (prefersReducedMotion()) {
      setRendered(false);
      return;
    }
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [show, rendered]);

  if (!rendered) {
    return null;
  }
  return (
    <span
      className={`${closing ? "chip-exit" : "chip-enter"} inline-flex items-center gap-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant ${className}`}
      data-favorite-chip={closing ? "closing" : "open"}
    >
      <FavoriteStar active={show} size={12} pop={pop} />
      Favorite
    </span>
  );
}
