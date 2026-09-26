/**
 * What the app shell shows while a screen's own data resolves. A skeleton reads
 * as "working"; a blank page reads as "broken".
 */
export default function MobileLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-phone flex-col bg-paper">
      <div className="flex items-center gap-3 border-b border-outline-variant/60 bg-surface px-4 py-3">
        <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
        <span className="skeleton h-5 w-36 rounded-full" />
      </div>
      <ul className="flex-1 px-4 py-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 6 }, (_, row) => (
          <li key={row} className="flex items-center gap-3 border-b border-outline-variant/40 py-3.5">
            <span className="skeleton h-12 w-12 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="skeleton mb-2 block h-4 w-1/3 rounded" />
              <span className="skeleton mb-1.5 block h-3 w-2/3 rounded" />
              <span className="skeleton block h-3 w-1/2 rounded" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
