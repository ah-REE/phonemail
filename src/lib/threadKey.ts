import { createHash } from "node:crypto";

import { normalizePhoneNumber } from "@/lib/phone";

/**
 * Group thread keys (Day 6) - the DERIVED thread key.
 *
 * A group conversation is never stored: it is reconstructed from the messages
 * themselves. The sender plus every recipient form ONE member set; the set is
 * normalized to canonical 10-digit form, deduplicated, sorted and hashed:
 *
 *   threadKey = "grp:" + sha256( sorted unique [sender, ...recipients].join(",") )
 *
 * Why derived rather than allocated:
 *  - A -> B+C and B -> [A,C] both reduce to {A,B,C}, so the reply lands in the
 *    same thread with no group id to store, look up or keep in sync.
 *  - The rows alone are enough. Rebuilding the database rebuilds the threads.
 *  - Trade-off (accepted, user-confirmed, recorded in PROJECT.md Section 9):
 *    two SEPARATE composes to the same member set merge into one group thread,
 *    which is how Gmail conversations behave.
 *
 * Determinism: members are canonical 10-digit strings, deduplicated, sorted in
 * ascending code-point order, and joined with a single comma. The same set
 * therefore always hashes to the same key regardless of input order, spelling
 * (+91 / 0 prefixes) or the `@phonemail.com` suffix.
 */

export const GROUP_THREAD_PREFIX = "grp:";

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Canonical member number: accepts +91…/91…/0…/<number>@phonemail.com. */
export function canonicalMember(input: string): string {
  return normalizePhoneNumber(input.trim().replace(/@.*$/, ""));
}

/**
 * The derived key for a member set, or null when the set cannot form a group
 * (fewer than two distinct members). Callers pass the sender plus every
 * recipient - a message with a single recipient must NOT get a key.
 */
export function deriveThreadKey(members: string[]): string | null {
  const unique = [...new Set(members.map(canonicalMember).filter((member) => member.length > 0))].sort();

  if (unique.length < 2) {
    return null;
  }

  const digest = createHash("sha256").update(unique.join(",")).digest("hex");
  return `${GROUP_THREAD_PREFIX}${digest}`;
}

/** True for a syntactically valid group thread key ("grp:" + 64 hex chars). */
export function isGroupThreadKey(value: string): boolean {
  if (!value.startsWith(GROUP_THREAD_PREFIX)) {
    return false;
  }
  return SHA256_HEX.test(value.slice(GROUP_THREAD_PREFIX.length));
}

/** "<phone>@phonemail.com" -> "<phone>" (display helper). */
export function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}
