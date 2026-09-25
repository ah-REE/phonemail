/**
 * Folders (Day 6) and the draft store.
 *
 * `Email.folder` is one text column with three values. A message is in exactly
 * one folder, so moving it is a single UPDATE, and the index on
 * (toUserId, folder, createdAt) is what the folder screens read.
 *
 * WHY DRAFTS ARE NOT A FOLDER VALUE: an Email row requires BOTH a sender and a
 * recipient (they are foreign keys), and an abandoned compose has no recipient
 * yet - there is nobody to address it to. A database draft would therefore need
 * a second model with its own lifecycle, for a feature whose whole job is "do
 * not lose what I typed". The browser's local storage does that job in ten
 * lines, so that is the deliberate choice, and Drafts is the one menu item whose
 * data never leaves the device. Recorded in PROJECT.md section 9.
 */

export const EMAIL_FOLDERS = ["inbox", "spam", "trash"] as const;

export type EmailFolder = (typeof EMAIL_FOLDERS)[number];

export function isEmailFolder(value: string): value is EmailFolder {
  return (EMAIL_FOLDERS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------ local drafts */

export const DRAFT_KEY = "phonemail:draft";

export interface LocalDraft {
  to: string;
  subject: string;
  body: string;
  savedAt: string;
}

/** The saved draft, or null. Storage failures are never fatal. */
export function readDraft(): LocalDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof parsed?.body !== "string" && typeof parsed?.subject !== "string") {
      return null;
    }
    return {
      to: typeof parsed.to === "string" ? parsed.to : "",
      subject: typeof parsed.subject === "string" ? parsed.subject : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Omit<LocalDraft, "savedAt">): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    // An empty compose is not a draft - it is nothing.
    if (!draft.to.trim() && !draft.subject.trim() && !draft.body.trim()) {
      return;
    }
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable (private mode): losing a draft is acceptable, failing
    // the compose screen is not.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // see saveDraft
  }
}
