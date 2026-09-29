/**
 * Recipient input, client-side (round 28).
 *
 * WHAT A TYPED RECIPIENT MAY BE: a 10-digit Indian mobile number, or an alias
 * local part - 3 to 20 lowercase letters, digits and dots. This module is the
 * composer-side companion of the mobile composer's own check: same rule, same
 * wording (`RECIPIENT_FORMAT_MESSAGE`), and the same normalisation pipeline
 * (`parseRecipients`), so the two clients accept exactly the same things.
 *
 * IT IS FORMAT ONLY, and that is the design: it says nothing about whether the
 * account exists. An unknown-but-well-formed recipient is the send route's 404,
 * not this check's problem - and a format check that pretended otherwise would
 * promise a verdict it cannot produce.
 *
 * WHY TEXT AND NOT CHIPS (documented per the round's brief, which allowed
 * either): the desktop composer has been a text-field card since round 13 - the
 * Gmail-style pattern chosen for this client - while chips are the phone's own
 * idiom. Rather than rebuild the interaction (and its draft plumbing) as chips,
 * multi-entry was made EXPLICIT on the desktop: comma/space parsing kept,
 * per-address validation added, the placeholders name the comma, and a live
 * "Group: N recipients" line appears the moment more than one is present -
 * the same line the mobile composer shows.
 */
import { isValidIndianMobile } from "@/lib/phone";

/** The shape of an alias local part a person may type into To or Cc. */
const ALIAS_LOCAL_PART = /^[a-z0-9.]{3,20}$/;

/** The one message both clients use, the mobile composer's own wording. */
export const RECIPIENT_FORMAT_MESSAGE =
  "Each recipient must be a 10-digit mobile number, or an alias like bee.friend.";

/** One token, already normalised, that is a number or an alias. */
export function isRecipientToken(token: string): boolean {
  return isValidIndianMobile(token) || ALIAS_LOCAL_PART.test(token);
}

/** The tokens that are not a number or an alias, in the order given. */
export function invalidRecipients(tokens: string[]): string[] {
  return tokens.filter((token) => !isRecipientToken(token));
}

/**
 * A comma- or space-separated field into the list of recipients it means.
 *
 * The normalisation is the mobile composer's parseRecipients, deliberately:
 * "9876543210, +91 98765 43211, 9876543212@phonemail.com, bee.friend" - the
 * field says it takes a NUMBER OR AN ALIAS, so both survive: the domain is
 * stripped, a 10+-digit token is trimmed to its last ten (dropping a 91
 * prefix or a leading 0), and anything else is kept as a lowercase alias and
 * handed to the server, which is the only thing that can say whether it exists.
 */
export function parseRecipients(raw: string): string[] {
  const tokens = raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim().replace(/@.*$/, ""))
    .filter((entry) => entry.length > 0);

  const recipients = tokens.map((token) => {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 10) {
      return token.toLowerCase();
    }
    return digits.replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  });

  return [...new Set(recipients)];
}
