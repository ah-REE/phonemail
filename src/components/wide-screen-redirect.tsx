"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * DESKTOP BY DEFAULT ON A WIDE SCREEN.
 *
 * The root `/` is the phone-first home — that is what the product is for. But an
 * evaluator opens the app on a laptop, and a 1280px window showing a 400px-wide phone
 * column is a poor first impression of a mail client. So on a FIRST load at `/` with
 * a viewport at least this wide, the browser goes to `/desktop`.
 *
 * `/mobile` is then the EXPLICIT phone URL. A reader who chooses it stays there: the
 * choice is remembered per TAB in sessionStorage — the same lifetime as the session
 * itself, so the two travel together — and the in-app links back to `/` do not bounce
 * them out of the layout they picked.
 *
 * The pathname is what decides, so `/mobile` can render this same home screen without
 * a second implementation of it.
 *
 * Nothing here is a substitute for the server: this is presentation routing, not
 * access control, and every route still authenticates on its own.
 */
export const DESKTOP_FROM_PX = 768;
const MOBILE_MODE_KEY = "phonemail.mobileMode";

export function WideScreenRedirect() {
  const router = useRouter();

  useEffect(() => {
    const onExplicitMobileUrl = window.location.pathname.startsWith("/mobile");

    if (onExplicitMobileUrl) {
      // The reader CHOSE the phone layout in this tab.
      try {
        window.sessionStorage.setItem(MOBILE_MODE_KEY, "1");
      } catch {
        // A browser that refuses storage simply gets the redirect behaviour later.
      }
      return;
    }

    let choseMobile = false;
    try {
      choseMobile = window.sessionStorage.getItem(MOBILE_MODE_KEY) === "1";
    } catch {
      choseMobile = false;
    }

    if (choseMobile) {
      return;
    }

    if (window.innerWidth >= DESKTOP_FROM_PX) {
      // A client-side replace, not a full page load: the tab's session — which lives
      // in sessionStorage — survives the hop.
      router.replace("/desktop");
    }
  }, [router]);

  return null;
}
