import Link from "next/link";

import { BackButton } from "@/components/back-button";
import { Wordmark } from "@/components/wordmark";

/**
 * Terms & conditions — a plain view, linked from the onboarding consent line.
 * The spec no longer wants a full screen inside the signup flow, just an
 * acknowledgement that opens this.
 */
export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-primary-container px-4 text-on-primary">
        <BackButton href="/onboarding" label="Back to sign-up" />
        <h1 className="font-headline text-base font-bold tracking-tight">Terms &amp; Conditions</h1>
      </header>

      <section className="flex flex-col gap-3 p-4 text-sm leading-relaxed text-wa-ink">
        {/* ROUND 4: the name carries the wordmark treatment wherever it appears. */}
        <Wordmark as="p" size={22} />
        <p>
          <Wordmark as="span" size={14} /> gives you an email address built from your phone
          number, for example 9876543210@phonemail.com. Messages you receive are delivered to this
          app.
        </p>
        <p>
          We store your phone number and the messages you send and receive so the service can work.
          Your number is verified with a one-time code. Do not share that code with anyone.
        </p>
        <p>
          This is a student buildathon project: the service is provided as is, without warranty, and
          may be reset or taken offline.
        </p>
        <p>
          By continuing you agree that your phone number identifies your account and that you will
          use the service lawfully.
        </p>
        <Link href="/onboarding" className="btn-primary mt-4">
          Back to signup
        </Link>
      </section>
    </main>
  );
}