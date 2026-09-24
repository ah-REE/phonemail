import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EMAIL_TAGS } from "@/lib/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/emails/[id] — recipient-only state changes.
 *
 *  - isRead: true   mark as read (the thread screen marks a conversation read)
 *  - tag: "..."     swipe-to-tag; null clears it. Day 6's folders build on this.
 *
 * "Owner" means the recipient: only the person the message was addressed to can
 * change its state. Anything else is 403, a missing row is 404.
 */



const patchSchema = z
  .object({
    isRead: z.boolean().optional(),
    tag: z.union([z.enum(EMAIL_TAGS), z.null()]).optional(),
  })
  .refine((value) => value.isRead !== undefined || value.tag !== undefined, {
    message: "Provide isRead and/or tag.",
  });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  // Next 15: params is a promise and must be awaited.
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        details: parsed.error.issues.map((issue) => issue.message),
        allowedTags: EMAIL_TAGS,
      },
      { status: 400 },
    );
  }

  const email = await prisma.email.findUnique({
    where: { id },
    select: { id: true, toUserId: true },
  });

  if (!email) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (email.toUserId !== user.sub) {
    return NextResponse.json(
      { error: "Only the recipient can change this message." },
      { status: 403 },
    );
  }

  const updated = await prisma.email.update({
    where: { id },
    data: {
      ...(parsed.data.isRead !== undefined ? { isRead: parsed.data.isRead } : {}),
      ...(parsed.data.tag !== undefined ? { tag: parsed.data.tag } : {}),
    },
    select: { id: true, isRead: true, tag: true },
  });

  return NextResponse.json(updated, { status: 200 });
}
