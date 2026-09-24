import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations — the chat list.
 *
 * Threads are grouped by the OTHER party, across both directions: a message you
 * sent to 9876543210 and one you received from it belong to the same thread.
 * Each thread reports the latest message's subject/preview/time plus how many
 * of its messages you have not read yet.
 */

/** How many recent messages we group. Enough for a demo, bounded for speed. */
const SCAN_LIMIT = 200;
/** Threads returned, newest activity first. */
const THREAD_LIMIT = 30;
const PREVIEW_LENGTH = 60;

function previewOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH)}…` : flat;
}

/** "<phone>@phonemail.com" -> "<phone>" for display as the thread name. */
function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

interface ThreadAccumulator {
  counterpartAddress: string;
  counterpart: string;
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
    },
  });

  const threads = new Map<string, ThreadAccumulator>();

  for (const email of emails) {
    const incoming = email.toUserId === user.sub;
    const counterpartAddress = incoming ? email.fromAddress : email.toAddress;

    const existing = threads.get(counterpartAddress);
    const isUnread = incoming && !email.isRead;

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

  const ordered = [...threads.values()]
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, THREAD_LIMIT)
    .map((thread) => ({ ...thread, lastAt: thread.lastAt.toISOString() }));

  return NextResponse.json(
    {
      count: ordered.length,
      threads: ordered,
    },
    { status: 200 },
  );
}
