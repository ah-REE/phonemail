import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { contactNamesByPhone } from "@/lib/contacts";
import { prisma } from "@/lib/prisma";
import { FAVORITE_TAG } from "@/lib/tags";
import { phoneOf } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations - the chat list.
 *
 * PAIRWISE threads are grouped by the OTHER party, across both directions: a
 * message you sent to 9876543210 and one you received from it belong to the same
 * thread. Each thread reports the latest message's subject/preview/time plus how
 * many of its messages you have not read yet.
 *
 * Day 6: rows that carry a derived threadKey (see lib/threadKey.ts) are group
 * mail and are EXCLUDED from pairwise grouping - they come back separately as
 * `groupThreads`, grouped by their key, with the member list. Pairwise output is
 * byte-for-byte what it was before, so existing clients keep working.
 *
 * Why the group threads take a SECOND query: a member's own rows only ever name
 * the sender and themselves - the other recipients appear on the rows addressed
 * to THEM. Deriving the member list from the caller's rows alone would report a
 * 3-person group as a 2-person one for every recipient except the sender. So the
 * keys are collected first, then each thread is read whole.
 */

/** How many recent messages we group. Enough for a demo, bounded for speed. */
const SCAN_LIMIT = 200;
/** Threads returned, newest activity first. */
const THREAD_LIMIT = 30;
const PREVIEW_LENGTH = 60;

function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}.` : flat;
}

interface ThreadAccumulator {
  counterpartAddress: string;
  counterpart: string;
  subject: string;
  preview: string;
  lastAt: Date;
  unread: number;
  /** Day 6: true when ANY message in the thread carries the favorite tag. */
  favorite: boolean;
  /**
   * True when the thread's NEWEST message is one this user sent. The list row
   * needs it to prefix its preview with "You: ", which is the difference between
   * a list that reads as mail you received and one that reads as the conversation
   * it actually is.
   */
  outgoing: boolean;
}

interface GroupAccumulator {
  threadKey: string;
  members: Set<string>;
  memberAddresses: Set<string>;
  subject: string;
  preview: string;
  lastAt: Date;
  unread: number;
  /** Day 6: true when ANY message in the group carries the favorite tag. */
  favorite: boolean;
  /** See ThreadAccumulator.outgoing - the same rule for a group's newest row. */
  outgoing: boolean;
}

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const emails = await prisma.email.findMany({
    where: {
      // folder is RECIPIENT state: my own incoming spam/trash leaves the chat
      // list, while everything I sent stays visible to me regardless of what
      // the recipient did with it.
      OR: [
        { toUserId: user.sub, folder: "inbox" },
        { fromUserId: user.sub },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
    select: {
      fromUserId: true,
      toUserId: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
      threadKey: true,
      tag: true,
    },
  });

  // Every group key this user is involved in, then the whole of each thread.
  const groupKeys = [
    ...new Set(emails.map((email) => email.threadKey).filter((key): key is string => Boolean(key))),
  ];

  const groupRows =
    groupKeys.length > 0
      ? await prisma.email.findMany({
          where: {
            threadKey: { in: groupKeys },
            // Same recipient-scoped rule as the group thread endpoint: my own
            // spam/trash rows leave my group view, other members' are unaffected.
            OR: [{ toUserId: user.sub, folder: "inbox" }, { toUserId: { not: user.sub } }],
          },
          orderBy: { createdAt: "desc" },
          select: {
            threadKey: true,
            toUserId: true,
            // The group row reports whether the NEWEST message is mine, so the
            // scan has to know who sent it.
            fromUserId: true,
            fromAddress: true,
            toAddress: true,
            subject: true,
            body: true,
            isRead: true,
            createdAt: true,
            tag: true,
          },
        })
      : [];

  const threads = new Map<string, ThreadAccumulator>();
  const groups = new Map<string, GroupAccumulator>();

  for (const email of emails) {
    // Group mail is keyed by its derived key, never by a counterpart.
    if (email.threadKey) {
      continue;
    }

    const incoming = email.toUserId === user.sub;
    const counterpartAddress = incoming ? email.fromAddress : email.toAddress;
    const isUnread = incoming && !email.isRead;

    const existing = threads.get(counterpartAddress);

    if (!existing) {
      // First time we see this counterpart: `emails` is newest-first, so this
      // message is the thread's latest activity.
      threads.set(counterpartAddress, {
        counterpartAddress,
        counterpart: phoneOf(counterpartAddress),
        subject: email.subject,
        preview: previewOf(email.body),
        lastAt: email.createdAt,
        unread: isUnread ? 1 : 0,
        favorite: email.tag === FAVORITE_TAG,
        outgoing: !incoming,
      });
      continue;
    }

    if (isUnread) {
      existing.unread += 1;
    }
    if (email.tag === FAVORITE_TAG) {
      existing.favorite = true;
    }
  }

  for (const row of groupRows) {
    if (!row.threadKey) {
      continue;
    }

    const existing = groups.get(row.threadKey);

    if (!existing) {
      // groupRows is newest-first, so this row is the thread's latest activity.
      groups.set(row.threadKey, {
        threadKey: row.threadKey,
        members: new Set([phoneOf(row.fromAddress), phoneOf(row.toAddress)]),
        memberAddresses: new Set([row.fromAddress, row.toAddress]),
        subject: row.subject,
        preview: previewOf(row.body),
        lastAt: row.createdAt,
        unread: row.toUserId === user.sub && !row.isRead ? 1 : 0,
        favorite: row.tag === FAVORITE_TAG,
        outgoing: row.fromUserId === user.sub,
      });
      continue;
    }

    existing.members.add(phoneOf(row.fromAddress));
    existing.members.add(phoneOf(row.toAddress));
    existing.memberAddresses.add(row.fromAddress);
    existing.memberAddresses.add(row.toAddress);
    if (row.toUserId === user.sub && !row.isRead) {
      existing.unread += 1;
    }
    if (row.tag === FAVORITE_TAG) {
      existing.favorite = true;
    }
  }

  const ordered = [...threads.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, THREAD_LIMIT)
    // `attachments` is a constant 0 on purpose: there is no attachment backend
    // in this build, and the chip exists so the empty state is honest rather
    // than absent.
    .map((thread) => ({ ...thread, attachments: 0, lastAt: thread.lastAt.toISOString() }));

  const orderedGroups = [...groups.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, THREAD_LIMIT)
    .map((group) => ({
      threadKey: group.threadKey,
      members: [...group.members].sort(),
      memberAddresses: [...group.memberAddresses].sort(),
      subject: group.subject,
      preview: group.preview,
      outgoing: group.outgoing,
      lastAt: group.lastAt.toISOString(),
      unread: group.unread,
      favorite: group.favorite,
      attachments: 0,
    }));

  // Day 7: hand each thread the name to show for its counterpart, and each group
  // the names of its members, so no client invents a fallback of its own.
  const counterpartPhones = [...new Set(ordered.map((thread) => thread.counterpart))];
  const memberPhones = [...new Set(orderedGroups.flatMap((group) => group.members))];
  const allPhones = [...new Set([...counterpartPhones, ...memberPhones])];

  const namedUsers =
    allPhones.length > 0
      ? await prisma.user.findMany({
          where: { phoneNumber: { in: allPhones } },
          select: { phoneNumber: true, displayName: true },
        })
      : [];

  const nameByPhone = new Map(namedUsers.map((entry) => [entry.phoneNumber, entry.displayName]));

  // The owner's own address book outranks the account's profile name: a name you
  // typed is the one you will recognise. Unnamed contacts are absent from the
  // map, so they fall through to the profile name and then to the number.
  const contactNames = await contactNamesByPhone(user.sub);

  const namedThreads = ordered.map((thread) => ({
    ...thread,
    counterpartName: contactNames.get(thread.counterpart) ?? nameByPhone.get(thread.counterpart) ?? null,
  }));

  const namedGroups = orderedGroups.map((group) => ({
    ...group,
    memberNames: group.members.map(
      (member) => contactNames.get(member) ?? nameByPhone.get(member) ?? null,
    ),
  }));

  return NextResponse.json(
    {
      count: namedThreads.length,
      threads: namedThreads,
      groupCount: orderedGroups.length,
      groupThreads: namedGroups,
    },
    { status: 200 },
  );
}
