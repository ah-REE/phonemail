"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/**
 * Profile & settings.
 *
 * Fidelity audit: the earlier pass read this mockup through an outline that had
 * stripped colour classes, and it showed. This markup follows
 * design/profile_settings_minimal_focus/code.html literally - the page canvas is
 * #F8FAFC, the identity block sits ON the teal header (avatar #00453d with a
 * white ring, phone in white, the address pill #00453d/80 with a #25D366 label),
 * and the cards are white on slate-200/80 with slate/teal-50 accents.
 *
 * Aliases are the app feature the mockup predates, so they get their own section
 * in the same card language. Three mockup rows stay absent because rendering
 * them would mean inventing a feature: the SMS-alerts toggle (the notification
 * gate is server-side state the client never sees), Personal details (no such
 * screen) and Delete account (no endpoint behind it).
 */

interface Alias {
  id: string;
  localPart: string;
  address: string;
  createdAt?: string;
}

function Icon({
  name,
  size = 20,
}: {
  name: "back" | "check" | "chevron" | "globe" | "logout" | "lock";
  size?: number;
}) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
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
  // Day 7: the display name, loaded from /api/me and saved back to it.
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
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
      if (response.ok) {
        const body = (await response.json()) as { aliases?: Alias[] };
        setAliases(body.aliases ?? []);
      }
    } catch {
      // The list stays empty; adding reports its own error.
    }

    try {
      const me = await authorizedFetch("/api/me");
      if (me.ok) {
        const body = (await me.json()) as { user?: { displayName?: string | null } };
        setNameDraft(body.user?.displayName ?? "");
      }
    } catch {
      // The name row simply stays empty; saving reports its own error.
    }
  }, [authorizedFetch]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setNameNotice(null);
    setNameSaving(true);
    try {
      const response = await authorizedFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameDraft.trim() === "" ? null : nameDraft.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; user?: { displayName?: string | null } };
      if (!response.ok) {
        setNameNotice(body.error ?? "Could not save your name.");
        return;
      }
      setNameDraft(body.user?.displayName ?? "");
      setNameNotice(body.user?.displayName ? "Name saved." : "Name cleared - your number will be shown.");
    } catch {
      setNameNotice("Network error. Please try again.");
    } finally {
      setNameSaving(false);
    }
  }

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
      <main className="flex flex-1 flex-col bg-[#F8FAFC] p-4">
        <span className="skeleton h-20 w-20 self-center rounded-full" />
        <span className="skeleton mt-4 h-6 w-40 self-center rounded-full" />
      </main>
    );
  }

  const address = user ? `${user.phoneNumber}@phonemail.com` : "";
  const initial = user?.phoneNumber?.slice(0, 1) ?? "?";

  return (
    <main className="flex flex-1 flex-col bg-[#F8FAFC]">
      <header className="relative z-10 flex w-full flex-col bg-[#075e54] text-white">
        <div className="relative flex h-14 items-center justify-between px-3">
          <Link
            href="/"
            className="z-10 flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-ui hover:bg-white/10"
            aria-label="Back to the chat list"
          >
            <Icon name="back" size={24} />
          </Link>
          <h1 className="pointer-events-none absolute inset-x-0 text-center font-headline text-[18px] font-bold tracking-tight text-white">
            Profile &amp; Settings
          </h1>
          <span className="h-12 w-12" aria-hidden="true" />
        </div>

        <div className="flex flex-col items-center px-5 pb-8 pt-2 text-center">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#00453d] ring-4 ring-white/15">
              <span className="select-none font-headline text-3xl font-bold text-white">{initial}</span>
            </div>
            <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#075e54] bg-[#25D366] text-white">
              <Icon name="check" size={14} />
            </div>
          </div>
          <h2 className="mt-3.5 font-headline text-[22px] font-extrabold leading-tight tracking-tight text-white">
            {user?.phoneNumber ?? "Unknown"}
          </h2>
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#00453d]/80 px-4 py-1.5">
            <span className="select-all text-[13px] font-semibold tracking-wide text-[#25D366]">
              {address}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col space-y-6 px-4 pb-6 pt-6">

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Personal details
          </h3>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <form className="flex min-h-[64px] w-full items-center gap-2 px-4 py-4" onSubmit={saveName}>
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#075e54]">
                  <Icon name="globe" size={20} />
                </div>
                <span className="text-[15px] font-medium text-slate-900">Name</span>
              </div>
              <input
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Your name"
                maxLength={40}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label="Your display name"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-[#25D366] px-4 py-1.5 text-[14px] font-semibold text-[#075e54] disabled:opacity-60"
                disabled={nameSaving}
              >
                {nameSaving ? "Saving" : "Save"}
              </button>
            </form>
          </div>
          <p className="mt-2 px-1 text-[12px] text-slate-500">
            Shown to people you write to. Leave it empty to show your number instead.
          </p>
          {nameNotice && <p className="mt-2 px-1 text-[14px] text-[#075e54]">{nameNotice}</p>}
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Alias IDs
          </h3>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            {aliases.length === 0 ? (
              <p className="px-4 py-3.5 text-[14px] text-slate-500">
                No aliases yet. An alias is a second address for this account.
              </p>
            ) : (
              aliases.map((alias) => (
                <div
                  key={alias.id}
                  className="flex min-h-[64px] w-full items-center justify-between border-b border-slate-100 px-4 py-4"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-slate-900">
                    {alias.address}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[14px] font-semibold text-red-500"
                    aria-label={`Remove alias ${alias.localPart}`}
                    onClick={() => void removeAlias(alias.localPart)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <form
              className="flex min-h-[64px] w-full items-center gap-2 border-t border-slate-100 px-4 py-4"
              onSubmit={addAlias}
            >
              <input
                className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="Add an alias, e.g. john.doe"
                autoCapitalize="none"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-[#25D366] px-4 py-1.5 text-[14px] font-semibold text-[#075e54] disabled:opacity-60"
                disabled={busy || draft.trim().length === 0}
              >
                {busy ? "Adding" : "Add"}
              </button>
            </form>
          </div>
          <p className="mt-2 px-1 text-[12px] text-slate-500">
            3-20 characters: lowercase letters, digits and dots. Mail sent to an alias reaches this
            account exactly like mail sent to the number.
          </p>
          {notice && <p className="mt-2 px-1 text-[14px] text-[#075e54]">{notice}</p>}
          {error && (
            <p className="mt-2 px-1 text-[14px] text-red-500" role="alert">
              {error}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Preferences
          </h3>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex min-h-[64px] w-full items-center justify-between bg-white px-4 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[#075e54]">
                  <Icon name="globe" size={20} />
                </div>
                <span className="text-[15px] font-medium text-slate-900">Language</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[14px] font-normal text-slate-600">English (India)</span>
                <span className="text-slate-400">
                  <Icon name="chevron" size={20} />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Actions
          </h3>
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <button
              type="button"
              className="flex min-h-[64px] w-full items-center justify-between px-4 py-4 text-left transition-colors duration-ui hover:bg-slate-50"
              onClick={() => {
                signOut();
                router.replace("/onboarding");
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <Icon name="logout" size={20} />
                </div>
                <span className="text-[15px] font-medium text-slate-900">Sign out</span>
              </div>
              <span className="text-slate-400">
                <Icon name="chevron" size={20} />
              </span>
            </button>
          </div>
        </section>

        <footer className="mt-auto flex flex-col items-center justify-center pb-2 pt-6">
          <div className="inline-flex max-w-[340px] items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2">
            <span className="shrink-0 text-slate-400">
              <Icon name="lock" size={15} />
            </span>
            <span className="text-[12px] leading-snug text-slate-600">End-to-end encrypted</span>
          </div>
          <p className="mt-2.5 font-mono text-[12px] text-slate-400">PhoneMail v0.1.0</p>
        </footer>
      </div>
    </main>
  );
}
