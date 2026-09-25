/**
 * Display names (Day 7).
 *
 * `User.displayName` is nullable, and NULL is meaningful: it means "show the
 * phone number". Every surface goes through labelFor(), so a user without a name
 * is never nameless and no screen has to invent a fallback of its own.
 */

/** The longest a display name may be, trimmed. */
export const DISPLAY_NAME_MAX = 40;

/** The name to show for a person, or their number when they have none. */
export function labelFor(phoneNumber: string, displayName?: string | null): string {
  const trimmed = displayName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : phoneNumber;
}

/** Why a display name was rejected, ready to return to the client. */
export function displayNameProblem(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "A name cannot be empty.";
  }
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return `A name can be at most ${DISPLAY_NAME_MAX} characters.`;
  }
  return null;
}
