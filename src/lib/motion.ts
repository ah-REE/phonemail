/**
 * ROUND 31 - the motion module's JS side.
 *
 * The CSS layer (globals.css) carries the classes; this carries the numbers and
 * the one guard flow code needs: prefers-reduced-motion. CSS-driven animation
 * is already stopped by the global reduced-motion rule, but FLOW timing
 * (when a collapse commits, when a sheet unmounts, when a list settles) would
 * otherwise still wait - so every such flow asks this first and goes instant.
 */

export const MOTION = {
  /** The press: scale to 0.96 in 120ms. */
  press: 120,
  /** The move collapse: height to zero + fade, 240ms. */
  collapse: 240,
  /** The single star pop. */
  pop: 200,
  /** The report morph. */
  morph: 180,
  /** The undo toast's dwell. */
  toast: 5000,
  /** Sheet exits (phone slide-down 240ms / desktop modal 220ms). */
  sheetExitMobile: 240,
  sheetExitDesktop: 220,
  /** Compose exits. */
  composeExit: 220,
} as const;

/** True when the reader has asked the system for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
