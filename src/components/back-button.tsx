import Link from "next/link";

/**
 * THE HEADER-ALIGNMENT RULE, in one place.
 *
 * Round 4's rule: every screen with a back arrow uses ONE optical alignment rule
 * between the title and the back control. Before this file the app had three
 * different back controls - a 48px circle on the standard bar, a 40px circle on
 * the two thread headers, and another 40px one inside the onboarding step bar -
 * each with its own glyph size and its own inset, so the title sat at a slightly
 * different optical height depending on which screen you were on.
 *
 * The rule, stated once and enforced by construction:
 *   - the back control is a 48x48 hit area (above the 44px platform floor) with a
 *     24px glyph, optically centred;
 *   - a header's inset is 16px (px-4), so the control's left edge is always 16px
 *     from the screen edge;
 *   - the title is centred on the header's own vertical centre (items-center), so
 *     the title's optical middle meets the back glyph's optical middle on every
 *     screen that has one.
 *
 * The three variants below differ only in fill (which the chrome they sit on
 * decides), never in geometry - which is the whole point of the rule.
 *
 * ROUND 7: `min-h-0` is not decoration. The base layer floors every button at
 * 56px, so without it this 48x48 control rendered 48x56 and the rule it exists to
 * enforce was quietly broken on every screen.
 */
export const HEADER_BACK_SIZE = 48;
export const HEADER_BACK_GLYPH = 24;

export function BackButton({
  href,
  onBack,
  label = "Back",
  tone = "on-primary",
  className = "",
}: {
  /** Navigate to a route (a Link, so it survives a refresh - never history.back). */
  href?: string;
  /** Or handle the press (an in-page step back). */
  onBack?: () => void;
  label?: string;
  /** Which chrome the control sits on. Geometry is identical for all three. */
  tone?: "on-primary" | "rail" | "plain" | "none";
  className?: string;
}) {
  // "none" is for a header that supplies its own ink (the settings hero, which
  // floats on a light gradient) - geometry still comes from the rule, colour does not.
  const fill =
    tone === "rail"
      ? "bg-chat-rail text-on-surface"
      : tone === "plain"
        ? "text-on-surface active:bg-surface-container"
        : tone === "none"
          ? ""
          : "text-on-primary active:bg-white/10";

  const classes = `flex min-h-0 h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors duration-fast ease-out-quint ${fill} ${className}`;

  const glyph = (
    <svg
      width={HEADER_BACK_GLYPH}
      height={HEADER_BACK_GLYPH}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label}>
        {glyph}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onBack} className={classes} aria-label={label}>
      {glyph}
    </button>
  );
}

export default BackButton;
