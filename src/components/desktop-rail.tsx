"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Wordmark } from "@/components/wordmark";
import { EMAIL_FOLDERS } from "@/lib/folders";

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
 */
export function DesktopRail() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onInbox = pathname?.startsWith("/desktop/inbox") ?? false;
  const activeFolder = searchParams?.get("folder") ?? "inbox";

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 bg-primary-container p-4 text-on-primary">
      {/* 1. the logo */}
      <Link
        href="/desktop/inbox"
        className="mb-4 flex items-center gap-2 px-1 font-headline text-lg font-bold"
      >
        {/* Inverted, the way round 4 drew it on the indigo chrome: the rail IS that
            chrome now, so the mark has to read on it. */}
        <Wordmark as="span" size={20} invert />
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
            className={`flex min-h-0 items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors duration-ui ${
              active
                ? "bg-white/15 font-bold text-on-primary"
                : "font-medium text-on-primary/75 hover:bg-white/10 hover:text-on-primary"
            }`}
          >
            <FolderIcon folder={folder} />
            {label}
          </Link>
        );
      })}

      {/* 3. profile and settings, at the bottom */}
      <div className="mt-auto flex flex-col gap-1 border-t border-white/15 pt-3">
        <Link
          href="/desktop/profile"
          aria-current={pathname?.startsWith("/desktop/profile") ? "page" : undefined}
          className="flex min-h-0 items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-on-primary/75 transition-colors duration-ui hover:bg-white/10 hover:text-on-primary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.8" />
            <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
          </svg>
          Profile
        </Link>
        <Link
          href="/desktop/settings"
          aria-current={pathname?.startsWith("/desktop/settings") ? "page" : undefined}
          className="flex min-h-0 items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-on-primary/75 transition-colors duration-ui hover:bg-white/10 hover:text-on-primary"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M19.8 7.5l-1.9 1.1M6.1 15.4l-1.9 1.1" />
          </svg>
          Settings
        </Link>
        {/* The phone layout has an explicit URL, so this goes there rather than to
            `/`, which would hand a laptop straight back to the desktop client. */}
        <Link href="/mobile" className="mt-1 px-3 py-2 text-xs font-medium text-on-primary/75 underline">
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
      <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M12 3.5l8 4v9l-8 4-8-4v-9l8-4z" />
        <path d="M12 8.5v4M12 15.6v.1" />
      </svg>
    );
  }
  if (folder === "trash") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
        <path d="M5 7h14M10 7V5h4v2M8 7l1 12h6l1-12" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
      <path d="M3 7.5l9 6 9-6" />
      <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5z" />
    </svg>
  );
}
