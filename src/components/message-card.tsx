/**
 * One message, as a bubble.
 *
 * THE OWNER DECIDED THIS: left and right bubbles, WhatsApp-style, with the squared
 * corner pointing toward the sender. The full-width card that briefly rendered here
 * is WITHDRAWN. The card's discipline survives the change, though, and that is the
 * point of this file - the hierarchy inside a bubble is the card's, in the card's
 * order:
 *
 *   1. the reply linkage, first and tappable, because what a message ANSWERS is
 *      often the thing you need before its words
 *   2. the body, with long mail collapsed behind "Read full message"
 *   3. ONE quiet metadata line: the time, the sent/replied state where it exists,
 *      and tag chips only when a tag is actually set
 *
 * Everything else the old bubble carried - a subject pill per message, a second
 * metadata row, a status word floating outside - is gone. A bubble says one message
 * and one time.
 *
 * RUNS: consecutive messages from the same sender collapse into a run. The sender's
 * identity appears ONCE, on the run's first bubble (the name, in groups) and once at
 * its foot (the shared avatar), and the messages inside a run sit closer together
 * than runs sit to each other.
 *
 * THE ATTACHMENT SLOT is `attachments`. Attachments land next session; they render
 * above the body, inside the bubble, and nothing else has to move for them.
 */
import type { ReactNode } from "react";

import { Avatar } from "@/components/avatar";

export interface MessageCardProps {
  /** Which side. Mine sits right, theirs left - and the squared corner says so. */
  mine: boolean;
  /** First message of a run: it takes the squared corner and the sender's name. */
  isFirstInRun?: boolean;
  /** Last message of a run: it carries the shared avatar at its foot. */
  isLastInRun?: boolean;
  /** The sender's name - drawn only when `showName`, so a 1:1 stays nameless. */
  name?: string;
  showName?: boolean;
  /** The address under the name, for the reader's benefit, not the layout's. */
  secondary?: string;
  when: string;
  body: string;
  /** The single sent tick, on a message of mine. */
  tick?: boolean;
  /** What this message answers: a compact, tappable preview. */
  quoted?: string | null;
  replyHref?: string | null;
  replyLabel?: string;
  /** Sent / Replied / Arriving - one word, on the metadata line. */
  statusNote?: string | null;
  /** Tag chips. Render only what is genuinely set; usually nothing. */
  tags?: ReactNode;
  /** THE ATTACHMENT SLOT. Attachments land here and nothing else moves. */
  attachments?: ReactNode;
  /** Tapping the body opens the traditional full view. */
  onOpen?: () => void;
  /**
   * The reveal: ROUND 4 replaces the three-dots with a CHEVRON-DOWN that opens a
   * four-action row (Move to Spam, Move to Trash, Favorite, Reply). Same
   * swipe-left territory, a quieter and more conventional affordance.
   */
  onMore?: () => void;
  moreOpen?: boolean;
  moreContent?: ReactNode;
  /** Read full message / Collapse. */
  footer?: ReactNode;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function MessageCard({
  mine,
  isFirstInRun = true,
  isLastInRun = true,
  name,
  showName = false,
  secondary,
  when,
  body,
  tick = false,
  quoted,
  replyHref,
  replyLabel = "Reply",
  statusNote,
  tags,
  attachments,
  onOpen,
  onMore,
  moreOpen = false,
  moreContent,
  footer,
  onPointerDown,
  onPointerUp,
}: MessageCardProps) {
  // The squared corner points at whoever wrote it: the sender's side, at the top.
  const radius = isFirstInRun
    ? mine
      ? "rounded-2xl rounded-tr-none"
      : "rounded-2xl rounded-tl-none"
    : "rounded-2xl";

  const shell = mine ? "bg-chat-out" : "bg-white";
  const label = mine ? "You" : name?.trim() || "Them";

  return (
    <div
      className={`flex w-full items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${
        isFirstInRun ? "mt-3" : "mt-1"
      }`}
      data-side={mine ? "out" : "in"}
      data-run={isFirstInRun ? "first" : "middle"}
    >
      {/* The shared avatar, once per incoming run, at its foot - so a run reads as
          one person talking rather than a column of repeated marks. */}
      {!mine && isLastInRun ? (
        <span className="mb-0.5 shrink-0">
          <Avatar size={32} />
        </span>
      ) : null}
      {!mine && !isLastInRun ? <span className="w-8 shrink-0" aria-hidden="true" /> : null}

      <div className="flex min-w-0 max-w-[78%] flex-col">
        {showName && !mine && isFirstInRun ? (
          <span className="mb-1 px-1 text-[13px] font-semibold text-on-surface-variant">
            {name?.trim() || secondary || "Them"}
          </span>
        ) : null}

        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className={`${radius} ${shell} relative px-3 pb-1 pt-2 shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition-transform duration-ui active:scale-[0.995]`}
        >

          {/* 1. what it answers, first and tappable */}
          {quoted ? (
            replyHref ? (
              <a
                href={replyHref}
                className="mb-2 block rounded-lg border-l-2 border-msg-accent bg-black/[0.03] px-2.5 py-1.5"
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-msg-accent">
                  Replying to
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-on-surface-variant">
                  {quoted}
                </span>
              </a>
            ) : (
              <span className="mb-2 block rounded-lg border-l-2 border-msg-accent bg-black/[0.03] px-2.5 py-1.5">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-msg-accent">
                  Replying to
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-on-surface-variant">
                  {quoted}
                </span>
              </span>
            )
          ) : null}

          {/* THE ATTACHMENT SLOT - above the body, so a picture never pushes its own
              caption around when it arrives. */}
          {attachments ? <div className="mb-2">{attachments}</div> : null}

          {/* 2. the body */}
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="block w-full whitespace-pre-wrap break-words text-left text-[15.5px] leading-[1.45] text-on-surface"
            >
              {body}
            </button>
          ) : (
            <p className="whitespace-pre-wrap break-words text-[15.5px] leading-[1.45] text-on-surface">
              {body}
            </p>
          )}

          {/* 3. one quiet metadata line: the time, the state, the tags. ROUND 6:
              mt-0.5 and leading-none, and the reveal control is a 24px box rather
              than a 28px one - the control, not the text, used to set this row's
              height, which is what read as a dead band under the body. */}
          <div className="mt-0.5 flex items-center justify-end gap-1.5 leading-none">
            {tags}
            {statusNote ? (
              <span className="text-[11px] font-medium text-chat-meta">{statusNote}</span>
            ) : null}
            <span className="text-[11px] text-chat-meta">{when}</span>
            {tick ? (
              <span
                className="text-msg-accent"
                title="Sent - the mail service accepted this message"
                aria-label="Sent"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : null}
            {onMore ? (
              <button
                type="button"
                onClick={onMore}
                aria-label={moreOpen ? "Hide message actions" : "Show message actions"}
                aria-expanded={moreOpen}
                className="ml-0.5 -mb-0.5 -mr-1 flex h-6 w-6 items-center justify-center rounded-full text-chat-meta transition-colors duration-ui hover:bg-black/[0.05]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`transition-transform duration-ui ${moreOpen ? "rotate-180" : ""}`}
                >
                  <path d="M6 10l6 6 6-6" />
                </svg>
              </button>
            ) : null}
          </div>

          {footer ? <div className="mt-1">{footer}</div> : null}
          {moreOpen && moreContent ? <div className="mt-2">{moreContent}</div> : null}
        </div>

        {/* The reply action, under the bubble rather than inside it: a reply is a
            thing you do TO a message, not a part of it. (ROUND 6: the "NEW" marker
            is gone - unread state is the home list's badge and nowhere else - and
            the bubble's interior was tightened so the body meets its metadata line
            with no dead band.) */}
        {replyHref && replyLabel ? (
          <a
            href={replyHref}
            className={`mt-1 self-${mine ? "end" : "start"} rounded-full bg-msg-action px-3 py-1 text-[13px] font-semibold text-msg-accent`}
          >
            {replyLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default MessageCard;
