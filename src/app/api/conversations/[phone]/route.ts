import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { addressForPhone } from "@/lib/mailer";
import { normalizePhoneNumber } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/[phone] — one conversation, both directions.
 *
 * Chronological (oldest first, the way a chat reads), capped so a long thread
 * cannot blow up the client. Pure read: marking the thread read is a separate
 * POST (see ./read), so a GET never mutates state.
 */

const THREAD_LIMIT = 200;

export async function GET(request: Request, context: { params: Promise<{ phone: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { phone } = await context.params;
  const counterpartPhone = normalizePhoneNumber(phone.trim().replace(/@.*$/, ""));

  if (!/^[6-9]\d{9}$/.test(counterpartPhone)) {
    return NextResponse.json({ error: "Invalid counterpart number." }, { status: 400 });
  }

  const counterpart = await prisma.user.findUnique({
    where: { phoneNumber: counterpartPhone },
    select: { id: true, phoneNumber: true },
  });

  if (!counterpart) {
    return NextResponse.json({ error: "No such PhoneMail user." }, { status: 404 });
  }

  const messages = await prisma.email.findMany({
    where: {
      OR: [
        // What I sent stays visible to me; what arrived shows unless I moved it
        // out of my inbox.
        { fromUserId: user.sub, toUserId: counterpart.id },
        { fromUserId: counterpart.id, toUserId: user.sub, folder: "inbox" },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: THREAD_LIMIT,
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
      repliedAt: true,
      tag: true,
    },
  });

  const unread = messages.filter((message) => message.toUserId === user.sub && !message.isRead).length;
  const latest = messages[messages.length - 1];

  return NextResponse.json(
    {
      counterpart: counterpart.phoneNumber,
      counterpartAddress: addressForPhone(counterpart.phoneNumber),
      subject: latest?.subject ?? "",
      count: messages.length,
      unread,
      messages: messages.map((message) => ({
        id: message.id,
        mine: message.fromUserId === user.sub,
        from: message.fromAddress,
        to: message.toAddress,
        subject: message.subject,
        body: message.body,
        isRead: message.isRead,
        createdAt: message.createdAt,
        repliedAt: message.repliedAt,
        tag: message.tag,
      })),
    },
    { status: 200 },
  );
}
