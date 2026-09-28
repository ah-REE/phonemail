import type { ReactNode } from "react";

import { PinGate } from "@/components/pin-lock";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { WideScreenRedirect } from "@/components/wide-screen-redirect";

/**
 * Mobile route group shell.
 *
 * The route group keeps the mobile chrome out of the URL (`/` is the mobile
 * home) while leaving room for `(desktop)` on Day 5. On a phone the frame is
 * full-bleed; in a desktop browser it is a centred phone-width column so the
 * app reads as an app.
 *
 * ROUND 9: the wide-screen handover lives HERE rather than on the home screen, so
 * it covers every phone route - onboarding included. See
 * components/wide-screen-redirect.tsx for why the auth redirect used to win. It
 * renders nothing; it only decides where a wide viewport should be.
 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-wa-bg">
      <WideScreenRedirect />
      {/* ROUND 23: the phone client waits on the resolved phase too - the same
          window existed here (the pad arrived after the mail did). The redirect
          stays OUTSIDE the gate: it is presentation routing, and an unauthenticated
          wide visitor must still be handed to the desktop client. */}
      <PinGate>
        <div className="mx-auto flex min-h-screen w-full max-w-phone flex-col bg-wa-panel shadow-none sm:shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
          <ServiceWorkerRegistrar />
          {children}
        </div>
      </PinGate>
    </div>
  );
}
