/**
 * A spinner for the moments the app is waiting on the server.
 *
 * One arc, one steady speed, no bounce and no new colour: it inherits
 * currentColor, so it can be dropped inside any button without being told what
 * colour it is. The global reduced-motion rule stops it like everything else.
 */
export function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2" role="status" aria-live="polite">
      <svg
        className="spinner shrink-0"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.28" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label ? <span>{label}</span> : <span className="sr-only">Working</span>}
    </span>
  );
}
