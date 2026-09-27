"use client";

/**
 * THE SWITCH - the app's one toggle.
 *
 * THE SHAPE WAS NEVER THE MARKUP'S FAULT. This control has now been rebuilt three
 * times and still rendered wrong, because the constraint was never a parent: the
 * design system's base layer sets
 *
 *     button { min-height: 56px }     // the elder-friendly tap floor
 *
 * so EVERY button in the app is at least 56px tall. A 44x24 track inside a 56px
 * box is a tall pill, and a 20px knob centred in it reads as a smear rather than a
 * switch. The control therefore declares its own size and opts out of the floor
 * with `min-h-0` - a class beats that element selector, so the floor keeps
 * applying to every ordinary button.
 *
 * The construction is deliberately the simplest that cannot distort:
 *   - the track is a RELATIVE, FIXED-SIZE box - w-[44px] h-[24px], rounded-full,
 *     background by state;
 *   - the knob is its ABSOLUTE child - 20px, rounded-full, centred vertically by
 *     `top-1/2 -translate-y-1/2` and moved along the track by `translate-x`;
 *   - no flex, no inset arithmetic, and nothing above it can set its height.
 *
 * It is a real `role="switch"` button with `aria-checked`, so a screen reader
 * announces the state rather than describing a decorative pill.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  /** The accessible name. There is no visible label inside the control. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative min-h-0 h-[24px] w-[44px] shrink-0 rounded-full transition-colors duration-ui ease-out-quint disabled:opacity-60 ${
        checked ? "bg-settings-brand" : "bg-settings-track"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[2px] top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-card transition-transform duration-ui ease-out-quint ${
          checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default Switch;
