import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { draftProblem, isBlankDraft, type DraftFields } from "@/lib/draft";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET / PUT / DELETE /api/me/draft - the one active draft, per user.
 *
 * WHY A ROW RATHER THAN localStorage: a draft written on the phone should still be
 * there when the same account opens the desktop client, and the reverse. The
 * browser store is kept as a write-through CACHE by the clients (see the
 * composers), not as the source of truth.
 *
 * ONE PER USER, enforced by a unique index rather than by a convention: `put` is an
 * upsert on that index, so two tabs saving at once cannot leave two drafts behind.
 * A send DELETEs it; abandonment leaves it, which is the point of the feature.
 *
 * A BLANK draft is not stored - it is cleared. Otherwise "open compose, look at it,
 * close it" would resurrect an empty draft forever, which reads as a bug.
 */

const FIELDS = ["to", "cc", "subject", "body"] as const;

function readFields(body: unknown): Partial<DraftFields> {
  if (!body || typeof body !== "object") return {};
  const source = body as Record<string, unknown>;
  const fields: Partial<DraftFields> = {};
  for (const field of FIELDS) {
    const value = source[field];
    if (typeof value === "string") {
      fields[field] = value;
    }
  }
  return fields;
}

function shape(draft: {
  to: string;
  cc: string;
  subject: string;
  body: string;
  updatedAt: Date;
} | null) {
  if (!draft) return null;
  return {
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    body: draft.body,
    updatedAt: draft.updatedAt,
  };
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const draft = await prisma.draft.findUnique({
    where: { userId: user.sub },
    select: { to: true, cc: true, subject: true, body: true, updatedAt: true },
  });

  return NextResponse.json({ draft: shape(draft) }, { status: 200 });
}

export async function PUT(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const fields = readFields(await request.json().catch(() => ({})));
  const problem = draftProblem(fields);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  const merged: DraftFields = {
    to: fields.to ?? "",
    cc: fields.cc ?? "",
    subject: fields.subject ?? "",
    body: fields.body ?? "",
  };

  if (isBlankDraft(merged)) {
    await prisma.draft.deleteMany({ where: { userId: user.sub } });
    return NextResponse.json({ draft: null, cleared: true }, { status: 200 });
  }

  const draft = await prisma.draft.upsert({
    where: { userId: user.sub },
    create: { userId: user.sub, ...merged },
    update: merged,
    select: { to: true, cc: true, subject: true, body: true, updatedAt: true },
  });

  return NextResponse.json({ draft: shape(draft), saved: true }, { status: 200 });
}

export async function DELETE(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const removed = await prisma.draft.deleteMany({ where: { userId: user.sub } });
  return NextResponse.json({ cleared: true, removed: removed.count }, { status: 200 });
}
