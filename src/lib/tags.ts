/**
 * Message tags (swipe-to-tag).
 *
 * One source of truth for the API validation and the UI picker. Stored on
 * `Email.tag` as text so Day 6's folders can extend the list without a
 * migration.
 */
export const EMAIL_TAGS = ["important", "later", "done"] as const;

export type EmailTag = (typeof EMAIL_TAGS)[number];
