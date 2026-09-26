/**
 * Reconciling the chat with the server.
 *
 * The thread appends a PROVISIONAL bubble the moment the socket announces mail,
 * because that is what makes a chat feel live. The server's own row for that same
 * message arrives separately - and without reconciliation the screen shows BOTH,
 * the same message twice, one of them labelled "arriving…".
 *
 * This is not hypothetical: a self-send emits the event to the sender as well, so
 * sending one message to your own number rendered two bubbles from a single,
 * perfectly correct, single-row write.
 *
 * Pure functions, no React and no imports: they are unit-tested directly.
 */

export interface MergeableMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  provisional?: boolean;
}

/** A message is "the same message" when its sender, subject and text match. */
function sameContent(a: MergeableMessage, b: MergeableMessage): boolean {
  return a.from === b.from && a.subject === b.subject && a.body === b.body;
}

/**
 * Add a provisional bubble for a realtime event, unless that message is already
 * on screen. A repeated event is therefore a no-op rather than a second bubble.
 */
export function appendProvisional<T extends MergeableMessage>(current: T[], message: T): T[] {
  if (current.some((existing) => sameContent(existing, message))) {
    return current;
  }
  return [...current, message];
}

/**
 * The server's answer always wins. Rows are de-duplicated by id, and every
 * provisional bubble whose message has now arrived for real is dropped - which
 * is what turns "appended optimistically and fetched" into one bubble.
 */
export function mergeThreadMessages<T extends MergeableMessage>(current: T[], incoming: T[]): T[] {
  const seen = new Set<string>();
  const rows = incoming.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }
    seen.add(message.id);
    return true;
  });

  const stillPending = current.filter(
    (message) =>
      message.provisional && !rows.some((row) => !row.provisional && sameContent(row, message)),
  );

  return [...rows, ...stillPending];
}
