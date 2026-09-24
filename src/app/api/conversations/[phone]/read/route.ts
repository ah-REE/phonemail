import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/conversations/[phone]/read — opening a thread marks it read.
 *
 * Batched (one UPDATE for every unread incoming message from that counterpart)
 * rather than one PATCH per message; the PATCH route stays available for
 * single-message changes.
 */
export async function POST(request: Request, context: { params: Promise<{ phone: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { phone } = await context.params;
  const counterpartPhone = normalizePhoneNumber(phone.trim().replace(/@.*$/, ""));

  const counterpart = await prisma.user.findUnique({
    where: { phoneNumber: counterpartPhone },
    select: { id: true },
  });

  if (!counterpart) {
    return NextResponse.json({ error: "No such PhoneMail user." }, { status: 404 });
  }

  const result = await prisma.email.updateMany({
    where: { fromUserId: counterpart.id, toUserId: user.sub, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ marked: result.count }, { status: 200 });
}
