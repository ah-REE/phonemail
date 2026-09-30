import type { MemberTag } from "@/lib/roles";

/**
 * ROUND 9: the member role chip.
 *
 * "A -> sender", "B -> cc", "D -> receiver": the role is drawn as a small chip
 * next to the name, never in place of it.
 *
 * ROUND 28.5 (the Figma pass): a second TONE. "soft" is the original chip set -
 * the phone's and the group info's - unchanged. "frame" is the desktop design's
 * own chrome for the message cards: the sender is a solid navy chip with white
 * text, the receiver and cc are paper chips on the shared hairline. Only the
 * chrome differs; the role word is the same word.
 */
export function MemberTagChip({
  tag,
  tone = "soft",
  className = "",
}: {
  tag: MemberTag;
  tone?: "soft" | "frame";
  className?: string;
}) {
  const style =
    tone === "frame"
      ? tag === "sender"
        ? "border border-neutral-hair bg-on-surface text-white"
        : "border border-neutral-hair bg-paper text-neutral-body"
      : tag === "sender"
        ? "bg-accent-soft text-accent"
        : tag === "cc"
          ? "bg-surface-container-high text-on-surface-variant"
          : "bg-accent/10 text-accent";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
        tone === "frame" ? "uppercase tracking-[0.08em]" : "lowercase"
      } ${style} ${className}`}
      title={
        tag === "sender"
          ? "Opened this conversation"
          : tag === "cc"
            ? "Copied on the first message"
            : "Addressed on the first message"
      }
    >
      {tag}
    </span>
  );
}
