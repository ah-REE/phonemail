import type { ReactNode } from "react";

import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

/**
 * Mobile route group shell.
 *
 * The route group keeps the mobile chrome out of the URL (`/` is the mobile
 * home) while leaving room for `(desktop)` on Day 5. On a phone the frame is
 * full-bleed; in a desktop browser it is a centred phone-width column so the
 * app reads as an app.
 */
export default function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-wa-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-phone flex-col bg-wa-panel shadow-none sm:shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
        <ServiceWorkerRegistrar />
        {children}
      </div>
    </div>
  );
}
