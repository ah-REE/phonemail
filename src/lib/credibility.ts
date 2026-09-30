/**
 * ROUND 30 (sender credibility): the human reading of an account's age.
 *
 * "Member since Mar 2026 · 8 months" is two facts from one timestamp, and the
 * month arithmetic has exactly the awkward cases that deserve tests instead of
 * a browser: a fresh account ("less than a month"), a single month ("1 month"),
 * and the not-quite-a-month-yet boundary (the day-of-month comparison). That is
 * why this is a PURE function - the sheets call it, ct35 pins it.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface AccountAge {
  /** "Mar 2026" - the month and year the account appeared. */
  since: string;
  /** "8 months" | "1 month" | "less than a month" - the age as words. */
  ago: string;
}

export function describeAccountAge(createdAt: string | Date, now: Date = new Date()): AccountAge {
  const joined = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const since = `${MONTHS[joined.getMonth()]} ${joined.getFullYear()}`;
  let months = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  // A month is complete only once its day-of-month is reached: Jan 15 to
  // Feb 14 is "less than a month", not one.
  if (now.getDate() < joined.getDate()) {
    months -= 1;
  }
  const ago = months < 1 ? "less than a month" : months === 1 ? "1 month" : `${months} months`;
  return { since, ago };
}
