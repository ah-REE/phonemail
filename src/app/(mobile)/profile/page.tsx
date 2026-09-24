"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { useAuth } from "@/lib/useAuth";

/**
 * Profile & settings.
 *
 * Day 6: alias IDs are functional here - list, add, remove - backed by
 * /api/aliases. An alias is a second address for the SAME account
 * (`john.doe@phonemail.com` beside `9876543210@phonemail.com`), so the mail the
 * owner receives does not change; only the address a sender had to know does.
 *
 * Functional only - the visual pass on this surface comes later.
 */

interface Alias {
  id: string;
  localPart: string;
  address: string;
  createdAt?: string;
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
      <main className="flex flex-1 flex-col">
        <AppBar title="Profile" backHref="/" />
        <div className="p-4">
          <span className="skeleton h-20 w-full rounded-card" />
        </div>
      </main>
    );
  }

  const address = user ? `${user.phoneNumber}@phonemail.com` : "-";

  return (
    <main className="flex flex-1 flex-col">
      <AppBar title="Profile & settings" backHref="/" />

      <section className="flex flex-col gap-4 p-4">
        <div className="surface flex items-center gap-4 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wa-teal text-2xl font-semibold text-white">
            {user?.phoneNumber?.slice(0, 1) ?? "?"}
          </span>
          <div>
            <p className="text-lg font-semibold">{user?.phoneNumber ?? "Unknown"}</p>
            <p className="text-sm text-wa-muted">{address}</p>
          </div>
        </div>

        <div className="surface p-4">
          <p className="text-sm text-wa-muted">Alias IDs</p>

          {aliases.length === 0 ? (
            <p className="mt-1 text-base">
              No aliases yet. An alias is a second address for this account.
            </p>
          ) : (
            <ul className="mt-1">
              {aliases.map((alias) => (
                <li
                  key={alias.id}
                  className="flex items-center gap-3 border-b border-wa-line py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base">{alias.address}</span>
                  </span>
                  <button
                    type="button"
                    className="min-h-tap rounded border border-wa-line px-3 text-sm text-wa-alert"
                    aria-label={`Remove alias ${alias.localPart}`}
                    onClick={() => void removeAlias(alias.localPart)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="mt-3 flex items-end gap-2" onSubmit={addAlias}>
            <label className="min-w-0 flex-1 text-sm text-wa-muted">
              Add an alias
              <input
                className="field mt-1"
                placeholder="john.doe"
                autoCapitalize="none"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={busy || draft.trim().length === 0}>
              {busy ? "Adding." : "Add"}
            </button>
          </form>

          <p className="mt-2 text-xs text-wa-muted">
            3-20 characters: lowercase letters, digits and dots. Mail sent to an alias reaches this
            account exactly like mail sent to the number.
          </p>

          {notice && <p className="mt-2 text-sm text-wa-teal">{notice}</p>}
          {error && (
            <p className="mt-2 text-sm text-wa-alert" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="surface p-4">
          <p className="text-sm text-wa-muted">Language</p>
          <p className="text-lg">English (more languages land later).</p>
        </div>

        <button
          type="button"
          className="btn-quiet w-full"
          onClick={() => {
            signOut();
            router.replace("/onboarding");
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
