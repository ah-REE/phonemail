import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { contactNamesByPhone } from "@/lib/contacts";
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

  // Day 7: the counterpart's chosen name rides along with the thread.
  const counterpart = await prisma.user.findUnique({
    where: { phoneNumber: counterpartPhone },
    select: { id: true, phoneNumber: true, displayName: true },
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
    orderBy: { createdAt: "desc" },
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
      replyToId: true,
    },
  });

  // The newest THREAD_LIMIT rows, then back into reading order. An ascending
  // limit of 200 hands back the OLDEST 200, so once a conversation passed the cap
  // its newest message could never appear - which is exactly how a send that
  // worked perfectly (202, stored, socket event, home preview updated) still
  // looked like a send that did nothing.
  messages.reverse();



  const unread = messages.filter((message) => message.toUserId === user.sub && !message.isRead).length;
  const latest = messages[messages.length - 1];

  // The name this user saved beats the name the other account chose, which beats
  // the number. The account's own name rides along separately so the detail sheet
  // can show both when they differ, rather than silently picking one.
  const contactNames = await contactNamesByPhone(user.sub);

  return NextResponse.json(
    {
      counterpart: counterpart.phoneNumber,
      counterpartName: contactNames.get(counterpartPhone) ?? counterpart.displayName ?? null,
      counterpartAccountName: counterpart.displayName ?? null,
      counterpartAddress: addressForPhone(counterpart.phoneNumber),
      subject: latest?.subject ?? "",
      count: messages.length,
      unread,
      messages: messages.map((message) => ({
        id: message.id,
        mine: message.fromUserId === user.sub,
        fromName: message.fromUserId === counterpart.id ? counterpart.displayName ?? null : null,
        from: message.fromAddress,
        to: message.toAddress,
        subject: message.subject,
        body: message.body,
        isRead: message.isRead,
        createdAt: message.createdAt,
        repliedAt: message.repliedAt,
        replyToId: message.replyToId,
        tag: message.tag,
      })),
    },
    { status: 200 },
  );
}
