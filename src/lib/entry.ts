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

/**
 * WHERE A WIDE ENTRY GOES, or null to stay - the ONE rule every surface consults.
 *
 * Round 25 added this so the handover and the phone screens' auth guards cannot
 * disagree: both call it, both get the same answer, and there is no second opinion
 * about who a wide viewport belongs to.
 */
/**
 * PATHS THAT ARE CONTENT, NOT APP SCREENS.
 *
 * The handover sends a wide viewport to the mail client, which is right for the app
 * and wrong for a page someone linked to: terms and the registration portal are
 * things to READ, and they now render in place at any width - styled for the
 * viewport they are opened in - instead of bouncing the reader into the app. Round
 * 27 measured the bounce: /terms at 1440 landed on the login card (signed out) or
 * the inbox (signed in), from the desktop login card's own terms link.
 */
export const CONTENT_PATHS = ["/terms", "/portal"] as const;

export function isContentPath(pathname: string): boolean {
  return CONTENT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function wideEntryTarget({ pathname, width, choseMobile }: MobileEntryView): string | null {
  if (isContentPath(pathname)) {
    return null;
  }
  return decideMobileEntry({ pathname, width, choseMobile }) === "desktop" ? DESKTOP_ENTRY_PATH : null;
}

/** Where a wide entry lands: the desktop client's inbox (see wide-screen-redirect). */
export const DESKTOP_ENTRY_PATH = "/desktop/inbox";

/**
 * The same decision, read synchronously from the browser. Returns null on the
 * server, in a narrow viewport, on an explicit /mobile, and in a tab that chose the
 * phone layout - so a caller can treat null as "carry on where you are".
 */
export function handoverTargetInThisTab(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return wideEntryTarget({
    pathname: window.location.pathname,
    width: window.innerWidth,
    choseMobile: readMobileModeChoice(storage),
  });
}

/**
 * THE PHONE SCREENS' SHARED GUARD. A screen that would send a signed-out reader to
 * /onboarding calls this instead: a wide viewport is handed to the desktop client,
 * everything else goes to onboarding as before.
 */
export function guardRedirect(router: { replace: (href: string) => void }): void {
  router.replace(handoverTargetInThisTab() ?? "/onboarding");
}

/** Reads this tab's remembered choice, treating an unreadable store as "no". */
export function readMobileModeChoice(storage: { getItem(key: string): string | null } | null | undefined): boolean {
  try {
    return storage?.getItem(MOBILE_MODE_KEY) === "1";
  } catch {
    return false;
  }
}
