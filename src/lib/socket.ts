import type { Server } from "socket.io";

/**
 * Bridge between Next's request handlers and the Socket.io server.
 *
 * The Socket.io instance lives in server.mjs (outside Next's compilation, since
 * `next start` cannot host a custom HTTP server). It publishes itself on
 * globalThis, and because API routes run in the same Node process when the app
 * is started through server.mjs, routes can emit to connected users.
 *
 * When there is no handle — `next dev`, or a plain `next start` during local
 * work — emitting is a silent no-op rather than an error.
 */

declare global {
  // eslint-disable-next-line no-var
  var __phonemailIo: Server | undefined;
}

export function getSocketServer(): Server | undefined {
  return globalThis.__phonemailIo;
}

export function newEmailEventName(): string {
  return "new-email";
}

export interface NewEmailEvent {
  from: string;
  subject: string;
  preview: string;
}

/** Emits "new-email" into the recipient's room (room name = user id). */
export function emitNewEmail(userId: string, event: NewEmailEvent): boolean {
  const io = getSocketServer();
  if (!io) {
    return false;
  }

  io.to(userId).emit(newEmailEventName(), event);
  return true;
}
