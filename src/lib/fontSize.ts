/**
 * Font size — a DISPLAY preference, per device, that scales the whole design system.
 *
 * Every size in this app is expressed in rem (Tailwind's type scale, the tokens in
 * globals.css), so one number moves everything: the root font size. That is why this
 * is a preference and not a per-screen prop — and why it is worth having in a build
 * whose whole reason for existing is first-time smartphone users who need larger
 * type.
 *
 * It lives in localStorage (per device, not per account: the phone in a pocket and
 * the laptop on a desk do not want the same size), and it is applied by a script in
 * the document head BEFORE anything paints, so a reader who chose Large never sees
 * the text jump.
 *
 * This module is pure and client-safe: no React, no Prisma, so the settings screen,
 * the head script and the test suite all read the same numbers.
 */

export const FONT_SIZE_KEY = "phonemail.fontSize";

export const FONT_SIZES = [
  { id: "normal", label: "Normal", root: "18px", note: "The design's own size" },
  { id: "large", label: "Large", root: "20px", note: "Everything grows a step" },
  { id: "extra", label: "Extra large", root: "22px", note: "The largest that still fits" },
] as const;

export type FontSizeId = (typeof FONT_SIZES)[number]["id"];

export const DEFAULT_FONT_SIZE: FontSizeId = "normal";

/** The sizes as a plain map, which is also what the head script embeds. */
export const FONT_SIZE_ROOTS: Record<string, string> = Object.fromEntries(
  FONT_SIZES.map((size) => [size.id, size.root]),
);

export function isFontSizeId(value: unknown): value is FontSizeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FONT_SIZE_ROOTS, value);
}

export function rootPxFor(id: FontSizeId): string {
  return FONT_SIZE_ROOTS[id];
}

/** What is stored on this device, or the default. Safe during server rendering. */
export function readFontSize(): FontSizeId {
  if (typeof window === "undefined") {
    return DEFAULT_FONT_SIZE;
  }
  try {
    const stored = window.localStorage.getItem(FONT_SIZE_KEY);
    return isFontSizeId(stored) ? stored : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

/**
 * Apply and remember. The root font size is set as an INLINE style on <html>, so it
 * beats the stylesheet's own 18px without needing a class for every level.
 */
export function applyFontSize(id: FontSizeId): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.style.fontSize = rootPxFor(id);
  try {
    window.localStorage.setItem(FONT_SIZE_KEY, id);
  } catch {
    // A private-mode browser that refuses storage still gets the size for this page.
  }
}

/**
 * The same decision, run before first paint. Inlined into the document head by the
 * root layout, which is what removes the flash: the browser applies the size while
 * parsing the head, so the first frame is already correct.
 */
export const FONT_SIZE_BOOTSTRAP = `(function(){try{var sizes=${JSON.stringify(
  FONT_SIZE_ROOTS,
)};var stored=localStorage.getItem(${JSON.stringify(FONT_SIZE_KEY)});if(stored&&sizes[stored]){document.documentElement.style.fontSize=sizes[stored];}}catch(error){}})();`;
