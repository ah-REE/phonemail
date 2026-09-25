"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Profile & settings.
 *
 * Layout follows design/profile_settings_minimal_focus: a centred title bar, an
 * 80px avatar with a verified badge, the phone identity and the address pill,
 * then uppercase section headings over flat bordered cards, and an
 * end-to-end-encryption footer with the build line.
 *
 * Aliases are the app feature the mockup predates, so they get their own section
 * in the same card language: the list with a Remove on each row, and an add row.
 *
 * Three mockup rows are deliberately absent, because rendering them would mean
 * inventing a feature rather than restyling one:
 *  - "SMS alerts" with a toggle: the notification gate is server-side state
 *    (`registeredVia`) that the client never sees, so a toggle here could not be
 *    honest about what it controls
 *  - "Personal details": there is no such screen
 *  - "Delete account": there is no endpoint behind it
 */

interface Alias {
  id: string;
  localPart: string;
  address: string;
  createdAt?: string;
}

function Icon({ name, size = 20 }: { name: "back" | "check" | "chevron" | "globe" | "logout" | "lock"; size?: number }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {name === "back" && <path d="M15 5l-7 7 7 7" {...stroke} />}
      {name === "chevron" && <path d="M9 5l7 7-7 7" {...stroke} />}
      {name === "check" && <path d="M5 13l4 4L19 7" {...stroke} />}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="8" {...stroke} />
          <path d="M4 12h16M12 4c2.2 2.4 2.2 13.2 0 16M12 4c-2.2 2.4-2.2 13.2 0 16" {...stroke} />
        </>
      )}
      {name === "logout" && (
        <>
          <path d="M15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3" {...stroke} />
          <path d="M10 8l-4 4 4 4M6 12h9" {...stroke} />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="10.5" width="14" height="9" rx="2" {...stroke} />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...stroke} />
        </>
      )}
    </svg>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { status, token, user, signOut, authorizedFetch } = useAuth();

  const [aliases, setAliases] = useState<Alias[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/aliases");
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { aliases?: Alias[] };
      setAliases(body.aliases ?? []);
    } catch {
      // The list simply stays empty; adding still works and reports its own error.
    }
  }, [authorizedFetch]);

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token, load]);

  async function addAlias(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const localPart = draft.trim().toLowerCase();
    if (!localPart) {
      return;
    }

    setBusy(true);
    try {
      const response = await authorizedFetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; alias?: Alias };

      if (!response.ok) {
        setError(body.error ?? "Could not add that alias.");
        return;
      }

      setDraft("");
      setNotice(`${body.alias?.localPart ?? localPart}@phonemail.com is yours now.`);
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAlias(localPart: string) {
    setError(null);
    setNotice(null);

    const response = await authorizedFetch(`/api/aliases/${encodeURIComponent(localPart)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not remove that alias.");
      return;
    }

    setNotice(`${localPart} removed.`);
    await load();
  }

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col p-4">
        <span className="skeleton h-20 w-20 self-center rounded-full" />
        <span className="skeleton mt-4 h-6 w-40 self-center rounded-full" />
      </main>
    );
  }

  const address = user ? `${user.phoneNumber}@phonemail.com` : "";
  const initial = user?.phoneNumber?.slice(0, 1) ?? "?";

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-phone flex-1 flex-col">

        <header className="relative flex h-14 w-full items-center justify-between px-3">
          <Link href="/" className="flex h-12 w-12 items-center justify-center rounded-full" aria-label="Back to the chat list">
            <Icon name="back" size={24} />
          </Link>
          <h1 className="pointer-events-none absolute inset-x-0 text-center font-headline text-base font-bold tracking-tight">
            Profile &amp; Settings
          </h1>
          <span className="h-12 w-12" aria-hidden="true" />
        </header>

        <div className="flex flex-col items-center px-5 pb-8 pt-2">
          <div className="relative">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-wa-teal font-headline text-2xl font-bold text-white">
              {initial}
            </span>
            <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-wa-green text-on-surface">
              <Icon name="check" size={14} />
            </span>
          </div>
          <h2 className="mt-3.5 font-headline text-[22px] font-extrabold leading-tight tracking-tight">
            {user?.phoneNumber ?? "Unknown"}
          </h2>
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-wa-outline bg-surface px-4 py-1.5">
            <span className="select-all text-sm font-semibold tracking-wide">{address}</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 px-4 pb-6 pt-6">

          <section>
            <h3 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Alias IDs
            </h3>
            <div className="overflow-hidden rounded-2xl border border-wa-outline bg-surface">
              {aliases.length === 0 ? (
                <p className="px-4 py-3.5 text-sm text-on-surface-variant">
                  No aliases yet. An alias is a second address for this account.
                </p>
              ) : (
                aliases.map((alias) => (
                  <div
                    key={alias.id}
                    className="flex min-h-[58px] w-full items-center justify-between border-b border-wa-line px-4 py-3.5 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{alias.address}</span>
                    <button
                      type="button"
                      className="min-h-0 shrink-0 text-sm font-semibold text-wa-alert"
                      aria-label={`Remove alias ${alias.localPart}`}
                      onClick={() => void removeAlias(alias.localPart)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              <form
                className="flex min-h-[58px] w-full items-center gap-2 border-t border-wa-line px-4 py-3.5"
                onSubmit={addAlias}
              >
                <input
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-on-surface-variant"
                  placeholder="Add an alias, e.g. john.doe"
                  autoCapitalize="none"
                  autoComplete="off"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-full bg-secondary-container px-4 py-1.5 text-sm font-semibold text-on-surface disabled:opacity-60"
                  disabled={busy || draft.trim().length === 0}
                >
                  {busy ? "Adding" : "Add"}
                </button>
              </form>
            </div>
            <p className="mt-2 px-1 text-xs text-on-surface-variant">
              3-20 characters: lowercase letters, digits and dots. Mail sent to an alias reaches this
              account exactly like mail sent to the number.
            </p>
            {notice && <p className="mt-2 px-1 text-sm text-primary-container">{notice}</p>}
            {error && (
              <p className="mt-2 px-1 text-sm text-wa-alert" role="alert">
                {error}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Preferences
            </h3>
            <div className="overflow-hidden rounded-2xl border border-wa-outline bg-surface">
              <div className="flex min-h-[58px] w-full items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-primary-container">
                    <Icon name="globe" size={20} />
                  </span>
                  <span className="text-sm font-medium">Language</span>
                </div>
                <span className="text-sm text-on-surface-variant">English (India)</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 px-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Actions
            </h3>
            <div className="overflow-hidden rounded-2xl border border-wa-outline bg-surface">
              <button
                type="button"
                className="flex min-h-[58px] w-full items-center justify-between px-4 py-3.5 text-left"
                onClick={() => {
                  signOut();
                  router.replace("/onboarding");
                }}
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-error">
                    <Icon name="logout" size={20} />
                  </span>
                  <span className="text-sm font-medium">Sign out</span>
                </div>
                <span className="text-on-surface-variant">
                  <Icon name="chevron" size={18} />
                </span>
              </button>
            </div>
          </section>

          <footer className="mt-auto flex flex-col items-center justify-center pb-2 pt-6">
            <div className="inline-flex max-w-[340px] items-center justify-center gap-2 rounded-xl bg-surface-container-low px-4 py-2">
              <span className="shrink-0 text-on-surface-variant">
                <Icon name="lock" size={14} />
              </span>
              <span className="text-xs leading-snug">End-to-end encrypted</span>
            </div>
            <p className="mt-2.5 font-mono text-xs text-on-surface-variant">PhoneMail v0.1.0</p>
          </footer>
        </div>
      </div>
    </main>
  );
}
