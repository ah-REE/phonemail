/**
 * One avatar for everybody.
 *
 * A person without a picture used to get their own initial or their number's first
 * digit - twelve different marks out of one design, and none of them told the
 * reader anything they could not already see in the row's title. Now every account
 * without a profile picture shows the same neutral person mark, in the palette's
 * tint, so the only thing an avatar ever signals is "this is a person".
 *
 * The group mark is separate on purpose (see the home row): a group is not a
 * person, and its stacked pair is what the owner's reference draws.
 */
export function Avatar({
  size = 48,
  className = "",
  tone = "default",
}: {
  size?: number;
  className?: string;
  /**
   * "card" is the message card's own pair: its paler blue behind the mark.
   * "settings" is the settings hero's: the reference's own disc and glyph.
   */
  tone?: "default" | "card" | "settings";
}) {
  const palette =
    tone === "card"
      ? "bg-msg-avatar text-msg-accent"
      : tone === "settings"
        ? "bg-settings-disc text-[#3b6fd4]"
        : "bg-avatar-sky text-accent";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full ${palette} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={Math.round(size * 0.56)}
        height={Math.round(size * 0.56)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8.6" r="3.6" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    </span>
  );
}
