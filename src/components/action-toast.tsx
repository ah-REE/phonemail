"use client";

import { useEffect, useRef, useState } from "react";

import { MOTION } from "@/lib/motion";

/**
 * ROUND 31 - the undo toast, both clients.
 *
 * A dark pill that rises in on the arrival curve, holds ~5 seconds, and offers
 * one action: UNDO. The phone's sits above the "New mail" bar; the desktop's
 * sits in the bottom-right corner. It is functional, not decorative - so
 * reduced motion only shortens its entrance, never removes it.
 */
export function ActionToast({
  label,
  onUndo,
  onExpire,
  variant = "mobile",
  durationMs = MOTION.toast,
}: {
  /** "Moved to Trash" / "Moved to Spam". */
  label: string;
  onUndo: () => void;
  onExpire?: () => void;
  variant?: "mobile" | "desktop";
  durationMs?: number;
}) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setTimeout(() => {
      onExpire?.();
    }, durationMs);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  function act(handler: () => void) {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setLeaving(true);
    handler();
  }

  const pill = (
    <div
      className="toast-in pointer-events-auto flex items-center gap-4 rounded-full bg-on-surface py-2.5 pl-5 pr-3 text-sm text-surface shadow-overlay"
      role="status"
      aria-live="polite"
      data-testid="action-toast"
      data-toast-leaving={leaving ? "1" : undefined}
    >
      <span className="whitespace-nowrap font-medium">{label}</span>
      <button
        type="button"
        className="press shrink-0 rounded-full px-3 py-1 font-bold uppercase tracking-wide text-accent-soft"
        onClick={() => act(onUndo)}
      >
        Undo
      </button>
    </div>
  );

  if (variant === "desktop") {
    return <div className="fixed bottom-6 right-6 z-[70] flex">{pill}</div>;
  }
  return <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-30 flex justify-center px-4">{pill}</div>;
}
