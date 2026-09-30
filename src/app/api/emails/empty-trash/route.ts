import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/emails/empty-trash (ROUND 29 follow-up 4, the owner's request:
 * the Trash screen's Empty trash button).
 *
 * Marks every message in the CALLER's trash as deleted-for-recipient - the
 * same per-viewer removal the row actions use - so the trash empties for its
 * owner and nobody else's copy is touched. A message is ONE row both sides
 * read, so "empty" cannot mean a row delete: the counterpart would lose
 * their copy with it (see the schema notes on deletedForRecipient).
 *
 * Returns how many messages left the trash: { emptied: n }.
 */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const result = await prisma.email.updateMany({
    where: { toUserId: user.sub, folder: "trash", deletedForRecipient: false },
    data: { deletedForRecipient: true },
  });

  return NextResponse.json({ emptied: result.count });
}
