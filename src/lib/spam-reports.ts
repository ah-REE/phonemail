/**
 * ROUND 30: the report rate limit - at most 10 DISTINCT reports per reporter
 * per hour.
 *
 * The counter is the established Redis shape (pin.ts's attempt counter,
 * notify.ts's cooldown): one key per reporter, INCR, the window's TTL set the
 * moment the counter is born. Repeats never reach this counter - the report
 * route answers an already-filed pair BEFORE consuming anything, because a
 * no-op must not spend quota. Refused attempts leave the counter above the
 * limit until the window closes; the window is the unit, not the count.
 */
import { getRedis } from "@/lib/redis";

export const SPAM_REPORT_LIMIT = 10;
export const SPAM_REPORT_WINDOW_SECONDS = 3600;

export function spamReportRateKey(reporterId: string): string {
  return `spam-report-rate:${reporterId}`;
}

export interface SpamReportQuota {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Consume one slot for a NEW distinct report. Throws only when Redis is
 * unreachable - the caller answers 503 for that, exactly like the OTP paths.
 */
export async function consumeSpamReportQuota(reporterId: string): Promise<SpamReportQuota> {
  const redis = await getRedis();
  const used = await redis.incr(spamReportRateKey(reporterId));
  if (used === 1) {
    await redis.expire(spamReportRateKey(reporterId), SPAM_REPORT_WINDOW_SECONDS);
  }
  if (used > SPAM_REPORT_LIMIT) {
    const ttl = await redis.ttl(spamReportRateKey(reporterId));
    return {
      allowed: false,
      retryAfterSeconds: typeof ttl === "number" && ttl > 0 ? ttl : SPAM_REPORT_WINDOW_SECONDS,
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
