import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/emails/[id] — owner-only mark-as-read.
 *
 * "Owner" means the recipient: only the person the message was addressed to can
 * mark it read. Anything else is 403, a missing row is 404.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  // Next 15: params is a promise and must be awaited.
  const { id } = await context.params;

  const email = await prisma.email.findUnique({
    where: { id },
    select: { id: true, toUserId: true, isRead: true },
  });

  if (!email) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (email.toUserId !== user.sub) {
    return NextResponse.json(
      { error: "Only the recipient can change this message." },
      { status: 403 },
    );
  }

  const updated = await prisma.email.update({
    where: { id },
    data: { isRead: true },
    select: { id: true, isRead: true },
  });

  return NextResponse.json({ id: updated.id, isRead: updated.isRead }, { status: 200 });
}
