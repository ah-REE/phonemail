import { verifyAuthToken, type AuthTokenPayload } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

/**
 * How often a session's lastActiveAt is written. Every request would make the row a
 * request log; five minutes is enough to recognise "the phone I used this morning".
 */
export const SESSION_ACTIVITY_WRITE_SECONDS = 300;

/**
 * Shared JWT guard for protected API routes.
 *
 * Returns the token payload, or null when the caller is not authenticated —
 * routes translate null into a 401 so the behaviour is uniform.
 */

/** Pulls the token out of `Authorization: Bearer <jwt>`. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const token = rest.join("");
  return token.length > 0 ? token : null;
}

/**
 * Verifies the request's bearer token AND that its session still exists.
 *
 * Day 9: a token is no longer a bearer pass by itself - it is a reference to a
 * SESSION row, and when that row is gone the token is dead. That is what makes
 * "log this device out" and "deleting the account logs every device out" real
 * without keeping a denylist of revoked tokens.
 *
 * A token with no `sid` (minted before sessions existed) is treated as
 * UNAUTHENTICATED rather than as valid: the client re-authenticates once and gets a
 * session, which is a one-time inconvenience in exchange for a rule with no
 * exceptions in it.
 *
 * Returns null when absent, invalid, expired, or no longer backed by a session -
 * routes translate null into a 401 so the behaviour stays uniform.
 */
export async function requireUser(request: Request): Promise<AuthTokenPayload | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  let payload: AuthTokenPayload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return null;
  }

  if (!payload.sid) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    select: { id: true, userId: true, lastActiveAt: true },
  });

  if (!session || session.userId !== payload.sub) {
    return null;
  }

  const staleMs = SESSION_ACTIVITY_WRITE_SECONDS * 1000;
  if (Date.now() - new Date(session.lastActiveAt).getTime() > staleMs) {
    // A failed activity write must never fail the request it is decorating.
    await prisma.session
      .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
  }

  return payload;
}

/** Standard 401 body, kept in one place so clients can rely on the shape. */
export const UNAUTHORIZED_BODY = { error: "Authentication required." } as const;
