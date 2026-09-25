/**
 * Message tags (swipe-to-tag).
 *
 * One source of truth for the API validation and the UI picker. Stored on
 * `Email.tag` as text so the folder work never needed a migration.
 *
 * Day 6: `favorite` joins the set so the home screen's Favorites chip has a
 * value to filter on. It is a tag like any other - one message carries it, and a
 * thread counts as a favourite when any of its messages does.
 */
export const EMAIL_TAGS = ["favorite", "important", "later", "done"] as const;

export type EmailTag = (typeof EMAIL_TAGS)[number];

/** The tag the Favorites chip filters on. */
export const FAVORITE_TAG: EmailTag = "favorite";
