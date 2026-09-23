import { verifyAuthToken, type AuthTokenPayload } from "@/lib/jwt";

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

/** Verifies the request's bearer token. Returns null when absent or invalid. */
export function requireUser(request: Request): AuthTokenPayload | null {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

/** Standard 401 body, kept in one place so clients can rely on the shape. */
export const UNAUTHORIZED_BODY = { error: "Authentication required." } as const;
