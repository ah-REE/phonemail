/**
 * WHERE A FIRST ENTRY GOES (round 9).
 *
 * One pure decision, kept out of the component so it can be driven at every
 * width and every URL without a browser - and out of a `.tsx` so a test can
 * import it directly. The component (components/wide-screen-redirect.tsx) is a
 * thin effect around this.
 *
 * The order is the point:
 *
 *   1. an explicit `/mobile` URL wins - a reader who asks for the phone layout
 *      gets it, whatever the window size;
 *   2. then this tab's own remembered choice, so the in-app links back to `/`
 *      do not bounce a phone-layout reader out of the layout they picked;
 *   3. and only then the width: at 768px or more, go to the desktop client.
 *
 * An UNAUTHENTICATED wide entry is NOT special-cased. It takes the same branch,
 * because `/desktop` has its own login screen - which is what makes a laptop
 * visitor's first impression the mail client instead of the phone onboarding.
 */

export const DESKTOP_FROM_PX = 768;

export const MOBILE_MODE_KEY = "phonemail.mobileMode";

export interface MobileEntryView {
  pathname: string;
  /** The viewport width in CSS pixels. */
  width: number;
  /** This tab has already chosen the phone layout. */
  choseMobile: boolean;
}

export type MobileEntryDecision = "stay" | "desktop";

export function decideMobileEntry({ pathname, width, choseMobile }: MobileEntryView): MobileEntryDecision {
  if (pathname.startsWith("/mobile")) {
    return "stay";
  }
  if (choseMobile) {
    return "stay";
  }
  return width >= DESKTOP_FROM_PX ? "desktop" : "stay";
}

/** Reads this tab's remembered choice, treating an unreadable store as "no". */
export function readMobileModeChoice(storage: { getItem(key: string): string | null } | null | undefined): boolean {
  try {
    return storage?.getItem(MOBILE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}
