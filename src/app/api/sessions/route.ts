import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { describeRecency, describeUserAgent } from "@/lib/device";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions — the devices signed in to this account.
 *
 * Each entry is what a person needs to recognise a device: a readable label parsed
 * from the user agent, when it signed in, and when it was last active. The CURRENT
 * session is flagged so the list can say "this device" rather than leaving the reader
 * to guess which row is the one they are holding.
 *
 * Only this user's rows are ever returned, and the label is derived from the stored
 * user agent rather than trusting anything the client sends now.
 */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: { userId: user.sub },
    orderBy: { lastActiveAt: "desc" },
    select: { id: true, userAgent: true, createdAt: true, lastActiveAt: true },
  });

  return NextResponse.json(
    {
      current: user.sid ?? null,
      sessions: sessions.map((session) => ({
        id: session.id,
        device: describeUserAgent(session.userAgent),
        current: session.id === user.sid,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        lastActive: describeRecency(session.lastActiveAt.toISOString()),
      })),
    },
    { status: 200 },
  );
}
