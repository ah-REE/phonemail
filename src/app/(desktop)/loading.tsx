/** The three-zone web shell, while it fills. */
export default function DesktopLoading() {
  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="w-60 border-r border-outline-variant/60 bg-surface p-4" aria-busy="true" aria-label="Loading">
        <span className="skeleton mb-6 block h-5 w-24 rounded-full" />
        {Array.from({ length: 5 }, (_, row) => (
          <span key={row} className="skeleton mb-3 block h-4 w-4/5 rounded" />
        ))}
      </aside>
      <section className="flex w-96 flex-col border-r border-outline-variant/60 p-4">
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="mb-4">
            <span className="skeleton mb-2 block h-4 w-1/2 rounded" />
            <span className="skeleton block h-3 w-3/4 rounded" />
          </div>
        ))}
      </section>
      <main className="flex-1 p-6">
        <span className="skeleton mb-6 block h-6 w-64 rounded" />
        {Array.from({ length: 4 }, (_, row) => (
          <span
            key={row}
            className={`skeleton mb-3 block h-16 rounded-card ${row % 2 === 0 ? "ml-auto w-3/5" : "w-2/3"}`}
          />
        ))}
      </main>
    </div>
  );
}
