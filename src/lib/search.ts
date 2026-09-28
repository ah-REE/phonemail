/**
 * SEARCH - the pure parts (round 22).
 *
 * Kept out of the route so the two decisions that are easy to get subtly wrong -
 * what a snippet is, and what the minimum query is - can be driven directly by a
 * test rather than only through HTTP.
 */

/** Below this, a search is not run at all: two characters match everything. */
export const MIN_SEARCH_LENGTH = 3;

/** How much text a snippet carries on each side of the hit. */
export const SNIPPET_RADIUS = 30;

/** The cap on threads returned, newest activity first. */
export const SEARCH_THREAD_LIMIT = 20;

/** How many rows are scanned before grouping. Bounded for speed, like the chat list. */
export const SEARCH_SCAN_LIMIT = 400;

/**
 * The snippet around the FIRST hit, or the head of the text when the hit is not
 * in it (a subject-only match still deserves a line of context).
 *
 * The ellipsis is honest in both directions: a leading one means text was cut
 * before the hit, a trailing one means the text continues.
 */
export function snippetAround(text: string, needle: string, radius = SNIPPET_RADIUS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!needle) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}...` : flat;
  }
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}...` : flat;
  }
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + needle.length + radius);
  return `${start > 0 ? "..." : ""}${flat.slice(start, end)}${end < flat.length ? "..." : ""}`;
}

/** How many times the needle appears, case-insensitively. */
export function countMatches(text: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(target, from);
    if (at < 0) {
      return count;
    }
    count += 1;
    from = at + target.length;
  }
}

/** True when the query is long enough to be worth running. */
export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_LENGTH;
}
