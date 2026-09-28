/**
 * THE SERVER-SIDE DRAFT (round 22) - limits and validation.
 *
 * A draft is the current abandoned compose: exactly ONE per user, because "the
 * message I was writing" is one thing. Fields are stored as the composer holds
 * them (the raw text of To and Cc, not resolved recipients), because a draft is
 * taken before anything is validated - an unfinished address is exactly what a
 * draft is for.
 */

/** Same ceilings the composer already implies, so a draft cannot grow without bound. */
export const DRAFT_LIMITS = {
  to: 400,
  cc: 400,
  subject: 400,
  body: 20_000,
} as const;

export interface DraftFields {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

/** True when there is nothing worth keeping - an empty composer is not a draft. */
export function isBlankDraft(draft: DraftFields): boolean {
  return (
    draft.to.trim().length === 0 &&
    draft.cc.trim().length === 0 &&
    draft.subject.trim().length === 0 &&
    draft.body.trim().length === 0
  );
}

export function draftProblem(draft: Partial<DraftFields>): string | null {
  for (const field of ["to", "cc", "subject", "body"] as const) {
    const value = draft[field];
    if (value === undefined) continue;
    if (typeof value !== "string") return `The draft's ${field} must be text.`;
    if (value.length > DRAFT_LIMITS[field]) {
      return `The draft's ${field} is too long (max ${DRAFT_LIMITS[field]} characters).`;
    }
  }
  return null;
}
