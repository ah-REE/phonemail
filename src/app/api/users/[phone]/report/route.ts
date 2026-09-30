import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { consumeSpamReportQuota } from "@/lib/spam-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/users/[phone]/report (ROUND 30).
 *
 * Records the caller's report of this account. A report is a SIGNAL: it blocks
 * nothing and deletes nothing by itself - the delivery gate is a separate
 * consumer; this endpoint is only the sensor, and the README says so.
 *
 * IDEMPOTENT: one report per reporter per reported account (the table's UNIQUE
 * pair), so a repeat is a 200 no-op, never a double count - and a repeat does
 * not spend rate quota, because it files nothing.
 *
 * RATE-LIMITED: at most SPAM_REPORT_LIMIT distinct reports per reporter per
 * hour, on the established Redis counter shape (lib/spam-reports). The refusal
 * says so and carries retryAfterSeconds.
 *
 * SELF-REPORTS are refused with a 400 - one does not report oneself, and the
 * sheets hide the action on your own account for the same reason.
 */
export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { phone } = await context.params;
  const parsed = phoneNumberSchema.safeParse(phone);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const account = await prisma.user.findUnique({
    where: { phoneNumber: parsed.data },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ error: "No such PhoneMail user." }, { status: 404 });
  }

  if (account.id === user.sub) {
    return NextResponse.json({ error: "You cannot report yourself." }, { status: 400 });
  }

  // A repeat files nothing, so it neither counts a report nor spends quota.
  const existing = await prisma.spamReport.findUnique({
    where: { reporterId_reportedUserId: { reporterId: user.sub, reportedUserId: account.id } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ reported: true, duplicate: true }, { status: 200 });
  }

  let quota: Awaited<ReturnType<typeof consumeSpamReportQuota>>;
  try {
    quota = await consumeSpamReportQuota(user.sub);
  } catch (error) {
    console.error("[users/report] Redis failure", error);
    return NextResponse.json(
      { error: "Reports are temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: "You have filed too many reports in the last hour. Try again later.",
        reason: "report-rate-limit",
        retryAfterSeconds: quota.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  try {
    await prisma.spamReport.create({
      data: { reporterId: user.sub, reportedUserId: account.id },
      select: { id: true },
    });
  } catch (error) {
    // P2002: a concurrent identical report raced us - the pair still exists once.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ reported: true, duplicate: true }, { status: 200 });
    }
    throw error;
  }

  return NextResponse.json({ reported: true, duplicate: false }, { status: 200 });
}
