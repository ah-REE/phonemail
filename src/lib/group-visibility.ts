import { prisma } from "@/lib/prisma";

/**
 * ROUND 34 - THE GROUP PRIVACY PREDICATE, in one place.
 *
 * The invariant (rounds 3 and 9): in a group, a member sees the creator's
 * BROADCASTS and their OWN rows - never another member's reply. A broadcast is
 * a FAN-OUT: one submission written as one row per recipient (two or more
 * copies) whose subject is a new one - the mail that OPENED a conversation. The
 * pre-reply-model fan-out also duplicated REPLIES per member; those are
 * "re: ..." submissions with replyToId null, and they are a broadcast neither.
 * The rule is therefore two-fold: a replyToId-null row is a broadcast only when
 * its submission fanned out AND its subject is not a "re:" answer. Anything
 * else is invisible to everyone but its sender, so nobody can read it or
 * answer it.
 *
 * Every surface that reads a group (the thread endpoint and search) applies
 * this same rule, so the surfaces cannot quietly disagree again.
 */

/** The submissionIds in this thread that fan out: written as 2+ rows. */
export async function fanOutSubmissions(threadKey: string): Promise<Set<string>> {
  const groups = await prisma.email.groupBy({
    by: ["submissionId"],
    where: { threadKey, submissionId: { not: null } },
    _count: { _all: true },
  });
  return new Set(
    groups
      .filter((entry) => (entry._count?._all ?? 0) >= 2 && entry.submissionId)
      .map((entry) => entry.submissionId as string),
  );
}

/** The same test for one submission, wherever it lives (the send route). */
export async function isFanOutSubmission(submissionId: string | null): Promise<boolean> {
  if (!submissionId) {
    return false;
  }
  const copies = await prisma.email.count({ where: { submissionId } });
  return copies >= 2;
}

/** A new conversation's opening mail - never a "re:" answer, always a fan-out. */
export function isBroadcastSubmission(
  row: { replyToId: string | null; submissionId?: string | null; subject?: string | null },
  fanOut: Set<string>,
): boolean {
  return row.replyToId === null && fanOut.has(row.submissionId ?? "") && !/^re:\s*/i.test(row.subject ?? "");
}

/**
 * The subject an answered mail would have, with the reply prefix removed. The
 * pre-reply-model fan-out lost replyToId, but its "re:" subject still names the
 * broadcast it answered - which is how the answered author is reconstructed.
 */
export function answeredSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(/^re:\s*/i, "").trim().toLowerCase();
}

/** The row-level predicate for post-filters (a viewer's group payload). */
export function groupRowVisibleToViewer(
  row: { fromUserId: string; toUserId: string; replyToId: string | null; submissionId?: string | null; subject?: string | null },
  viewerId: string,
  fanOut: Set<string>,
  broadcastAuthorBySubject: Map<string, string> = new Map(),
): boolean {
  if (row.fromUserId === viewerId) {
    return true; // mine - own broadcasts, own replies, own legacy copies
  }
  if (row.replyToId === null) {
    if (isBroadcastSubmission(row, fanOut)) {
      return true; // a true (fan-out, new-subject) broadcast
    }
    // A legacy fanned reply ("re:", replyToId lost): visible to its sender (the
    // branch above) and to the author of the broadcast it answers - the mail's
    // author, reconstructed by subject. The copy ADDRESSED to a fellow member
    // stays invisible to that member: that is the invariant.
    const answeredAuthor = broadcastAuthorBySubject.get(answeredSubject(row.subject)) ?? null;
    return row.toUserId === viewerId && answeredAuthor !== null && answeredAuthor === viewerId;
  }
  return row.toUserId === viewerId; // a reply: visible to the mail it answers
}
