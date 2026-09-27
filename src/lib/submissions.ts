import { randomUUID } from "node:crypto";

import { getRedis } from "@/lib/redis";

/**
 * Submission metadata, carried across the SMTP round trip.
 *
 * The send endpoint does not write Email rows - the inbound path does, when the
 * SMTP service hands the message back. That rule exists so a delivery bug cannot
 * produce a message that looks sent but never arrived, and it stays.
 *
 * But two things the SEND path knows are invisible to the inbound path:
 *
 *   - that this message is a REPLY, and which row it answers;
 *   - that a group reply belongs to a GROUP thread key rather than to the
 *     pairwise thread its recipient list would derive (a reply from B addressed
 *     only to the creator is one recipient, so deriving would put it in their 1:1
 *     chat - the wrong conversation).
 *
 * So the send path leaves a short-lived note keyed by the submission itself
 * (sender + subject + recipients) and the inbound path takes it - read AND
 * delete, so it can apply exactly once, and expire so a note can never outlive
 * the round trip it describes. Nothing here is a message store: if the note is
 * gone, the message is simply an ordinary one.
 */

export interface PendingSubmission {
  /** The group thread key a reply belongs to. */
  threadKey?: string | null;
  /** The row this message answers. */
  replyToId?: string | null;
  /**
   * ROUND 9: which list each recipient came from, keyed by canonical address
   * ('to' | 'cc'), so the inbound fan-out can stamp Email.recipientRole on the row
   * it creates. The MIME Cc header tells the mail SERVICE the same thing for the
   * hop, but a header cannot reach the row - the note is what survives.
   */
  roles?: Record<string, "to" | "cc"> | null;
}

/**
 * The note is read back from Redis, so its shape is not trusted: only 'to' and
 * 'cc' values survive, and only under string keys.
 */
function readRoles(value: unknown): Record<string, "to" | "cc"> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const roles: Record<string, "to" | "cc"> = {};
  for (const [address, role] of Object.entries(value as Record<string, unknown>)) {
    if (role === "to" || role === "cc") {
      roles[address] = role;
    }
  }
  return Object.keys(roles).length > 0 ? roles : null;
}

const TTL_SECONDS = 180;

export function submissionKey(fromAddress: string, subject: string, toAddresses: string[]): string {
  const recipients = [...toAddresses].sort().join(",");
  return `submission:${fromAddress}|${subject}|${recipients}`;
}

export function newSubmissionId(): string {
  return randomUUID();
}

export async function rememberSubmission(key: string, meta: PendingSubmission): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.set(key, JSON.stringify(meta), { EX: TTL_SECONDS });
  } catch (error) {
    // The note is a convenience: losing it degrades a reply to an ordinary
    // message, which is better than failing a send that would otherwise work.
    console.error("[submissions] could not record the metadata", error);
  }
}

export async function takeSubmission(key: string): Promise<PendingSubmission> {
  try {
    const redis = await getRedis();
    const raw = await redis.get(key);
    if (!raw) {
      return {};
    }
    await redis.del(key);
    const parsed = JSON.parse(raw) as PendingSubmission;
    return {
      threadKey: typeof parsed.threadKey === "string" ? parsed.threadKey : null,
      replyToId: typeof parsed.replyToId === "string" ? parsed.replyToId : null,
      roles: readRoles(parsed.roles),
    };
  } catch (error) {
    console.error("[submissions] could not read the metadata", error);
    return {};
  }
}
