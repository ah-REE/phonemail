"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * ROUND 31 - the height collapse wrapper.
 *
 * The ONE permitted layout animation in the motion pass: the card / bubble /
 * row wrapper animates its height to zero (and back) on the arrival curve while
 * its opacity fades - siblings glide into the freed space because the layout
 * follows the measured height, never a re-mount.
 *
 * Phases, driven by the owner of the list:
 *  - "idle"     - normal; inline styles cleared.
 *  - "closing"  - measure, animate to 0, then onDone("closing").
 *  - "expanding"- mount collapsed, animate open, then onDone("expanding").
 *
 * Reduced motion: same outcomes, instant - onDone fires immediately and no
 * transition is started.
 */
export function Collapsing({
  phase,
  onDone,
  className = "",
  children,
  ...rest
}: {
  phase: "idle" | "closing" | "expanding";
  onDone?: (phase: "closing" | "expanding") => void;
  className?: string;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // Before paint: keep the collapsed start state of an expanding mount from
  // flashing, and clear inline styles when we settle back to idle.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (phase === "expanding") {
      el.style.height = "0px";
      el.style.opacity = "0";
    }
    if (phase === "idle") {
      el.style.height = "";
      el.style.opacity = "";
    }
  }, [phase]);

  useEffect(() => {
    const el = ref.current;
    if (!el || phase === "idle") {
      return;
    }
    if (prefersReducedMotion()) {
      doneRef.current?.(phase);
      return;
    }

    let cancelled = false;
    const target = phase;

    if (target === "closing") {
      el.style.height = `${el.scrollHeight}px`;
      el.style.opacity = "1";
    } else {
      el.style.height = "0px";
      el.style.opacity = "0";
    }

    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        if (target === "closing") {
          el.style.height = "0px";
          el.style.opacity = "0";
        } else {
          el.style.height = `${el.scrollHeight}px`;
          el.style.opacity = "1";
        }
      });
    });

    const onEnd = (event: TransitionEvent) => {
      if (event.target === el && event.propertyName === "height" && !cancelled) {
        doneRef.current?.(target);
      }
    };
    el.addEventListener("transitionend", onEnd);
    // The safety net: if transitionend is swallowed (interrupted, zero-height
    // content), the flow must still commit rather than hang.
    const safety = window.setTimeout(() => doneRef.current?.(target), 240 + 90);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(safety);
    };
  }, [phase]);

  return (
    <div
      ref={ref}
      className={`collapse-anim ${phase === "closing" ? "pointer-events-none" : ""} ${className}`}
      data-collapse={phase}
      {...rest}
    >
      {children}
    </div>
  );
}
