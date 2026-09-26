"use client";

import Link from "next/link";

import { Avatar } from "@/components/avatar";

/**
 * The traditional mail reader (design/email_reader).
 *
 * Fidelity notes from the mockup source: a security strip on
 * surface-container-low; a metadata block with an 11px avatar
 * (surface-container-high) carrying the sender's initial, the name in 18px
 * semibold, the address in body-sm outline and the time in label-sm outline; a
 * state chip (surface-container, 11px); the subject in 22px bold; a 1px
 * surface-container divider; the body at 20px/30px; a reference card on
 * surface-container-low; and a sticky full-width Reply bar on the brand's dark
 * green.
 *
 * TWO MOCKUP ELEMENTS ARE DELIBERATELY REWORDED, both reported:
 *  - the strip reads "Verified Government Sender" in the mockup. Nothing in this
 *    app verifies who a sender is, so the strip states what IS true instead:
 *    "New sender" for the first message from a number you have not written to,
 *    "End-to-End secure" otherwise.
 *  - the green verified tick beside the sender name is omitted for the same
 *    reason - it would assert a check that never ran.
 */

export interface MailReaderProps {
  /** Display name, already resolved by the caller (name or number). */
  name: string;
  address: string;
  when: string;
  subject: string;
  body: string;
  /** The chip's text - the real folder, plus the real tag when there is one. */
  stateLabel: string;
  /** Real reference shown in the card: the message's own id. */
  referenceId: string;
  /** True for the first message from a sender this user has not written to. */
  newSender: boolean;
  /** When present, the sticky Reply bar is rendered. */
  replyHref?: string;
}

export function MailReader({
  name,
  address,
  when,
  subject,
  body,
  stateLabel,
  referenceId,
  newSender,
  replyHref,
}: MailReaderProps) {
  const paragraphs = body.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  const shown = paragraphs.length > 0 ? paragraphs : [body];

  return (
    <div className="flex flex-1 flex-col">
      {/* Security strip */}
      <div className="flex items-center gap-2 bg-surface-container-low px-5 py-2.5">
        <span className="shrink-0 text-primary-container" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l7 3v6c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V5l7-3zm-1 12.2l4.2-4.2-1.4-1.4L11 11.4 9.2 9.6 7.8 11l3.2 3.2z" />
          </svg>
        </span>
        <p className="text-xs font-medium text-on-surface-variant">
          {newSender ? "New sender" : "End-to-End secure"}
        </p>
      </div>

      {/* Metadata and subject */}
      <section className="px-5 pb-2 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size={44} />
            <div className="min-w-0">
              <h2 className="truncate font-headline text-lg font-semibold leading-tight text-on-surface">
                {name}
              </h2>
              <p className="mt-0.5 select-all truncate text-xs text-outline">{address}</p>
            </div>
          </div>
          <div className="shrink-0 pt-0.5">
            <span className="text-[11px] text-outline">{when}</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1.5 inline-block rounded bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">
            {stateLabel}
          </div>
          <h3 className="font-headline text-[22px] font-bold leading-snug text-on-surface">{subject}</h3>
        </div>
      </section>

      <div className="mx-5 my-2 h-[1px] bg-surface-container" />

      {/* Body */}
      <article className="flex-1 px-5 py-3">
        {shown.map((paragraph, index) => (
          <p
            key={index}
            className={`whitespace-pre-wrap text-[20px] leading-[30px] text-on-surface ${
              index > 0 ? "mt-4" : ""
            }`}
          >
            {paragraph}
          </p>
        ))}

        {/* Reference card. No reference scheme exists, so the card shows the one
            real reference the message has - its own id. */}
        <div className="mt-6 flex flex-col gap-1.5 rounded bg-surface-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-outline">Message ID</span>
            <span className="text-[11px] font-semibold text-secondary">PhoneMail</span>
          </div>
          <p className="select-all break-all font-mono text-base font-semibold text-on-surface">
            {referenceId}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Quote this id if you ever need to ask about this message.
          </p>
        </div>
      </article>

      {/* Sticky reply bar */}
      {replyHref && (
        <footer className="sticky bottom-0 z-20 bg-surface-container-lowest px-5 pb-6 pt-3">
          <Link
            href={replyHref}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-secondary text-on-secondary active:bg-on-secondary-container"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 7L4 12l5 5" />
              <path d="M4 12h9a6 6 0 0 1 6 6v1" />
            </svg>
            <span className="text-base font-bold">Reply</span>
          </Link>
        </footer>
      )}
    </div>
  );
}
