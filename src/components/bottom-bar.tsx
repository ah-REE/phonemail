"use client";

import Link from "next/link";

/**
 * The home bottom bar.
 *
 * Three tabs, and they are the three places a person actually goes from the chat
 * list: the list itself, the address book, and the messages marked favorite.
 *
 * ADDITIVE, as the brief requires: the folder links (Drafts, Spam, Trash) and the
 * filter chips stay exactly where they were. Favorites is a TAB here and a CHIP
 * there, and both drive the same filter - neither is a second implementation.
 *
 * The Favorites tab passes the filter in the query string rather than
 * duplicating the list on a second route. The home screen reads it directly off
 * window.location in an effect; using useSearchParams there would force a
 * Suspense boundary around a screen that currently prerenders fine.
 */

export type BottomTab = "home" | "contacts" | "favorites";

const TABS: Array<{ key: BottomTab; label: string; href: string; path: string }> = [
  { key: "home", label: "Home", href: "/", path: "M4 11l8-6.5 8 6.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" },
  { key: "contacts", label: "Contacts", href: "/contacts", path: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 4v16M13 9h2M13 13h2" },
  { key: "favorites", label: "Favorites", href: "/?filter=favorites", path: "M12 4l2.5 5.2 5.5.7-4 3.9 1 5.6-5-2.9-5 2.9 1-5.6-4-3.9 5.5-.7z" },
];

export function BottomBar({ active }: { active: BottomTab }) {
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-1/2 z-20 w-full max-w-phone -translate-x-1/2 border-t border-outline-variant bg-chat-sheet pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex h-16 w-full items-stretch">
        {TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  current ? "text-accent" : "text-chat-meta"
                }`}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill={current && tab.key === "favorites" ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={tab.path} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
