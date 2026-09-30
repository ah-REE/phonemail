"use client";

import { useLayoutEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * ROUND 31 - the list settle (FLIP).
 *
 * After any removal, remaining rows animate to their new positions with a
 * transform - measured before the change, inverted, then eased home on the
 * arrival curve (220ms). Never a re-mount flash: the browser lays the list
 * out, we only push it back the distance it moved.
 *
 * Children opt in with `data-flip-key="..."`; the hook takes the ref for the
 * list container and the deps that identify a settled list.
 */
export function useFlipList<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T | null>(null);
  const previous = useRef<Map<string, DOMRect> | null>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) {
      return;
    }
    const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-flip-key]"));
    const next = new Map<string, DOMRect>();
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (key) {
        next.set(key, node.getBoundingClientRect());
      }
    }

    const before = previous.current;
    previous.current = next;
    if (!before || prefersReducedMotion()) {
      return;
    }
    for (const node of nodes) {
      const key = node.dataset.flipKey;
      if (!key) {
        continue;
      }
      const from = before.get(key);
      const to = next.get(key);
      if (!from || !to) {
        continue; // Newly mounted: it enters with the stagger, not a glide.
      }
      const dy = from.top - to.top;
      if (Math.abs(dy) < 1 || typeof node.animate !== "function") {
        continue;
      }
      node.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
