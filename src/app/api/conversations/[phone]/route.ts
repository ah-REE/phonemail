import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { contactNamesByPhone } from "@/lib/contacts";
import { addressForPhone } from "@/lib/mailer";
import { normalizePhoneNumber, phoneNumberSchema } from "@/lib/phone";
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
        // out of my inbox. Day 9: a chat I deleted on my side is gone from BOTH
        // directions for me - and still there, untouched, for them.
        { fromUserId: user.sub, toUserId: counterpart.id, deletedForSender: false },
        { fromUserId: counterpart.id, toUserId: user.sub, folder: "inbox", deletedForRecipient: false },
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
      // Day 8: the files that travelled with each message, metadata only - the
      // bytes are fetched from /api/attachments/[id], which does its own check.
      attachments: {
        select: { id: true, filename: true, contentType: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
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
        attachments: message.attachments,
      })),
    },
    { status: 200 },
  );
}

/**
 * DELETE /api/conversations/[phone] - "delete chat", from the user detail sheet.
 *
 * WHAT IT DELETES, EXACTLY: the signed-in user's OWN side of this PAIRWISE
 * conversation, as two per-viewer flags - the rows they sent, and the rows they
 * received. It does NOT touch the counterpart's copy, because that copy is the same
 * row: this is the only honest meaning "delete" can carry for mail somebody else
 * also holds. It does not touch GROUP rows either, even with the same person in
 * them (the `threadKey: null` filter): a group message belongs to its thread, not to
 * this chat.
 *
 * The effect for the caller: the conversation leaves the list, the thread reads
 * empty and the unread count drops. A new mail from the same person starts the
 * conversation again, because the flags only hide what existed at this moment.
 */
export async function DELETE(request: Request, context: { params: Promise<{ phone: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { phone } = await context.params;
  const parsed = phoneNumberSchema.safeParse(phone);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid counterpart number." }, { status: 400 });
  }

  const counterpart = await prisma.user.findUnique({
    where: { phoneNumber: parsed.data },
    select: { id: true },
  });
  if (!counterpart) {
    return NextResponse.json({ error: "No such PhoneMail user." }, { status: 404 });
  }

  const [sent, received] = await prisma.$transaction([
    prisma.email.updateMany({
      where: { fromUserId: user.sub, toUserId: counterpart.id, threadKey: null },
      data: { deletedForSender: true },
    }),
    prisma.email.updateMany({
      where: { fromUserId: counterpart.id, toUserId: user.sub, threadKey: null },
      data: { deletedForRecipient: true },
    }),
  ]);

  return NextResponse.json(
    {
      phoneNumber: parsed.data,
      hidden: sent.count + received.count,
      scope: "your side of this conversation only",
    },
    { status: 200 },
  );
}
