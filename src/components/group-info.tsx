"use client";

import { Avatar } from "@/components/avatar";
import { MemberTagChip } from "@/components/member-tag-chip";
import type { MemberTag } from "@/lib/roles";

/**
 * Group info.
 *
 * The read-only details view a group thread's title opens. It lists the members
 * the thread is actually made of - the same list the derived thread key was
 * computed from, so what is shown here cannot drift from who is in the group.
 *
 * READ-ONLY IS THE DESIGN, not an omission: a group in this app is not a stored
 * object with an owner, it is derived from the messages, so there is nothing to
 * rename and no membership row to leave. Offering those buttons would promise a
 * mutation the data model cannot honour.
 *
 * Every member is a button, because every member is a person you can save.
 */

export interface GroupInfoProps {
  members: string[];
  memberNames: (string | null)[];
  /**
   * ROUND 9: each member's role, keyed by canonical phone number - the same
   * derivation the thread payload carries, so the list here cannot disagree with
   * the names on the bubbles.
   */
  memberTags?: Record<string, MemberTag>;
  memberAddresses: string[];
  /** The signed-in user's own number, marked in the list. */
  me: string;
  onOpenMember: (phone: string) => void;
  onClose: () => void;
}

export function GroupInfo({
  members,
  memberNames,
  memberTags = {},
  memberAddresses,
  me,
  onOpenMember,
  onClose,
}: GroupInfoProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Group details"
    >
      <button
        type="button"
        aria-label="Close group details"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[80vh] w-full max-w-phone flex-col rounded-t-[28px] bg-chat-sheet px-5 pb-8 pt-3 shadow-overlay">
        <span className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-outline-variant" aria-hidden="true" />

        <h2 className="font-headline text-[19px] font-bold text-on-surface">Group details</h2>
        <p className="mt-1 text-[13px] text-chat-meta">
          {members.length} {members.length === 1 ? "member" : "members"}
        </p>

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto">
          {members.map((member, index) => {
            const name = memberNames[index]?.trim() || member;
            const isMe = member === me;

            return (
              <button
                key={member}
                type="button"
                className="flex min-h-[64px] w-full items-center gap-3 border-b border-outline-variant px-1 py-2 text-left active:bg-surface-container-high/40"
                onClick={() => onOpenMember(member)}
                aria-label={`Details for ${name}`}
              >
                <Avatar size={44} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-2 text-base font-semibold text-on-surface">
                    <span className="truncate">{name}</span>
                    {isMe && <span className="shrink-0 text-xs font-medium text-chat-meta">you</span>}
                    {memberTags[member] ? <MemberTagChip tag={memberTags[member]} /> : null}
                  </span>
                  <span className="mt-0.5 truncate text-[13px] text-chat-meta">
                    {memberAddresses[index] || `${member}@phonemail.com`}
                  </span>
                </span>
                <span className="shrink-0 text-chat-meta" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-chat-meta">
          A group here is derived from its messages, so there is nothing to rename and no membership to
          change. Write to the members and the conversation continues.
        </p>

        <button
          type="button"
          className="mt-4 min-h-0 h-12 w-full shrink-0 rounded-full bg-chat-rail text-sm font-semibold text-on-surface"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
