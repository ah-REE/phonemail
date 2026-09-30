import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { phoneNumberSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/users/[phone]/credibility (ROUND 30, sender credibility).
 *
 * The numbers the user sheets render next to a person: how long the account
 * has existed, how much it has sent and received, and how many DISTINCT
 * reporters have reported it.
 *
 * WHO MAY READ IT: any signed-in caller - deliberately. The signals exist to
 * help a stranger judge a first message, so they must be visible wherever a
 * sender's name is; the README states this stance. No reporter identity is
 * ever exposed; `viewerReported` is the caller's OWN report state (so a sheet
 * can settle on "Reported ✓" when it reopens) - the one per-viewer bit.
 *
 * The counts are live, from indexed columns (Email.fromUserId / Email.toUserId,
 * SpamReport.reportedUserId) - no cache. ct35 reports the measured latency on
 * every run; it has stayed in single-digit milliseconds on the loaded dev
 * database, which is why "cache lightly if needed" never needed to.
 */
export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
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
    select: { id: true, createdAt: true },
  });
  if (!account) {
    return NextResponse.json({ error: "No such PhoneMail user." }, { status: 404 });
  }

  const [sentCount, receivedCount, reportCount, viewerReports] = await prisma.$transaction([
    prisma.email.count({ where: { fromUserId: account.id } }),
    prisma.email.count({ where: { toUserId: account.id } }),
    prisma.spamReport.count({ where: { reportedUserId: account.id } }),
    prisma.spamReport.count({ where: { reportedUserId: account.id, reporterId: user.sub } }),
  ]);

  return NextResponse.json(
    {
      memberSince: account.createdAt.toISOString(),
      sentCount,
      receivedCount,
      reportCount,
      viewerReported: viewerReports > 0,
    },
    { status: 200 },
  );
}
