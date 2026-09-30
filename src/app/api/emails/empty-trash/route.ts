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

  const [recipientRows, senderRows] = await prisma.$transaction([
    prisma.email.updateMany({
      where: { toUserId: user.sub, folder: "trash", deletedForRecipient: false },
      data: { deletedForRecipient: true },
    }),
    // ROUND 29 follow-up 6: the sender's own trash empties with the rest.
    // deletedForSender is left alone, so an emptied sent message stays out
    // of the sender's views - the same quiet removal the row action alone
    // used to mean - it merely leaves the Trash list.
    prisma.email.updateMany({
      where: { fromUserId: user.sub, senderTrash: true },
      data: { senderTrash: false },
    }),
  ]);

  return NextResponse.json({ emptied: recipientRows.count + senderRows.count });
}
