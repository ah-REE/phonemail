"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@/components/avatar";

/**
 * The message card - the owner's chat reference, built as drawn.
 *
 * The reference is not a bubble: it is a CARD, one per message, and every piece of
 * it carries meaning:
 *
 *   - a light-blue identity panel: who wrote it (the avatar, the name, and the
 *     address beneath it, which is what a mail message actually has to say about
 *     its sender);
 *   - a meta row: the NEW pill for a message that arrived unread, and the time;
 *   - the message itself, large and calm;
 *   - a hairline;
 *   - the actions: Reply, and the rest behind an ellipsis.
 *
 * Colours are the reference's own, sampled into the `msg` token group rather than
 * invented, so the card and the rest of the app cannot drift apart.
 *
 * The card is the SAME for a message you sent and one you received - the reference
 * draws one card and labels it "You". That is deliberately not a left/right bubble
 * layout: a mail conversation reads as a stack of messages, and the panel says who
 * each one is from.
 */

export interface MessageCardProps {
  /** "You", or the sender's resolved name. */
  name: string;
  /** The line under the name, as the reference shows one: the sender's address. */
  secondary: string;
  when: string;
  body: string;
  /** True for a message that was unread when the thread opened. */
  isNew?: boolean;
  /**
   * The single sent tick. The owner asked for it in an earlier round and the card
   * reference shows none - so it stays, in the card's own accent, on the meta row
   * where the reference puts its timestamp. Keeping it is a decision; dropping it
   * quietly would have been an accident.
   */
  tick?: boolean;
  /** The quoted mail this message answers, when it is a reply. */
  quoted?: string | null;
  /** The reply affordance, when this message can be answered. */
  replyHref?: string;
  replyLabel?: string;
  /** The ellipsis, when this thread has a panel behind it. */
  onMore?: () => void;
  moreOpen?: boolean;
  moreContent?: ReactNode;
  /** Extra rows under the actions (a "Replied" note, a delivery state). */
  footer?: ReactNode;
  /** Shown instead of the actions when there is nothing to do with the message. */
  statusNote?: string | null;
  /** The thread's own gestures stay on the card: the tag panel and the swipe reply. */
  onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLElement>) => void;
}

export function MessageCard({
  name,
  secondary,
  when,
  body,
  isNew = false,
  tick = false,
  quoted,
  replyHref,
  replyLabel = "Reply",
  onMore,
  moreOpen = false,
  moreContent,
  footer,
  statusNote,
  onPointerDown,
  onPointerUp,
}: MessageCardProps) {
  return (
    <article
      className="mb-3 w-full rounded-[24px] border border-outline-variant/70 bg-msg-card p-3 shadow-card"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {/* 1. Who wrote it. */}
      <div className="flex items-center gap-3 rounded-[18px] bg-msg-panel px-3 py-2.5">
        <Avatar size={48} tone="card" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-[17px] font-bold leading-tight text-msg-ink">
            {name}
          </p>
          {secondary && (
            <p className="mt-0.5 truncate text-[13px] font-medium text-msg-muted">{secondary}</p>
          )}
        </div>
      </div>

      {/* 2. When, and whether it is new. */}
      <div className="mt-3 flex items-center gap-3">
        {isNew && (
          <span className="flex h-6 items-center gap-1.5 rounded-full bg-msg-accent pl-3 pr-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white">
            New
            <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
          </span>
        )}
        <span className="text-[13px] font-medium text-msg-muted">{when}</span>
        {tick && (
          <span
            className="ml-auto text-msg-accent"
            title="Sent - the mail service accepted this message"
            aria-label="Sent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>

      {/* 3. What it answers, when it is a reply. */}
      {quoted && (
        <div className="mt-3 flex flex-col rounded-[14px] border-l-4 border-msg-accent bg-msg-action px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-msg-accent">
            Replying to
          </span>
          <span className="mt-0.5 truncate text-[13px] text-msg-muted">{quoted}</span>
        </div>
      )}

      {/* 4. The message. */}
      <p className="mt-3 whitespace-pre-wrap font-headline text-[20px] font-semibold leading-[1.25] tracking-[-0.01em] text-msg-ink">
        {body}
      </p>

      {/* 5. The hairline, then the actions. */}
      {(replyHref || onMore || statusNote) && (
        <div className="mt-4 h-[1px] w-full bg-msg-line" />
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        {replyHref ? (
          <Link
            href={replyHref}
            className="flex min-h-[44px] items-center gap-2 rounded-[16px] bg-msg-action px-4 text-[15px] font-semibold text-msg-accent"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 7L4 12l5 5" />
              <path d="M4 12h9a6 6 0 0 1 6 6v1" />
            </svg>
            {replyLabel}
          </Link>
        ) : (
          <span className="text-[13px] text-msg-muted">{statusNote ?? ""}</span>
        )}

        {onMore && (
          <button
            type="button"
            aria-label="More actions for this message"
            aria-expanded={moreOpen}
            onClick={onMore}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-msg-more text-wa-muted"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5.5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18.5" cy="12" r="1.6" />
            </svg>
          </button>
        )}
      </div>

      {moreOpen && moreContent && <div className="mt-2">{moreContent}</div>}
      {footer}
    </article>
  );
}
