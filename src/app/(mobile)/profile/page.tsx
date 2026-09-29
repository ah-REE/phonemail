"use client";

import { guardRedirect } from "@/lib/entry";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/back-button";
import { Spinner } from "@/components/spinner";
import { PinSettings } from "@/components/pin-settings";
import { Switch } from "@/components/switch";
import { FONT_SIZES, applyFontSize, readFontSize, type FontSizeId } from "@/lib/fontSize";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/useAuth";

/**
 * Profile & settings, to the owner's reference.
 *
 * EVERY COLOUR HERE IS SAMPLED FROM THAT REFERENCE, into the `settings` token
 * group rather than typed inline, so this screen and the rest of the app cannot
 * drift apart. The reference's own geometry: a full-bleed gradient hero with the
 * bottom corners cut round; uppercase section headings sitting ABOVE white cards;
 * a circular icon chip at the head of every row; a solid blue pill for the one
 * primary action on a row; a hairline inside a card that starts at the text
 * column rather than at the card's edge.
 *
 * Two things live here that the reference does not draw, and they are named
 * rather than smuggled in: the FOLDERS section and the Language row. The owner
 * asked for both back a round earlier, so they are kept - in the reference's own
 * row grammar, in their old places, so the drawn sections still read exactly as
 * drawn. Removing them is a one-line deletion and the owner's call.
 *
 * The things the reference cannot show and the app still needs are kept and
 * styled to disappear into it: the alias list, the alias Remove action, the
 * save/notice/error lines, and the delete confirmation sheet.
 */

interface Alias {
  id: string;
  localPart: string;
  address: string;
  createdAt?: string;
}

/** Mirrors ALIAS_LIMIT in src/lib/alias.ts. Kept as a local because that module
 *  reaches for Prisma and must never be pulled into a client component. */
const ALIAS_LIMIT = 1;

type IconName =
  | "back"
  | "bell"
  | "text"
  | "check"
  | "chevron"
  | "copy"
  | "globe"
  | "lock"
  | "logout"
  | "pencil"
  | "person"
  | "translate"
  | "trash";

function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className = "",
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      {name === "back" && <path d="M15 5l-7 7 7 7" {...stroke} />}
      {name === "chevron" && <path d="M9 5l7 7-7 7" {...stroke} />}
      {name === "check" && <path d="M5 13l4 4L19 7" {...stroke} />}
      {name === "copy" && (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2.5" {...stroke} />
          <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15" {...stroke} />
        </>
      )}
      {name === "person" && (
        <>
          <circle cx="12" cy="8.6" r="3.6" {...stroke} />
          <path d="M5 20a7 7 0 0 1 14 0" {...stroke} />
        </>
      )}
      {name === "pencil" && (
        <>
          <path d="M4.5 19.5l4.2-1.1 9.6-9.6a2.2 2.2 0 0 0-3.1-3.1l-9.6 9.6z" {...stroke} />
          <path d="M13.6 7.2l3.2 3.2" {...stroke} />
        </>
      )}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="8" {...stroke} />
          <path d="M4 12h16M12 4c2.2 2.4 2.2 13.2 0 16M12 4c-2.2 2.4-2.2 13.2 0 16" {...stroke} />
        </>
      )}
      {name === "logout" && (
        <>
          <path d="M14 5h3.5A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5H14" {...stroke} />
          <path d="M11 9l-3.5 3L11 15M4 12h7" {...stroke} />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="10.5" width="14" height="9" rx="2.5" {...stroke} />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...stroke} />
        </>
      )}
      {name === "bell" && (
        <>
          <path d="M6.5 16.5h11l-1.4-2.2V10a4.1 4.1 0 0 0-8.2 0v4.3z" {...stroke} />
          <path d="M10.4 19a1.7 1.7 0 0 0 3.2 0" {...stroke} />
        </>
      )}
      {/* The conventional language mark: an A meeting a script - which says
          "translation" where a globe only said "world". */}
      {name === "translate" && (
        <>
          <path d="M3 6h9M7.5 4.5V6c0 4-2 7-4.5 8.5" {...stroke} />
          <path d="M4.5 11c1.6 2.4 3.6 4 5.5 4.8" {...stroke} />
          <path d="M13 21l4-10 4 10M14.6 17.4h4.8" {...stroke} />
        </>
      )}
      {/* The type mark for the font-size row: a serif-ish "T", which is what a
          typeface control looks like everywhere else. */}
      {name === "text" && (
        <>
          <path d="M5 7V5h14v2" {...stroke} />
          <path d="M12 5v14M9.5 19h5" {...stroke} />
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

const FOLDER_ROWS: { href: string; label: string; paths: string[] }[] = [
  { href: "/drafts", label: "Drafts", paths: ["M6 3h8l4 4v14H6z", "M14 3v5h5"] },
  { href: "/spam", label: "Spam", paths: ["M12 3l8 4v6c0 4-3.4 6.8-8 8-4.6-1.2-8-4-8-8V7z"] },
  { href: "/trash", label: "Trash", paths: ["M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"] },
];

/** The heading above every card: small, grey, letterspaced, uppercase. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-settings-faint">
      {children}
    </h3>
  );
}

/** The white card the reference puts under every heading. */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-settings-hair bg-settings-card ${className}`}>
      {children}
    </div>
  );
}

/** The circular chip that heads a row, and the inset rule that separates rows. */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-settings-chip text-settings-chipink">
      {children}
    </span>
  );
}

function InsetRule() {
  return <span className="absolute left-[78px] right-0 top-0 h-px bg-settings-line" aria-hidden="true" />;
}

export default function ProfilePage() {
  const router = useRouter();
  const { status, token, user, signOut, authorizedFetch } = useAuth();

  const [aliases, setAliases] = useState<Alias[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState("en");
  // A display preference, per device. Read on mount so the row shows what is
  // actually applied (the head script set it before paint); written on change.
  const [fontSize, setFontSize] = useState<FontSizeId>("normal");
  // Day 9: the devices signed in to this account.
  const [sessions, setSessions] = useState<
    { id: string; device: string; current: boolean; createdAt: string; lastActive: string }[]
  >([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [loggingOutId, setLoggingOutId] = useState<string | null>(null);

  // Read what is actually applied AFTER mount rather than during render: the head
  // script has already set the size, and reading storage while rendering would make
  // the server's markup and the client's first render disagree.
  useEffect(() => {
    setFontSize(readFontSize());
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/sessions");
      if (!response.ok) {
        setSessionsError("Could not read your signed-in devices.");
        return;
      }
      const body = (await response.json()) as { sessions?: typeof sessions };
      setSessions(body.sessions ?? []);
      setSessionsError(null);
    } catch {
      setSessionsError("Network error.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  /**
   * Log ONE device out by deleting its session. Deleting the row is what ends that
   * token: the next request from that device is refused. When it is THIS device, the
   * client clears its own session and returns to the door, which is what signing out
   * has always done.
   */
  async function logOutDevice(session: { id: string; current: boolean }) {
    setLoggingOutId(session.id);
    try {
      const response = await authorizedFetch(`/api/sessions/${session.id}`, { method: "DELETE" });
      if (session.current || response.status === 401) {
        signOut();
        router.push("/onboarding");
        return;
      }
      if (response.ok) {
        await loadSessions();
      }
    } finally {
      setLoggingOutId(null);
    }
  }
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
  const [copied, setCopied] = useState(false);

  const nameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      guardRedirect(router);
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

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token, load]);

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
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: { displayName?: string | null };
      };
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
        body.user?.smsNotifications ? "New mail will be texted to you." : "New mail texts are off.",
      );
    } catch {
      setSmsNotice("Network error. Please try again.");
    } finally {
      setSmsSaving(false);
    }
  }

  /** The reference's copy glyph, made real rather than decorative. */
  async function copyAddress() {
    const address = `${user?.phoneNumber ?? ""}@phonemail.com`;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
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
      guardRedirect(router);
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col bg-settings-canvas p-4">
        <span className="skeleton h-20 w-20 self-center rounded-full" />
        <span className="skeleton mt-4 h-6 w-40 self-center rounded-full" />
      </main>
    );
  }

  const address = user ? `${user.phoneNumber}@phonemail.com` : "";
  const canAdd = draft.trim().length > 0 && !busy && aliases.length < ALIAS_LIMIT;

  return (
    <main className="flex flex-1 flex-col bg-settings-canvas">
      {/* THE HERO. The reference runs one soft blue gradient from a near-white
          top-left into its deepest blue at the bottom-right, cuts the panel's
          bottom corners round, and floats the header on the pale top of it. */}
      <header
        className="relative flex w-full flex-col rounded-b-[30px] px-5 pb-6 pt-2"
        style={{
          backgroundImage:
            "radial-gradient(115% 85% at 100% 100%, #7ba5f0 0%, rgba(123,165,240,0) 58%), radial-gradient(120% 70% at 8% 0%, #e8f0ff 0%, rgba(232,240,255,0) 62%), linear-gradient(152deg, #e8f0ff 0%, #dce9ff 34%, #c3d9fb 68%, #8fb6f7 100%)",
        }}
      >
        <div className="relative flex h-12 items-center justify-between">
          {/* ROUND 4: the header-alignment rule - the same BackButton geometry as
              every other header, with this header's own ink. */}
          <BackButton
            href="/"
            tone="none"
            className="z-10 text-settings-ink hover:bg-white/40"
            label="Back to the chat list"
          />
          <h1 className="pointer-events-none absolute inset-x-0 text-center text-[21px] font-bold tracking-[-0.01em] text-settings-ink">
            Profile &amp; Settings
          </h1>
          <span className="h-12 w-12" aria-hidden="true" />
        </div>

        <div className="flex flex-col items-center px-2 pb-1 pt-3 text-center">
          <div className="relative">
            <Avatar
              size={108}
              tone="settings"
              className="ring-4 ring-settings-ring"
            />
            {/* The reference's badge is a pencil, not a tick: it opens the name
                field rather than reporting something that already happened.
                ROUND 6/7: the geometry is spelled out so nothing can distort the
                circle - an explicit square box, border-box sizing, no padding, no
                line-height, the glyph centred by flex, and `min-h-0` because the
                base layer floors every button at 56px (without it this 40px badge
                rendered 40x56: an oval). The corner placement is an absolute
                position plus a translate, and the wrapper is a plain `relative`
                box with NO overflow-hidden, so the badge can never be clipped. */}
            <button
              type="button"
              className="absolute bottom-0 right-0 min-h-0 box-border flex aspect-square h-10 w-10 shrink-0 translate-x-[2px] translate-y-[2px] items-center justify-center rounded-full bg-settings-brand p-0 leading-none text-white ring-[3px] ring-white shadow-card transition-transform duration-ui active:scale-95"
              aria-label="Change your display name"
              onClick={() => {
                nameFieldRef.current?.focus();
                nameFieldRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
              }}
            >
              <Icon name="pencil" size={18} strokeWidth={2} />
            </button>
          </div>

          <h2 className="mt-3 text-[27px] font-bold leading-tight tracking-[-0.018em] text-settings-ink">
            {savedName?.trim() || user?.phoneNumber || "Unknown"}
          </h2>
          {/* ROUND 9: with a name set, the header shows the NAME and the ADDRESS - the
              raw mobile number is gone from here rather than repeated twice. The
              address is the pill below, which is also the thing you can copy. */}
          {savedName?.trim() ? (
            <p className="mt-1 select-all text-[17px] text-settings-quiet">{address}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void copyAddress()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-settings-pill px-5 py-2.5 transition-colors duration-ui hover:bg-white/80"
            aria-label={`Copy your address ${address}`}
          >
            <span className="select-all text-[15px] text-settings-ink">{address}</span>
            <span className="text-[#475467]" aria-hidden="true">
              <Icon name={copied ? "check" : "copy"} size={17} strokeWidth={1.9} />
            </span>
          </button>
          {copied ? (
            <p className="mt-1.5 text-[13px] font-medium text-settings-quiet" role="status">
              Address copied
            </p>
          ) : null}
        </div>
      </header>

      {/* DENSITY PASS (owner's note): every option was swimming in space. The rule is
          now one rhythm - a heading sits 6px above its card, rows are 64px not 72px
          with 12px of padding rather than 16px, and sections are 20px apart rather
          than 28px. The 64px rows are still well clear of the 56px touch floor. */}
      <div className="flex flex-1 flex-col gap-5 px-5 pb-5 pt-5">
        {/* ROUND 22: the PIN lock, in its own section above the personal details -
            a security setting nobody can find is a security setting nobody uses. */}
        <section>
          <SectionHeading>Security</SectionHeading>
          <Card>
            <div className="px-4 py-3">
              <PinSettings />
            </div>
          </Card>
        </section>

        {/* ---------------------------------------------------------- PERSONAL */}
        <section>
          <SectionHeading>Personal details</SectionHeading>
          <Card>
            <form className="flex min-h-[64px] w-full items-center gap-4 px-4 py-3" onSubmit={saveName}>
              <Chip>
                <Icon name="person" size={21} />
              </Chip>
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="display-name"
                  className="block text-[17px] font-semibold text-settings-ink"
                >
                  Name
                </label>
                <input
                  id="display-name"
                  ref={nameFieldRef}
                  className="mt-0.5 w-full bg-transparent text-[15px] text-settings-quiet outline-none placeholder:text-settings-faint focus:text-settings-ink"
                  placeholder="Add your name"
                  maxLength={40}
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-full bg-settings-brand px-[22px] py-3 text-[15px] font-semibold text-white transition-opacity duration-ui disabled:opacity-60"
                disabled={nameSaving}
              >
                {nameSaving ? "Saving" : "Save"}
              </button>
            </form>
          </Card>
          <p className="mt-1.5 px-1 text-[14px] leading-[1.45] text-settings-quiet">
            Shown to people you write to. Leave it empty to show your number instead.
          </p>
          {nameNotice && <p className="mt-2 px-1 text-[14px] text-settings-ink">{nameNotice}</p>}
        </section>

        {/* ------------------------------------------------------------- ALIAS */}
        <section>
          <SectionHeading>Alias IDs</SectionHeading>
          <Card>
            <div className="p-4">
              {aliases.length === 0 ? (
                <p className="text-[15px] leading-[1.45] text-[#344054]">
                  No aliases yet. An alias is a second address for this account.
                </p>
              ) : (
                <ul>
                  {aliases.map((alias, index) => (
                    <li
                      key={alias.id}
                      className={`relative flex items-center justify-between gap-3 ${
                        index === 0 ? "" : "border-t border-settings-line"
                      } py-3 first:pt-0`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[15px] text-[#344054]">
                        {alias.address}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[15px] font-semibold text-settings-danger"
                        aria-label={`Remove alias ${alias.localPart}`}
                        onClick={() => void removeAlias(alias.localPart)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                className={`flex items-center gap-3 ${aliases.length === 0 ? "mt-4" : "mt-2 border-t border-settings-line pt-4"}`}
                onSubmit={addAlias}
              >
                <input
                  className="h-[48px] min-w-0 flex-1 rounded-xl bg-settings-field px-4 text-[15px] text-settings-ink outline-none placeholder:text-settings-faint"
                  placeholder="Add an alias, e.g. john.doe"
                  aria-label="New alias"
                  autoCapitalize="none"
                  autoComplete="off"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  className={`h-[48px] shrink-0 rounded-full px-6 text-[15px] font-semibold text-white transition-colors duration-ui ${
                    canAdd ? "bg-settings-brand" : "bg-settings-brandsoft"
                  }`}
                  disabled={!canAdd}
                >
                  {busy ? "Adding" : "Add"}
                </button>
              </form>
            </div>
          </Card>
          <p className="mt-1.5 px-1 text-[14px] leading-[1.45] text-settings-quiet">
            3-20 characters, and it must mix letters with numbers - lowercase letters, digits and
            dots. Mail sent to an alias reaches this account exactly like mail sent to the number.
          </p>
          {aliases.length >= ALIAS_LIMIT && (
            <p className="mt-1.5 px-1 text-[14px] leading-[1.45] text-settings-quiet">
              One alias per account, for now. Remove the one you have to create a different one.
            </p>
          )}
          {notice && <p className="mt-2 px-1 text-[14px] text-settings-ink">{notice}</p>}
          {error && (
            <p className="mt-2 px-1 text-[14px] text-settings-danger" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* ----------------------------------------------------------- FOLDERS
            Not in the reference. The owner asked for these back a round earlier,
            so they stay - in the reference's own row grammar. */}
        <section>
          <SectionHeading>Folders</SectionHeading>
          <Card>
            {FOLDER_ROWS.map((row, index) => (
              <Link
                key={row.href}
                href={row.href}
                className="relative flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3 transition-colors duration-ui hover:bg-settings-canvas"
              >
                {index > 0 && <InsetRule />}
                <span className="flex min-w-0 items-center gap-4">
                  <Chip>
                    <svg
                      width="21"
                      height="21"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {row.paths.map((d) => (
                        <path key={d} d={d} />
                      ))}
                    </svg>
                  </Chip>
                  <span className="text-[17px] font-semibold text-settings-ink">{row.label}</span>
                </span>
                <span className="shrink-0 text-settings-faint">
                  <Icon name="chevron" size={20} />
                </span>
              </Link>
            ))}
          </Card>
        </section>

        {/* ------------------------------------------------------- PREFERENCES */}
        <section>
          <SectionHeading>Signed-in devices</SectionHeading>
          <Card>
            {sessionsError ? (
              <p className="px-4 py-3 text-sm text-wa-alert" role="alert">
                {sessionsError}
              </p>
            ) : null}
            {sessions.length === 0 && !sessionsError ? (
              <p className="px-4 py-3 text-sm text-settings-quiet">Reading your devices...</p>
            ) : null}
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[17px] font-semibold text-settings-ink">
                      {session.device}
                    </span>
                    {session.current ? (
                      <span className="shrink-0 rounded-full bg-settings-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-settings-quiet">
                        This device
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-settings-quiet">
                    Signed in {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
                    {session.lastActive}
                  </span>
                </span>
                <button
                  type="button"
                  className="min-h-0 shrink-0 rounded-full bg-settings-pill px-4 py-2 text-[14px] font-semibold text-settings-ink disabled:opacity-60"
                  disabled={loggingOutId === session.id}
                  onClick={() => void logOutDevice(session)}
                >
                  {loggingOutId === session.id ? "Logging out..." : "Log out"}
                </button>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <SectionHeading>Preferences</SectionHeading>
          <Card>
            {/* FONT SIZE: the elder-friendly design makes this worth having, and it
                scales the whole system because every size is in rem. */}
            <div className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3">
              <span className="flex min-w-0 items-center gap-4">
                <Chip>
                  <Icon name="text" size={21} />
                </Chip>
                <label className="text-[17px] font-semibold text-settings-ink" htmlFor="font-size">
                  Font size
                </label>
              </span>
              <span className="relative flex shrink-0 items-center">
                <select
                  id="font-size"
                  className="appearance-none bg-transparent pr-7 text-right text-[15px] font-medium text-settings-quiet outline-none"
                  value={fontSize}
                  onChange={(event) => {
                    const next = event.target.value as FontSizeId;
                    setFontSize(next);
                    applyFontSize(next);
                  }}
                >
                  {FONT_SIZES.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-0 text-settings-faint">
                  <Icon name="chevron" size={16} />
                </span>
              </span>
            </div>

            {/* Language is the other carried-over row. English is the one language
                that ships; the other two say so rather than pretending. */}
            <div className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3">
              <span className="flex min-w-0 items-center gap-4">
                <Chip>
                  <Icon name="translate" size={21} />
                </Chip>
                <label className="text-[17px] font-semibold text-settings-ink" htmlFor="language">
                  Language
                </label>
              </span>
              <span className="relative flex shrink-0 items-center">
                <select
                  id="language"
                  className="appearance-none bg-transparent pr-7 text-right text-[15px] font-medium text-settings-quiet outline-none"
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
                <span className="pointer-events-none absolute right-0 text-settings-faint">
                  <Icon name="chevron" size={18} />
                </span>
              </span>
            </div>

            <div className="relative flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3">
              <InsetRule />
              <span className="flex min-w-0 items-center gap-4">
                <Chip>
                  <Icon name="bell" size={21} />
                </Chip>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[17px] font-semibold text-settings-ink">
                    SMS notifications
                  </span>
                  <span className="mt-0.5 text-[14.5px] text-settings-quiet">
                    A text when new mail arrives
                  </span>
                </span>
              </span>
              {/* ROUND 6: one conventional Switch (components/switch.tsx). The knob
                  used to be `absolute` inside a flex track, so its static position
                  - not the track's own centring - decided where it sat. The
                  reference draws the switch OFF: a grey track, knob at the left.
                  On is the app's own blue. */}
              <Switch
                checked={smsNotifications}
                onChange={() => void toggleSms()}
                disabled={smsSaving}
                label="SMS notifications for new mail"
              />
            </div>

            {smsNotice && (
              <p className="relative border-t border-settings-line px-5 py-3 text-[14px] text-settings-quiet">
                {smsNotice}
              </p>
            )}
          </Card>
        </section>

        {/* ----------------------------------------------------------- ACTIONS */}
        <section>
          <SectionHeading>Actions</SectionHeading>
          <Card>
            <button
              type="button"
              className="flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-ui hover:bg-settings-canvas"
              onClick={() => {
                signOut();
                guardRedirect(router);
              }}
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-settings-dangersoft text-settings-danger">
                  <Icon name="logout" size={21} />
                </span>
                <span className="text-[17px] font-semibold text-settings-ink">Sign out</span>
              </span>
              <span className="shrink-0 text-settings-faint">
                <Icon name="chevron" size={20} />
              </span>
            </button>

            {/* Delete account: confirmation, then a one-time code, then the server
                checks BOTH before anything is removed. The reference reds only this
                row's label; its background stays plain white. */}
            <button
              type="button"
              className="relative flex min-h-[64px] w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors duration-ui hover:bg-settings-canvas"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteStep("confirm");
                setDeleteOtp("");
                setDeleteHint(null);
                setDeleteError(null);
              }}
            >
              <InsetRule />
              <span className="flex min-w-0 items-center gap-4">
                <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-settings-dangersoft text-settings-danger">
                  <Icon name="trash" size={21} />
                </span>
                <span className="text-[17px] font-semibold text-settings-danger">
                  Delete account
                </span>
              </span>
              <span className="shrink-0 text-settings-faint">
                <Icon name="chevron" size={20} />
              </span>
            </button>
          </Card>
        </section>

        <footer className="mt-auto flex flex-col items-center justify-center pb-1 pt-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-settings-track/80 bg-white px-5 py-2.5">
            <span className="shrink-0 text-settings-quiet">
              <Icon name="lock" size={16} />
            </span>
            <span className="text-[14px] text-settings-quiet">Your mail is private</span>
          </div>
          {/* ROUND 4: the name carries the wordmark treatment here too. */}
          <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-settings-faint">
            {/* ROUND 5 review: 13px read as fine print under a 12.5px line, so the
                name was smaller than the version beside it. 14px puts the wordmark
                on the same optical rung as the message box's own small text and
                lets "Phone" lead the line, which is the point of a wordmark. */}
            <Wordmark as="span" size={14} />
            <span>v0.1.0</span>
          </p>
        </footer>
      </div>

      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-8"
          role="dialog"
          aria-modal="true"
          aria-label="Delete account"
        >
          <div className="flex w-full max-w-phone flex-col gap-3 rounded-2xl bg-white p-5 shadow-overlay">
            {deleteStep === "confirm" ? (
              <>
                <h2 className="text-[19px] font-bold text-settings-ink">Delete this account?</h2>
                <p className="text-[14px] leading-relaxed text-settings-quiet">
                  Every message in your mailbox, your aliases and your contacts are removed
                  permanently. This cannot be undone.
                </p>
                <p className="text-[13px] text-settings-quiet">
                  We will first text a one-time code to{" "}
                  <span className="font-semibold text-settings-ink">{user?.phoneNumber}</span>.
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
                <h2 className="text-[19px] font-bold text-settings-ink">Enter the code</h2>
                <p className="text-[14px] leading-relaxed text-settings-quiet">
                  A one-time code was sent to{" "}
                  <span className="font-semibold text-settings-ink">{user?.phoneNumber}</span>. It is
                  checked before anything is removed.
                </p>
                <label className="sr-only" htmlFor="delete-otp">
                  One-time code
                </label>
                <input
                  id="delete-otp"
                  className="w-full rounded-full border border-settings-line bg-settings-field px-4 py-3 text-center text-[20px] font-bold tracking-[0.3em] text-settings-ink outline-none placeholder:tracking-normal placeholder:text-settings-faint"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  maxLength={6}
                  value={deleteOtp}
                  onChange={(event) => setDeleteOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {deleteHint && (
                  <p className="text-[13px] text-settings-quiet">
                    <strong>Dev mode:</strong> {deleteHint}
                  </p>
                )}
                <button
                  type="button"
                  className="flex min-h-tap w-full items-center justify-center rounded-full bg-settings-danger px-6 text-label-lg font-semibold text-white disabled:opacity-60"
                  onClick={() => void confirmDelete()}
                  disabled={deleteBusy || deleteOtp.length !== 6}
                >
                  {deleteBusy ? <Spinner label="Deleting" /> : "Delete my account"}
                </button>
              </>
            )}

            {deleteError && (
              <p className="text-[14px] text-settings-danger" role="alert">
                {deleteError}
              </p>
            )}

            <button
              type="button"
              className="min-h-tap w-full rounded-full bg-settings-field text-sm font-semibold text-settings-ink"
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
