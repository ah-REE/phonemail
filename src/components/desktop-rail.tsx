"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/wordmark";
import { EMAIL_FOLDERS } from "@/lib/folders";
import { useAuth } from "@/lib/useAuth";

/**
 * ROUND 9: THE DESKTOP RAIL.
 *
 * The rail holds the three things the brief names and nothing else: the logo, the
 * folder items, and the profile/settings entries at the bottom.
 *
 * What it deliberately does NOT hold:
 *   - a Compose button. Compose is an action on the mail you are looking at, so
 *     it lives in the toolbar above the message list, where the list it acts on
 *     is. A compose button in the chrome is a button that belongs to no screen.
 *   - an "Inbox" item ALONGSIDE the folders. Inbox is a folder, and it is one of
 *     the folder items; listing it twice made the rail read as two navigations.
 *
 * The folder items are REAL: they are the three values `Email.folder` can hold
 * (lib/folders.ts), they link to the inbox with `?folder=`, and the list endpoint
 * answers that parameter. There is no "Drafts" item because drafts in this app
 * live in the browser and never become rows - see lib/folders.ts for why, and the
 * phone client for the one screen that reads them.
 *
 * ROUND 28.5 (the Figma pass): the rail now wears the design's own navy with a
 * slate muted step, rounded-lg rows on the design's 40px measure, and the
 * design's profile row - avatar, name, address - in place of the old "Profile"
 * label. The palette arrives as the `rail`/`neutral` tokens (no literal colour
 * lives here); the wordmark grows to the design's 22px. The bottom group keeps
 * its translucent 1px rule.
 */
export function DesktopRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onInbox = pathname?.startsWith("/desktop/inbox") ?? false;
  const activeFolder = searchParams?.get("folder") ?? "inbox";

  const { user, authorizedFetch } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);

  /**
   * The design's profile row wants a name; the per-tab session carries only the
   * number, so the display name is asked for once per mount. An absent name is
   * fine - the number is the honest fallback, and the row still links to Profile.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await authorizedFetch("/api/me");
        const body = (await response.json().catch(() => null)) as { user?: { displayName?: string | null } } | null;
        const name = body?.user?.displayName?.trim();
        if (!cancelled && name) {
          setDisplayName(name);
        }
      } catch {
        // the number is the fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

  const shownName = displayName?.trim() || user?.phoneNumber || "You";
  const address = user?.phoneNumber ? `${user.phoneNumber}@phonemail.com` : "";

  /**
   * ROUND 23b's rule is unchanged: whether there is chrome is decided once, in
   * components/desktop-shell.tsx, which renders this component only for a
   * signed-in session. The rail no longer decides anything about auth itself.
   */
  return (
    <nav className="flex w-[260px] shrink-0 flex-col gap-1 bg-rail p-4 text-rail-ink">
      {/* 1. the logo */}
      <Link
        href="/desktop/inbox"
        className="mb-4 flex items-center gap-2 px-1 font-headline text-[22px] font-bold"
      >
        {/* Inverted: the rail is dark chrome, so the mark has to read on it. */}
        <Wordmark as="span" size={22} invert />
      </Link>

      {/* 2. the folder items - one per value Email.folder can hold */}
      {EMAIL_FOLDERS.map((folder) => {
        const label = folder === "inbox" ? "Inbox" : folder === "spam" ? "Spam" : "Trash";
        const active = onInbox && activeFolder === folder;
        return (
          <Link
            key={folder}
            href={`/desktop/inbox?folder=${folder}`}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-0 items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors duration-ui ${
              active
                ? "bg-white/10 font-semibold text-rail-ink"
                : "font-medium text-rail-muted hover:bg-white/5 hover:text-rail-ink"
            }`}
          >
            <FolderIcon folder={folder} />
            {label}
          </Link>
        );
      })}

      {/* 3. profile and settings, at the bottom */}
      {/* The bottom group, above the reference's translucent 1px rule. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-white/25 pt-3">
        <Link
          href="/desktop/profile"
          aria-current={pathname?.startsWith("/desktop/profile") ? "page" : undefined}
          className="flex min-h-0 items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-ui hover:bg-white/5"
        >
          <Avatar size={32} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold leading-4 text-rail-ink">{shownName}</span>
            <span className="truncate text-[11px] leading-4 text-rail-muted">{address}</span>
          </span>
        </Link>
        <Link
          href="/desktop/settings"
          aria-current={pathname?.startsWith("/desktop/settings") ? "page" : undefined}
          className="flex min-h-0 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-rail-muted transition-colors duration-ui hover:bg-white/5 hover:text-rail-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M19.8 7.5l-1.9 1.1M6.1 15.4l-1.9 1.1" />
          </svg>
          Settings
        </Link>
        {/* The phone layout has an explicit URL, so this goes there rather than to
            `/`, which would hand a laptop straight back to the desktop client. */}
        <Link href="/mobile" className="mt-1 px-3 py-2 text-xs font-medium text-rail-muted underline transition-colors duration-ui hover:text-rail-ink">
          Mobile version
        </Link>
      </div>
    </nav>
  );
}

function FolderIcon({ folder }: { folder: string }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (folder === "spam") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 3.5l8 4v9l-8 4-8-4v-9l8-4z" />
        <path d="M12 8.5v4M12 15.6v.1" />
      </svg>
    );
  }
  if (folder === "trash") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 7.5l9 6 9-6" />
      <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
    </svg>
  );
}
