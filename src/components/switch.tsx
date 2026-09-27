"use client";

/**
 * THE SWITCH - the app's one toggle, conventionally built.
 *
 * Round 6 rebuilt this because the notifications switch rendered off centre: the
 * knob used to be `absolute` inside a flex track, so its vertical position came
 * from its STATIC position rather than from the track, and the browser resolved
 * that differently from what the markup implied.
 *
 * The construction here cannot do that:
 *   - the track is 44x24 with a 2px inset (px-0.5);
 *   - the knob is a 20px block IN FLOW, so the track's own `items-center` centres
 *     it vertically - no absolute positioning is involved at all;
 *   - it moves by `transform` only, so the travel is exactly 44 - 20 - 2*2 = 20px.
 *
 * A switch is a `role="switch"` button with `aria-checked`, not a checkbox with
 * invented styling: a screen reader then announces the state, which is the point
 * of the control.
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
      className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors duration-ui ease-out-quint disabled:opacity-60 ${
        checked ? "bg-settings-brand" : "bg-settings-track"
      }`}
    >
      <span
        aria-hidden="true"
        className={`block h-5 w-5 shrink-0 rounded-full bg-white shadow-card transition-transform duration-ui ease-out-quint ${
          checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default Switch;
