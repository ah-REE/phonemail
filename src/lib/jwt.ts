import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";

/**
 * JWT shape for PhoneMail — defined here, on Day 1, so every later day
 * (desktop UI, Socket.io handshake, SMTP-triggered notifications) reuses one
 * definition instead of inventing its own.
 *
 *   {
 *     "sub": "clx...",          // User.id (Prisma cuid)
 *     "phoneNumber": "9876543210",
 *     "iat": 1758600000,        // issued-at, seconds
 *     "exp": 1759204800         // expiry, seconds (7 days)
 *   }
 *
 * Notes:
 *  - `sub` is the only identifier; the phone number is carried as a claim so a
 *    later API route can address `9876543210@phonemail.com` without a DB hit.
 *  - No roles/scopes yet: the account is the whole authorization model on
 *    Day 1. Add claims (not a new token format) when groups arrive.
 */
export interface AuthTokenPayload {
  /**
   * Day 9: the SESSION this token belongs to. A token is only good while its row
   * still exists, which is what makes logging one device out - and logging every
   * device out when the account is deleted - actually end the token. A token issued
   * before sessions existed carries no sid, and requireUser treats that as
   * unauthenticated so the client re-authenticates once and gets one.
   */
  sid?: string;
  sub: string;
  phoneNumber: string;
  iat: number;
  exp: number;
}

export const JWT_ALGORITHM = "HS256" as const;
export const JWT_EXPIRES_IN = "7d";

/** Thrown when JWT_SECRET is missing, so the failure is loud and early. */
export class MissingJwtSecretError extends Error {
  constructor() {
    super(
      "JWT_SECRET is not set. docker-compose.yml sets a placeholder for local " +
        "runs; set a real value in .env for local development.",
    );
    this.name = "MissingJwtSecretError";
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new MissingJwtSecretError();
  }
  return secret;
}

/**
 * Signs a 7-day HS256 token for the given account, bound to a session when one is
 * given. The session id rides in `sid`; everything else about the token is unchanged.
 */
export function signAuthToken(
  user: { id: string; phoneNumber: string },
  sessionId?: string,
): string {
  const claims = {
    sub: user.id,
    phoneNumber: user.phoneNumber,
    ...(sessionId ? { sid: sessionId } : {}),
  };
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(claims, getJwtSecret(), options);
}

/** Verifies a token and returns its payload. Throws on an invalid token. */
export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  }) as AuthTokenPayload;
}
