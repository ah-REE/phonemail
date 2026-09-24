import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGroupThreadKey } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/conversations/thread/[key]/read - opening a group thread marks it
 * read (Day 6).
 *
 * Per-member, exactly like the pairwise route: the UPDATE is scoped to rows
 * addressed TO the requester, so one member reading the thread leaves every
 * other member's unread badge untouched. That is asserted in the Day 6
 * regression.
 *
 * Batched (one UPDATE for all of the requester's unread rows in the thread)
 * rather than one PATCH per message.
 */
export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { key } = await context.params;
  const threadKey = decodeURIComponent(key ?? "").trim();

  if (!isGroupThreadKey(threadKey)) {
    return NextResponse.json({ error: "Invalid thread key." }, { status: 400 });
  }

  const membership = await prisma.email.findFirst({
    where: {
      threadKey,
      OR: [{ fromUserId: user.sub }, { toUserId: user.sub }],
    },
    select: { id: true },
  });

  if (!membership) {
    // Either the thread does not exist or the caller is not in it. Both are a
    // refusal; the distinction is not worth leaking.
    return NextResponse.json({ error: "No such thread you are part of." }, { status: 404 });
  }

  const result = await prisma.email.updateMany({
    where: { threadKey, toUserId: user.sub, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ marked: result.count }, { status: 200 });
}
