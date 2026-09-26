import type { ElementType } from "react";

/**
 * THE WORDMARK - the one treatment of the product's name.
 *
 * The home screen settled it: "Phone" solid, "Mail" in the brand gradient
 * (the mark's own blue running into the illustration's violet). Round 4's rule is
 * that this treatment is used EVERYWHERE the name appears - onboarding, settings,
 * terms, the portal and the desktop shell - so the name cannot be one thing on one
 * screen and something else on the next.
 *
 * It lives here, once, rather than as copied markup, for the same reason the
 * palette lives in the Tailwind config: a treatment that is duplicated is a
 * treatment that will drift.
 *
 * `invert` is for the dark chrome (the desktop shell's indigo header): "Phone"
 * goes white and the gradient becomes white -> the brand's cyan, which stays
 * legible on indigo. The gradient stops are existing tokens in both directions;
 * no new colour is introduced.
 */
export function Wordmark({
  size = 22,
  as: Tag = "span",
  invert = false,
  className = "",
}: {
  /** The type size in px. The gradient split is size-independent. */
  size?: number;
  /** The element to render - h1 for a page title, span inline. */
  as?: ElementType;
  /** For dark chrome: white first half, white->cyan gradient second half. */
  invert?: boolean;
  className?: string;
}) {
  return (
    <Tag
      data-wordmark="phonemail"
      className={`font-headline font-bold tracking-[-0.01em] ${
        invert ? "text-white" : "text-on-surface"
      } ${className}`}
      style={{ fontSize: `${size}px`, lineHeight: 1.2 }}
    >
      Phone
      <span
        className={`bg-gradient-to-r bg-clip-text text-transparent ${
          invert ? "from-white to-brand-cyan" : "from-brand to-brand-violet"
        }`}
      >
        Mail
      </span>
    </Tag>
  );
}

export default Wordmark;
