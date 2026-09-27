/**
 * GROUP MEMBER ROLE TAGS (round 9).
 *
 * A group thread has no membership table - the thread key IS the conversation -
 * so a member's role is DERIVED, like everything else about a group, from the
 * thread's FOUNDING mail:
 *
 *   - the author of the founding mail is the 'sender';
 *   - the members its To list carried are 'receiver';
 *   - the members its Cc list carried are 'cc'.
 *
 * `receiver` rather than `to` on purpose: the tag is what the person IS in the
 * conversation, and "you were addressed" reads as a role, where "to" reads as a
 * header. `cc` stays `cc` because there is no better word for copied.
 *
 * The record behind this is the founding mail's own fan-out rows: the send path
 * stamps each row with the list its recipient came from (Email.recipientRole),
 * so nothing here has to guess.
 *
 * This module is pure - no Prisma, no React - so every branch can be driven
 * without a server or a browser, which is how the suite tests it.
 */

export const MEMBER_TAGS = ["sender", "receiver", "cc"] as const;

export type MemberTag = (typeof MEMBER_TAGS)[number];

export function isMemberTag(value: unknown): value is MemberTag {
  return typeof value === "string" && (MEMBER_TAGS as readonly string[]).includes(value);
}

/**
 * The chip's word. Lower-case the way the brief writes them (A · sender), and
 * sentence-case at the start of a line.
 */
export function memberTagLabel(tag: MemberTag): string {
  return tag;
}

/**
 * One recipient's role as it was stamped on the row. A row with no stamp - an
 * older message, or a pairwise row, which is legitimately null - counts as 'to',
 * because the safe reading of a delivered copy with no Cc evidence is that it
 * was addressed directly.
 */
export function tagForRecipientRole(recipientRole: string | null | undefined): MemberTag {
  return recipientRole === "cc" ? "cc" : "receiver";
}

export interface FoundingRecipient {
  /** Canonical 10-digit number of the recipient of the founding mail. */
  phone: string;
  /** Email.recipientRole for that recipient's row ('to', 'cc', or null). */
  recipientRole: string | null | undefined;
}

/**
 * The role of everyone in the group, keyed by canonical phone number.
 *
 * The author is the sender even if they also appear as a recipient (mailing your
 * own address inside a group is possible), because being the author is the
 * stronger fact - and the brief says the founding mail's author is the sender.
 */
export function deriveMemberTags({
  senderPhone,
  recipients,
}: {
  senderPhone: string;
  recipients: FoundingRecipient[];
}): Record<string, MemberTag> {
  const tags: Record<string, MemberTag> = {};
  for (const recipient of recipients) {
    if (!recipient.phone || recipient.phone === senderPhone) {
      continue;
    }
    tags[recipient.phone] = tagForRecipientRole(recipient.recipientRole);
  }
  if (senderPhone) {
    tags[senderPhone] = "sender";
  }
  return tags;
}

/** The tag for one member, or null when the thread has no derivation for them. */
export function tagForMember(tags: Record<string, MemberTag>, phone: string): MemberTag | null {
  return tags[phone] ?? null;
}
