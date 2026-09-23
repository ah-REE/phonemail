import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton.
 *
 * Next.js dev mode hot-reloads modules, which would otherwise create a new
 * client (and a new connection pool) on every reload. The client is cached on
 * `globalThis` outside production so the pool is reused.
 */
declare global {
  // eslint-disable-next-line no-var
  var __phonemailPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__phonemailPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__phonemailPrisma = prisma;
}

export default prisma;
