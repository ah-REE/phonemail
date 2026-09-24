import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
}

interface GroupAccumulator {
  threadKey: string;
  members: Set<string>;
  memberAddresses: Set<string>;
  subject: string;
  preview: string;
  lastAt: Date;
  unread: number;
}

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const emails = await prisma.email.findMany({
    where: {
      OR: [{ toUserId: user.sub }, { fromUserId: user.sub }],
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
    },
  });

  // Every group key this user is involved in, then the whole of each thread.
  const groupKeys = [
    ...new Set(emails.map((email) => email.threadKey).filter((key): key is string => Boolean(key))),
  ];

  const groupRows =
    groupKeys.length > 0
      ? await prisma.email.findMany({
          where: { threadKey: { in: groupKeys } },
          orderBy: { createdAt: "desc" },
          select: {
            threadKey: true,
            toUserId: true,
            fromAddress: true,
            toAddress: true,
            subject: true,
            body: true,
            isRead: true,
            createdAt: true,
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
      });
      continue;
    }

    if (isUnread) {
      existing.unread += 1;
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
  }

  const ordered = [...threads.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, THREAD_LIMIT)
    .map((thread) => ({ ...thread, lastAt: thread.lastAt.toISOString() }));

  const orderedGroups = [...groups.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, THREAD_LIMIT)
    .map((group) => ({
      threadKey: group.threadKey,
      members: [...group.members].sort(),
      memberAddresses: [...group.memberAddresses].sort(),
      subject: group.subject,
      preview: group.preview,
      lastAt: group.lastAt.toISOString(),
      unread: group.unread,
    }));

  return NextResponse.json(
    {
      count: ordered.length,
      threads: ordered,
      groupCount: orderedGroups.length,
      groupThreads: orderedGroups,
    },
    { status: 200 },
  );
}
