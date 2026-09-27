/**
 * The chat timeline's two boundaries, in one place.
 *
 * A thread is a list of messages read oldest-first, and two things cut across it:
 * the CALENDAR DAY and the SUBJECT. Both are DERIVED from the ordered list rather
 * than stored, which is what makes them work for a message that arrives over the
 * socket exactly as they do for one that was fetched: when the provisional bubble
 * is reconciled with the server's row, the list is still ordered, so the boundary
 * is still computed in the right place.
 *
 * They live here, and not twice inside two page components, because the group
 * thread and the 1:1 thread must not disagree about when a day or a subject
 * changed - the same reason the palette lives in the Tailwind config.
 */

/** The calendar day a message belongs to, as a comparable key. */
export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

/** True when this message opens a new calendar day in the thread. */
export function startsNewDay(previousIso: string | undefined, iso: string): boolean {
  return previousIso === undefined || dayKey(previousIso) !== dayKey(iso);
}

/**
 * True when this message opens a new subject - i.e. when its subject differs from
 * the one before it. That includes a reply, deliberately: the server stores
 * `re: <subject>` on a reply, so a reply's subject differs from the mail it
 * answers, and the boundary is then LABELLED for what it is (`re: <subject>`, per
 * the round-4 rule) rather than hidden. What matters here is that the boundary is
 * computed from the ordered list, so a live arrival cuts the thread in the same
 * place a refetched one does.
 */
export function startsNewSubject(previousSubject: string | undefined, subject: string): boolean {
  return previousSubject !== undefined && previousSubject !== subject;
}

/** How a day pill reads: Today, Yesterday, or "05 Sep". */
export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
