import Link from "next/link";

/**
 * Terms & conditions — a plain view, linked from the onboarding consent line.
 * The spec no longer wants a full screen inside the signup flow, just an
 * acknowledgement that opens this.
 */
export default function TermsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex min-h-tap items-center gap-3 bg-wa-teal px-4 py-3 text-white">
        <Link href="/onboarding" className="min-h-tap min-w-tap text-2xl leading-none" aria-label="Back">
          ←
        </Link>
        <h1 className="text-xl font-semibold">Terms &amp; Conditions</h1>
      </header>

      <section className="flex flex-col gap-3 p-4 text-sm leading-relaxed text-wa-ink">
        <p>
          PhoneMail gives you an email address built from your phone number, for example
          9876543210@phonemail.com. Messages you receive are delivered to this app.
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