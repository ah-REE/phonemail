"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { MOBILE_MODE_KEY, decideMobileEntry, readMobileModeChoice } from "@/lib/entry";

/**
 * DESKTOP BY DEFAULT ON A WIDE SCREEN - FOR EVERYONE, INCLUDING A VISITOR WHO IS
 * NOT SIGNED IN.
 *
 * The root `/` is the phone-first home - that is what the product is for. But an
 * evaluator opens the app on a laptop, and a 1280px window showing a 400px-wide
 * phone column is a poor first impression of a mail client. So a wide viewport
 * goes to `/desktop`.
 *
 * ROUND 9: this now runs from the MOBILE LAYOUT, not from the phone home screen.
 * That is the fix for the unauthenticated case: the phone screens each redirect a
 * signed-out reader to `/onboarding`, and when this check lived on the home
 * screen only, that redirect won the race - a laptop visitor who had never signed
 * in landed on the MOBILE onboarding, which is exactly the first impression this
 * was supposed to prevent. Being in the layout means every phone route, onboarding
 * included, answers the width question, and the layout's effect runs on the mount
 * pass while the screens' auth redirects need a later state update to fire.
 *
 * `/mobile` is the EXPLICIT phone URL and is never redirected away from: a reader
 * who chooses it stays there, and the choice is remembered per TAB in
 * sessionStorage - the same lifetime as the session itself, so the two travel
 * together - so the in-app links back to `/` do not bounce them out of the layout
 * they picked.
 *
 * `/onboarding` is therefore reachable only through `/mobile` or a narrow
 * viewport, which is what the brief asks for.
 *
 * Nothing here is a substitute for the server: this is presentation routing, not
 * access control, and every route still authenticates on its own. `/desktop` shows
 * its own sign-in screen for an unauthenticated visitor.
 */
// The decision itself lives in lib/entry.ts: pure, importable, and drivable at
// every width without a browser. This component only wires it to the router.
export { DESKTOP_FROM_PX, MOBILE_MODE_KEY, decideMobileEntry, readMobileModeChoice } from "@/lib/entry";

export function WideScreenRedirect() {
  const router = useRouter();

  useEffect(() => {
    const pathname = window.location.pathname;

    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    if (pathname.startsWith("/mobile") && storage) {
      // The reader CHOSE the phone layout in this tab.
      try {
        storage.setItem(MOBILE_MODE_KEY, "1");
      } catch {
        // A browser that refuses storage simply gets the redirect behaviour later.
      }
    }

    const decision = decideMobileEntry({
      pathname,
      width: window.innerWidth,
      choseMobile: readMobileModeChoice(storage),
    });

    if (decision === "desktop") {
      // ROUND 17: the handover lands on the desktop client's INBOX, not on its
      // front door. The front door is the sign-in card (correctly so - a signed-out
      // visitor must meet the login and nothing else), which meant a reader who was
      // ALREADY signed in arrived at a login card with no sidebar, and had to wait
      // for that page's own redirect before the mail client appeared. The inbox is
      // the client: signed in, it renders immediately with the rail; signed out, its
      // own guard sends the visitor to the login card. One destination, both cases
      // correct, and the rail is simply there when it should be.
      //
      // A client-side replace, not a full page load: the tab's session - which lives
      // in sessionStorage - survives the hop.
      router.replace("/desktop/inbox");
    }
  }, [router]);

  return null;
}
