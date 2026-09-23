import type { NextConfig } from "next";

/**
 * Deliberately minimal.
 *
 * We intentionally do NOT use `output: "standalone"` here: the production
 * image runs `next start` with the normal `.next` build output plus a full
 * production `node_modules` (which includes the Prisma CLI needed by
 * `prisma migrate deploy` at container startup). A slightly larger image with
 * fewer moving parts beats a slim image that fails to boot on an evaluator's
 * machine. See the "known limitations" note in the Day 1 report.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
