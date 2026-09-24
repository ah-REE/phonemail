/**
 * Loading placeholders. Used instead of a blank screen while a screen's data
 * (or the auth phase) resolves — a skeleton reads as "working", an empty page
 * reads as "broken".
 */

export function ChatRowSkeleton() {
  return (
    <li className="flex items-center gap-3 border-b border-wa-line px-4 py-3.5">
      <span className="skeleton h-12 w-12 shrink-0 rounded-full" />
      <span className="min-w-0 flex-1">
        <span className="skeleton mb-2 block h-4 w-1/3 rounded" />
        <span className="skeleton mb-1.5 block h-3 w-2/3 rounded" />
        <span className="skeleton block h-3 w-1/2 rounded" />
      </span>
    </li>
  );
}

export function ChatListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: rows }, (_, index) => (
        <ChatRowSkeleton key={index} />
      ))}
    </ul>
  );
}

export function ThreadSkeleton({ bubbles = 4 }: { bubbles?: number }) {
  return (
    <div className="p-4" aria-busy="true" aria-label="Loading conversation">
      {Array.from({ length: bubbles }, (_, index) => (
        <div key={index} className={`mb-3 flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <span className={`skeleton block h-16 rounded-lg ${index % 3 === 0 ? "w-3/4" : "w-1/2"}`} />
        </div>
      ))}
    </div>
  );
}
