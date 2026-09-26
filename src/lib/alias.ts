import { mailDomain } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

/**
 * Alias IDs (Day 6).
 *
 * An alias is a second way to reach one account: `john.doe` and `9876543210`
 * both resolve to the same user. Two rules make that safe:
 *
 *  1. localPart is globally unique AND may never collide with an existing
 *     phone number (see localPartIsTaken). Otherwise `<localPart>@phonemail.com`
 *     would be ambiguous and an alias could shadow somebody else's address.
 *  2. Resolution is one pure lookup shared by the send route and the inbound
 *     path, so from there on an alias behaves EXACTLY like a number: same row,
 *     same socket event, same notification gate. An unknown alias is therefore
 *     indistinguishable from an unknown number - 404.
 */

export const ALIAS_MIN_LENGTH = 3;
export const ALIAS_MAX_LENGTH = 20;

/** Lowercase letters, digits and dots - the shape of a mail local part. */
export const ALIAS_PATTERN = /^[a-z0-9.]+$/;

/**
 * Words that must never become an alias. Reserved mail-system roles
 * (postmaster/abuse/hostmaster) plus the names a user would reasonably mistake
 * for the service itself.
 */
export const RESERVED_ALIASES = new Set([
  "admin",
  "administrator",
  "abuse",
  "postmaster",
  "hostmaster",
  "webmaster",
  "support",
  "help",
  "info",
  "sales",
  "security",
  "root",
  "system",
  "mailer",
  "daemon",
  "noreply",
  "no-reply",
  "phonemail",
  "mail",
  "smtp",
  "api",
  "www",
  "portal",
  "ivr",
  "legal",
  "privacy",
  "billing",
  "team",
  "test",
]);

const PHONE_TOKEN = /^[6-9]\d{9}$/;

export type TokenKind = "phone" | "alias" | "invalid";

/** Strips the domain, trims and lowercases: "John.Doe@phonemail.com" -> "john.doe". */
export function recipientToken(raw: string): string {
  return raw.trim().replace(/@.*$/, "").toLowerCase();
}

export function isPhoneToken(token: string): boolean {
  return PHONE_TOKEN.test(token);
}

/**
 * Format check only - it says nothing about whether the account exists.
 * Rejects leading/trailing dots and doubled dots, which no mail system wants.
 */
export function isValidLocalPart(token: string): boolean {
  return (
    token.length >= ALIAS_MIN_LENGTH &&
    token.length <= ALIAS_MAX_LENGTH &&
    ALIAS_PATTERN.test(token) &&
    !token.startsWith(".") &&
    !token.endsWith(".") &&
    !token.includes("..") &&
    !RESERVED_ALIASES.has(token)
  );
}

/** The reason a localPart was rejected, ready to return to the client. */
export function localPartProblem(token: string): string | null {
  if (token.length < ALIAS_MIN_LENGTH || token.length > ALIAS_MAX_LENGTH) {
    return `An alias must be between ${ALIAS_MIN_LENGTH} and ${ALIAS_MAX_LENGTH} characters.`;
  }
  if (!ALIAS_PATTERN.test(token)) {
    return "An alias may only contain lowercase letters, digits and dots.";
  }
  if (token.startsWith(".") || token.endsWith(".") || token.includes("..")) {
    return "An alias cannot start or end with a dot, or contain two dots in a row.";
  }
  if (RESERVED_ALIASES.has(token)) {
    return `"${token}" is reserved and cannot be used as an alias.`;
  }
  return null;
}

export function classifyToken(token: string): TokenKind {
  if (isPhoneToken(token)) {
    return "phone";
  }
  if (isValidLocalPart(token)) {
    return "alias";
  }
  return "invalid";
}

export interface RecipientUser {
  id: string;
  phoneNumber: string;
  registeredVia: string;
  /** The recipient's own switch for "new mail" SMS. Defaults to true. */
  smsNotifications: boolean;
}

/**
 * Resolves a mixed list of recipient tokens (numbers and/or alias local parts)
 * to users, in two queries regardless of the mix.
 *
 * A token that resolves to nothing is simply absent from the map: the caller
 * decides whether that is a 400 (the token was not even valid) or a 404 (valid
 * shape, no such account).
 */
export async function lookupRecipientUsers(tokens: string[]): Promise<Map<string, RecipientUser>> {
  const resolved = new Map<string, RecipientUser>();

  const phoneTokens = tokens.filter(isPhoneToken);
  const aliasTokens = tokens.filter((token) => !isPhoneToken(token) && isValidLocalPart(token));

  const [byPhone, byAlias] = await Promise.all([
    phoneTokens.length > 0
      ? prisma.user.findMany({
          where: { phoneNumber: { in: phoneTokens } },
          select: { id: true, phoneNumber: true, registeredVia: true, smsNotifications: true },
        })
      : Promise.resolve([]),
    aliasTokens.length > 0
      ? prisma.alias.findMany({
          where: { localPart: { in: aliasTokens } },
          select: {
            localPart: true,
            user: {
              select: {
                id: true,
                phoneNumber: true,
                registeredVia: true,
                smsNotifications: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  for (const user of byPhone) {
    resolved.set(user.phoneNumber, user);
  }
  for (const alias of byAlias) {
    resolved.set(alias.localPart, alias.user);
  }

  return resolved;
}

/** True when an account or another alias already owns this local part. */
export async function localPartIsTaken(localPart: string): Promise<boolean> {
  const [user, alias] = await Promise.all([
    prisma.user.findUnique({ where: { phoneNumber: localPart }, select: { id: true } }),
    prisma.alias.findUnique({ where: { localPart }, select: { id: true } }),
  ]);
  return Boolean(user || alias);
}

export function aliasAddress(localPart: string): string {
  return `${localPart}@${mailDomain()}`;
}
