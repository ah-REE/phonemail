"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/useAuth";

/**
 * Profile & settings.
 *
 * The palette is the logo's: the identity block sits on the indigo chrome
 * (#1e3a8a) with the avatar ringed in white, the phone in white, the address
 * pill in the chrome's deep tint, and every action in the mark's own blue.
 *
 * Aliases are the app feature the mockup predates, so they get their own section
 * in the same card language. The notification switch and Delete account are now
 * REAL rows rather than mockup decoration: the switch is User.smsNotifications
 * (which the delivery gate reads) and deleting runs through a one-time code.
 *
 * Two rows were removed for one round and are BACK at the owner's request: the
 * Folders section (Drafts, Spam, Trash - the screens never went away, only their
 * door) and the Language row. Language is honest about itself: English is the one
 * language that ships, and the other two say so rather than pretending to switch
 * anything.
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
  name: "back" | "bell" | "check" | "chevron" | "globe" | "logout" | "lock" | "trash";
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
      {name === "bell" && (
        <>
          <path d="M6.5 16.5h11l-1.4-2.2V10a4.1 4.1 0 0 0-8.2 0v4.3z" {...stroke} />
          <path d="M10.4 19a1.7 1.7 0 0 0 3.2 0" {...stroke} />
        </>
      )}
      {name === "trash" && (
        <>
          <path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" {...stroke} />
          <path d="M10.5 11v6M13.5 11v6" {...stroke} />
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
  const [savedName, setSavedName] = useState<string | null>(null);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"confirm" | "otp">("confirm");
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteHint, setDeleteHint] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
        const body = (await me.json()) as {
          user?: { displayName?: string | null; smsNotifications?: boolean };
        };
        setNameDraft(body.user?.displayName ?? "");
        setSavedName(body.user?.displayName ?? null);
        setSmsNotifications(body.user?.smsNotifications ?? true);
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
      setSavedName(body.user?.displayName ?? null);
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

  /** Flip the new-mail SMS switch. The server owns the value; this echoes it back. */
  async function toggleSms() {
    const next = !smsNotifications;
    setSmsSaving(true);
    setSmsNotice(null);
    try {
      const response = await authorizedFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsNotifications: next }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: { smsNotifications?: boolean };
      };
      if (!response.ok) {
        setSmsNotice(body.error ?? "Could not change that setting.");
        return;
      }
      setSmsNotifications(Boolean(body.user?.smsNotifications));
      setSmsNotice(
        body.user?.smsNotifications
          ? "New mail will be texted to you."
          : "New mail texts are off.",
      );
    } catch {
      setSmsNotice("Network error. Please try again.");
    } finally {
      setSmsSaving(false);
    }
  }

  /** Step one of deleting: ask the server to text a code to this number. */
  async function beginDelete() {
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      const response = await authorizedFetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: user?.phoneNumber }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        devHint?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok) {
        setDeleteError(
          typeof body.retryAfterSeconds === "number"
            ? `Please wait ${body.retryAfterSeconds}s before requesting another code.`
            : body.error ?? "Could not send the code.",
        );
        return;
      }
      setDeleteHint(body.devHint ?? null);
      setDeleteStep("otp");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  /** Step two: the code is verified server-side before anything is removed. */
  async function confirmDelete() {
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      const response = await authorizedFetch("/api/me/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: deleteOtp }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        deleted?: boolean;
      };
      if (!response.ok || !body.deleted) {
        setDeleteError(body.error ?? "Could not delete the account.");
        return;
      }
      // The account is gone: clear this tab's session and start over.
      signOut();
      router.replace("/onboarding");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleteBusy(false);
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

  return (
    <main className="flex flex-1 flex-col bg-[#F8FAFC]">
      <header className="relative z-10 flex w-full flex-col bg-navy text-white">
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
            <Avatar size={80} className="ring-4 ring-white/15" />
            <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-navy bg-accent text-white">
              <Icon name="check" size={14} />
            </div>
          </div>
          {/* The name is primary when there is one and the number sits under it:
              the number is the mail address, not a person's identity. With no name
              set the number takes the top line, so nobody is ever nameless. */}
          <h2 className="mt-3.5 font-headline text-[22px] font-extrabold leading-tight tracking-tight text-white">
            {savedName?.trim() || user?.phoneNumber || "Unknown"}
          </h2>
          {savedName?.trim() ? (
            <p className="mt-1 select-all text-[15px] font-medium text-primary-fixed">
              {user?.phoneNumber}
            </p>
          ) : null}
          <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-navy-deep/80 px-4 py-1.5">
            <span className="select-all text-[13px] font-semibold tracking-wide text-primary-fixed">
              {address}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col space-y-6 px-4 pb-6 pt-6">

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-outline">
            Personal details
          </h3>
          <div className="overflow-hidden rounded-2xl border border-outline-variant/80 bg-white">
            <form className="flex min-h-[64px] w-full items-center gap-2 px-4 py-4" onSubmit={saveName}>
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-navy">
                  <Icon name="globe" size={20} />
                </div>
                <span className="text-[15px] font-medium text-on-surface">Name</span>
              </div>
              <input
                className="min-w-0 flex-1 bg-transparent text-right text-[15px] text-on-surface outline-none placeholder:text-outline"
                placeholder="Your name"
                maxLength={40}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                aria-label="Your display name"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white disabled:opacity-60"
                disabled={nameSaving}
              >
                {nameSaving ? "Saving" : "Save"}
              </button>
            </form>
          </div>
          <p className="mt-2 px-1 text-[12px] text-on-surface-variant">
            Shown to people you write to. Leave it empty to show your number instead.
          </p>
          {nameNotice && <p className="mt-2 px-1 text-[14px] text-navy">{nameNotice}</p>}
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-outline">
            Alias IDs
          </h3>
          <div className="overflow-hidden rounded-2xl border border-outline-variant/80 bg-white">
            {aliases.length === 0 ? (
              <p className="px-4 py-3.5 text-[14px] text-on-surface-variant">
                No aliases yet. An alias is a second address for this account.
              </p>
            ) : (
              aliases.map((alias) => (
                <div
                  key={alias.id}
                  className="flex min-h-[64px] w-full items-center justify-between border-b border-surface-container-low px-4 py-4"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-on-surface">
                    {alias.address}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[14px] font-semibold text-danger"
                    aria-label={`Remove alias ${alias.localPart}`}
                    onClick={() => void removeAlias(alias.localPart)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
            <form
              className="flex min-h-[64px] w-full items-center gap-2 border-t border-surface-container-low px-4 py-4"
              onSubmit={addAlias}
            >
              <input
                className="min-w-0 flex-1 bg-transparent text-[15px] text-on-surface outline-none placeholder:text-outline"
                placeholder="Add an alias, e.g. john.doe"
                autoCapitalize="none"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white disabled:opacity-60"
                disabled={busy || draft.trim().length === 0}
              >
                {busy ? "Adding" : "Add"}
              </button>
            </form>
          </div>
          <p className="mt-2 px-1 text-[12px] text-on-surface-variant">
            3-20 characters: lowercase letters, digits and dots. Mail sent to an alias reaches this
            account exactly like mail sent to the number.
          </p>
          {notice && <p className="mt-2 px-1 text-[14px] text-navy">{notice}</p>}
          {error && (
            <p className="mt-2 px-1 text-[14px] text-danger" role="alert">
              {error}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-outline">
            Folders
          </h3>
          {/* Restored at the owner's request. The three screens never went away -
              only the doors to them did - so this is a door, not new machinery. */}
          <div className="overflow-hidden rounded-2xl border border-outline-variant/80 bg-white">
            {[
              { href: "/drafts", label: "Drafts", paths: ["M6 3h8l4 4v14H6z", "M14 3v5h5"] },
              { href: "/spam", label: "Spam", paths: ["M12 3l8 4v6c0 4-3.4 6.8-8 8-4.6-1.2-8-4-8-8V7z"] },
              { href: "/trash", label: "Trash", paths: ["M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"] },
            ].map((row, index) => (
              <Link
                key={row.href}
                href={row.href}
                className={`flex min-h-[64px] w-full items-center justify-between px-4 py-4 transition-colors duration-ui hover:bg-paper ${
                  index === 0 ? "border-b border-surface-container" : ""
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-navy">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {row.paths.map((d) => (
                        <path key={d} d={d} />
                      ))}
                    </svg>
                  </div>
                  <span className="text-[15px] font-medium text-on-surface">{row.label}</span>
                </div>
                <span className="text-outline">
                  <Icon name="chevron" size={20} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-outline">
            Preferences
          </h3>
          <div className="overflow-hidden rounded-2xl border border-outline-variant/80 bg-white">
            {/* Language. Only English ships, so the control offers the other two
                as coming-soon entries that cannot be chosen - which is truer than
                a row that implies a switch it cannot perform. */}
            <div className="flex min-h-[64px] w-full items-center justify-between border-b border-surface-container-low bg-white px-4 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-navy">
                  <Icon name="globe" size={20} />
                </div>
                <label className="text-[15px] font-medium text-on-surface" htmlFor="language">
                  Language
                </label>
              </div>
              <select
                id="language"
                className="rounded-full border border-outline-variant bg-surface px-3 py-2 text-[14px] text-on-surface outline-none"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">English (India)</option>
                <option value="hi" disabled>
                  हिन्दी — coming soon
                </option>
                <option value="ta" disabled>
                  தமிழ் — coming soon
                </option>
              </select>
            </div>

            <div className="flex min-h-[64px] w-full items-center justify-between bg-white px-4 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-navy">
                  <Icon name="bell" size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-medium text-on-surface">SMS notifications</span>
                  <span className="text-[12px] text-on-surface-variant">
                    A text when new mail arrives
                  </span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={smsNotifications}
                aria-label="SMS notifications for new mail"
                disabled={smsSaving}
                onClick={() => void toggleSms()}
                className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-ui disabled:opacity-60 ${
                  smsNotifications ? "bg-accent" : "bg-surface-variant"
                }`}
              >
                <span
                  className={`absolute h-5 w-5 rounded-full bg-white shadow-card transition-all duration-ui ${
                    smsNotifications ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
            {smsNotice && (
              <p className="border-t border-surface-container-low px-4 py-3 text-[13px] text-navy">
                {smsNotice}
              </p>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-wider text-outline">
            Actions
          </h3>
          <div className="overflow-hidden rounded-2xl border border-outline-variant/80 bg-white">
            <button
              type="button"
              className="flex min-h-[64px] w-full items-center justify-between px-4 py-4 text-left transition-colors duration-ui hover:bg-paper"
              onClick={() => {
                signOut();
                router.replace("/onboarding");
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <Icon name="logout" size={20} />
                </div>
                <span className="text-[15px] font-medium text-on-surface">Sign out</span>
              </div>
              <span className="text-outline">
                <Icon name="chevron" size={20} />
              </span>
            </button>

            {/* Delete account: confirmation, then a one-time code, then the server
                checks BOTH before anything is removed. */}
            <button
              type="button"
              className="flex min-h-[64px] w-full items-center justify-between border-t border-surface-container px-4 py-4 text-left transition-colors duration-ui hover:bg-paper"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteStep("confirm");
                setDeleteOtp("");
                setDeleteHint(null);
                setDeleteError(null);
              }}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                  <Icon name="trash" size={20} />
                </div>
                <span className="text-[15px] font-medium text-danger">Delete account</span>
              </div>
            </button>
          </div>
        </section>

        <footer className="mt-auto flex flex-col items-center justify-center pb-2 pt-6">
          <div className="inline-flex max-w-[340px] items-center justify-center gap-2 rounded-xl border border-outline-variant/80 bg-white px-4 py-2">
            <span className="shrink-0 text-outline">
              <Icon name="lock" size={15} />
            </span>
            <span className="text-[12px] leading-snug text-on-surface-variant">End-to-end encrypted</span>
          </div>
          <p className="mt-2.5 font-mono text-[12px] text-outline">PhoneMail v0.1.0</p>
        </footer>
      </div>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-8"
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
        >
          <div className="surface flex w-full max-w-phone flex-col gap-3 bg-white p-5">
            {deleteStep === "confirm" ? (
              <>
                <h2 className="font-headline text-[19px] font-bold text-on-surface">
                  Delete this account?
                </h2>
                <p className="text-[14px] leading-relaxed text-on-surface-variant">
                  Every message in your mailbox, your aliases and your contacts are removed
                  permanently. This cannot be undone.
                </p>
                <p className="text-[13px] text-on-surface-variant">
                  We will first text a one-time code to{" "}
                  <span className="font-semibold text-on-surface">{user?.phoneNumber}</span>.
                </p>
                <button
                  type="button"
                  className="btn-brand mt-1 w-full"
                  onClick={() => void beginDelete()}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? <Spinner label="Sending" /> : "Send the code"}
                </button>
              </>
            ) : (
              <>
                <h2 className="font-headline text-[19px] font-bold text-on-surface">
                  Enter the code
                </h2>
                <p className="text-[14px] leading-relaxed text-on-surface-variant">
                  A one-time code was sent to{" "}
                  <span className="font-semibold text-on-surface">{user?.phoneNumber}</span>. It is
                  checked before anything is removed.
                </p>
                <label className="sr-only" htmlFor="delete-otp">
                  One-time code
                </label>
                <input
                  id="delete-otp"
                  className="w-full rounded-full border border-outline-variant bg-chat-field px-4 py-3 text-center text-[20px] font-bold tracking-[0.3em] text-on-surface outline-none placeholder:tracking-normal placeholder:text-outline"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  maxLength={6}
                  value={deleteOtp}
                  onChange={(event) => setDeleteOtp(event.target.value.replace(/D/g, "").slice(0, 6))}
                />
                {deleteHint && (
                  <p className="text-[13px] text-on-surface-variant">
                    <strong>Dev mode:</strong> {deleteHint}
                  </p>
                )}
                <button
                  type="button"
                  className="flex min-h-tap w-full items-center justify-center rounded-full bg-danger px-6 text-label-lg font-semibold text-white disabled:opacity-60"
                  onClick={() => void confirmDelete()}
                  disabled={deleteBusy || deleteOtp.length !== 6}
                >
                  {deleteBusy ? <Spinner label="Deleting" /> : "Delete my account"}
                </button>
              </>
            )}

            {deleteError && (
              <p className="text-[14px] text-danger" role="alert">
                {deleteError}
              </p>
            )}

            <button
              type="button"
              className="min-h-tap w-full rounded-full bg-chat-rail text-sm font-semibold text-on-surface"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
