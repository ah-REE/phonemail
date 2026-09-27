import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { contactNamesByPhone } from "@/lib/contacts";
import { prisma } from "@/lib/prisma";
import { isGroupThreadKey, phoneOf } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/thread/[key] - one GROUP conversation (Day 6).
 *
 * A group thread has no owner, no row and no membership table: the URL carries
 * the derived key (see lib/threadKey.ts) and every Email row that carries that
 * key is the conversation. That is what makes the spec's requirement possible -
 * every member sees the WHOLE thread, including the rows that were addressed to
 * other members - without a second data model.
 *
 * Authorization IS membership, proven by the data: the requester must appear as
 * sender or recipient on at least one row carrying the key. Someone who holds a
 * key but was never part of the conversation gets 403, not the messages.
 *
 * Read is pure: marking read is a separate POST that only ever touches the
 * requester's own rows (see ./read), so one member reading cannot clear another
 * member's unread badge.
 */

const THREAD_LIMIT = 200;

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { key } = await context.params;
  const threadKey = decodeURIComponent(key ?? "").trim();

  if (!isGroupThreadKey(threadKey)) {
    return NextResponse.json({ error: "Invalid thread key." }, { status: 400 });
  }

  const messages = await prisma.email.findMany({
    where: {
      threadKey,
      // Visibility is PER VIEWER, and it is the core of the group's reply model:
      //   - my own rows are mine to see (the recipient's folder is theirs);
      //   - mail addressed to me is visible unless I moved it out of my inbox;
      //   - another member's BROADCAST (replyToId null) is the group's shared
      //     history and everyone reads it;
      //   - another member's REPLY is visible to nobody but its sender and its
      //     recipient, so it is excluded from everyone else's payload entirely.
      OR: [
        { fromUserId: user.sub, deletedForSender: false },
        { toUserId: user.sub, folder: "inbox", deletedForRecipient: false },
        { replyToId: null, toUserId: { not: user.sub }, deletedForSender: false },
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
      submissionId: true,
      replyToId: true,
      // Day 8: the files on each row, metadata only (see the 1:1 thread route).
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



  if (messages.length === 0) {
    return NextResponse.json({ error: "No such thread." }, { status: 404 });
  }

  // ONE bubble per submission. A broadcast is one row per recipient, so without
  // this the same message appears once for every member - and the viewer's OWN row
  // is preferred, because that is the row carrying their read state.
  const representative = new Map<string, (typeof messages)[number]>();
  for (const message of messages) {
    const key = message.submissionId ?? message.id;
    const current = representative.get(key);
    if (!current || message.toUserId === user.sub) {
      representative.set(key, message);
    }
  }
  const shown = messages.filter(
    (message) => representative.get(message.submissionId ?? message.id)?.id === message.id,
  );

  const isMember = messages.some(
    (message) => message.fromUserId === user.sub || message.toUserId === user.sub,
  );

  if (!isMember) {
    return NextResponse.json(
      { error: "You are not a member of this conversation." },
      { status: 403 },
    );
  }

  // The member list is derived the same way the key was: from the addresses that
  // actually appear on the rows.
  const memberAddresses = [...new Set(messages.flatMap((m) => [m.fromAddress, m.toAddress]))].sort();
  const members = memberAddresses.map(phoneOf);

  // Day 7: each member's chosen name, aligned with `members`, plus the sender name
  // on every row so the client can label bubbles without guessing.
  const memberUsers = await prisma.user.findMany({
    where: { phoneNumber: { in: members } },
    select: { phoneNumber: true, displayName: true },
  });
  const nameByPhone = new Map(memberUsers.map((entry) => [entry.phoneNumber, entry.displayName]));

  // Same precedence as everywhere else: the user's own contact name first, then
  // the member's profile name, then the number.
  const contactNames = await contactNamesByPhone(user.sub);
  const nameFor = (phone: string) => contactNames.get(phone) ?? nameByPhone.get(phone) ?? null;

  const memberNames = members.map((member) => nameFor(member));

  const unread = shown.filter((message) => message.toUserId === user.sub && !message.isRead).length;
  const latest = shown[shown.length - 1];

  // The creator is the member who broadcasts - the sender of the thread's first
  // broadcast. Derived, like everything else about a group, so no column has to
  // remember it: who opened the conversation is the member whose mail did.
  const broadcasts = shown.filter((message) => !message.replyToId);
  const creatorPhone =
    broadcasts.length > 0 ? phoneOf(broadcasts[broadcasts.length - 1].fromAddress) : null;

  return NextResponse.json(
    {
      threadKey,
      creatorPhone,
      members,
      memberNames,
      memberAddresses,
      subject: latest?.subject ?? "",
      count: messages.length,
      unread,
      messages: shown.map((message) => ({
        id: message.id,
        submissionId: message.submissionId,
        replyToId: message.replyToId,
        mine: message.fromUserId === user.sub,
        fromName: nameFor(phoneOf(message.fromAddress)),
        from: message.fromAddress,
        to: message.toAddress,
        subject: message.subject,
        body: message.body,
        isRead: message.isRead,
        createdAt: message.createdAt,
        repliedAt: message.repliedAt,
        tag: message.tag,
        attachments: message.attachments,
      })),
    },
    { status: 200 },
  );
}
