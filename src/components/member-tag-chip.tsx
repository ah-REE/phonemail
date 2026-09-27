import type { MemberTag } from "@/lib/roles";

/**
 * ROUND 9: the member role chip.
 *
 * "A · sender", "B · cc", "D · receiver": the role is drawn as a small chip next
 * to the name, never in place of it. Three roles, three honest colours from the
 * existing token set - the sender is the mark's navy, a direct receiver the
 * accent, and a copied member the quiet surface - so the chip reads as a label
 * rather than as a state.
 *
 * `as` keeps the one component usable inside a <button> (group info) and inside a
 * <span> (a bubble's sender line): a chip must never nest a block element inside
 * a button's own label badly, and the tag is decoration on top of a name that is
 * already spoken.
 */
export function MemberTagChip({ tag, className = "" }: { tag: MemberTag; className?: string }) {
  const style =
    tag === "sender"
      ? "bg-accent-soft text-accent"
      : tag === "cc"
        ? "bg-surface-container-high text-on-surface-variant"
        : "bg-accent/10 text-accent";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold lowercase tracking-wide ${style} ${className}`}
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
