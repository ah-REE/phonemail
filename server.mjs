// PhoneMail custom server.
//
// `next start` cannot host Socket.io: it owns the HTTP listener. So we boot
// Next programmatically and attach Socket.io to the same HTTP server, which is
// what lets API routes emit realtime events into the recipient's room.
//
// JWT verification is duplicated here on purpose: this file runs outside Next's
// TypeScript compilation, so it cannot import src/lib/jwt.ts. The payload shape
// must stay identical to that module — { sub, phoneNumber, iat, exp }, HS256.
import { createServer } from "node:http";
import next from "next";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV === "development";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("JWT_SECRET is not set; refusing to start the socket server.");
  }
  return secret;
}

/** Same shape as AuthTokenPayload in src/lib/jwt.ts. */
function verifyToken(token) {
  return jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => {
  handle(request, response);
});

const io = new Server(httpServer, {
  // Same origin as the app; no CDN client is served from here.
  serveClient: false,
  path: "/socket.io",
});

// Unauthenticated sockets are rejected at the handshake, before any room exists.
io.use((socket, nextMiddleware) => {
  const handshakeToken =
    socket.handshake.auth?.token ??
    (socket.handshake.headers?.authorization ?? "").replace(/^Bearer\s+/i, "");

  if (!handshakeToken) {
    return nextMiddleware(new Error("unauthorized: missing token"));
  }

  try {
    const payload = verifyToken(handshakeToken);
    socket.data.userId = payload.sub;
    socket.data.phoneNumber = payload.phoneNumber;
    nextMiddleware();
  } catch {
    nextMiddleware(new Error("unauthorized: invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  // Room name is the user id: one room per account, so every device of that
  // user receives the same events.
  socket.join(userId);
  console.log(`[socket] connected user=${userId} socket=${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`[socket] disconnected user=${userId} socket=${socket.id} reason=${reason}`);
  });
});

// Published for API routes (see src/lib/socket.ts). Absent in `next dev`,
// where emitting is a silent no-op.
globalThis.__phonemailIo = io;

httpServer.listen(port, hostname, () => {
  console.log(`[server] ready on http://${hostname}:${port} (mode=${dev ? "development" : "production"}, socket.io attached)`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    io.close();
    httpServer.close(() => process.exit(0));
  });
}
