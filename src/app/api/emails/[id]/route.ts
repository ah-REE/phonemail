import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EMAIL_FOLDERS } from "@/lib/folders";
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
    // Day 6 folders: moving a message is one field change, like a tag.
    folder: z.enum(EMAIL_FOLDERS).optional(),
  })
  .refine(
    (value) => value.isRead !== undefined || value.tag !== undefined || value.folder !== undefined,
    { message: "Provide isRead, tag and/or folder." },
  );

/**
 * ROUND 29: GET /api/emails/[id] - one row of the caller's mail. The forward
 * composers read the source this way; PARTY ONLY (sender or recipient), and
 * the response carries attachment METADATA, never the bytes - those stay
 * behind /api/attachments/[id]'s own party check.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { id } = await context.params;

  const email = await prisma.email.findUnique({
    where: { id },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      createdAt: true,
      tag: true,
      isRead: true,
      folder: true,
      repliedAt: true,
      attachments: { select: { id: true, filename: true, contentType: true, sizeBytes: true } },
    },
  });

  if (!email) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (email.fromUserId !== user.sub && email.toUserId !== user.sub) {
    return NextResponse.json({ error: "That message is not yours." }, { status: 403 });
  }

  return NextResponse.json({
    message: {
      id: email.id,
      mine: email.fromUserId === user.sub,
      from: email.fromAddress,
      to: email.toAddress,
      subject: email.subject,
      body: email.body,
      createdAt: email.createdAt,
      tag: email.tag,
      isRead: email.isRead,
      folder: email.folder,
      repliedAt: email.repliedAt,
      attachments: email.attachments,
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
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
    select: { id: true, toUserId: true, fromUserId: true, senderTrash: true },
  });

  if (!email) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const isRecipient = email.toUserId === user.sub;
  /** ROUND 29 follow-up 2: the sender's own mail takes the sender's own actions. */
  const isSender = email.fromUserId === user.sub;

  if (!isRecipient && !isSender) {
    return NextResponse.json(
      { error: "Only a party to the message can change it." },
      { status: 403 },
    );
  }

  /**
   * ROUND 29 follow-up 4 (the owner's correction: Trash, not Spam, for sent mail):
   *  - tag (favorite) is a label on the message and is written as-is for either
   *    party - the shared-row model both sides already read;
   *  - for the SENDER, "move to trash" cannot set the row's folder - that
   *    folder is the RECIPIENT's mailbox - so it removes the message from the
   *    SENDER's own views instead (deletedForSender), the same per-viewer
   *    mechanism delete-chat uses. The recipient's copy is untouched;
   *  - Spam is not offered on sent mail at all (the owner's correction), and
   *    isRead stays recipient-only.
   *
   * ROUND 29 follow-up 6 (the owner: "mails are not listed [on the trash page]
   * when i click move to trash"): the sender's trash is now a REAL list - the
   * removal also stamps senderTrash, the flag the sender's trash screens read,
   * and "Move to inbox" (folder: "inbox") is the way back: it clears both
   * flags and the message returns to the sender's views. The recipient's copy
   * is untouched by all of it.
   */
  const removesForSender = isSender && !isRecipient && parsed.data.folder === "trash";
  const restoresForSender =
    isSender && !isRecipient && parsed.data.folder === "inbox" && email.senderTrash;

  if (!isRecipient) {
    const touchesRecipientState =
      parsed.data.isRead !== undefined ||
      (parsed.data.folder !== undefined && !removesForSender && !restoresForSender);
    if (touchesRecipientState) {
      return NextResponse.json(
        { error: "Only the recipient can change this message." },
        { status: 403 },
      );
    }
  }

  const updated = await prisma.email.update({
    where: { id },
    data: {
      ...(parsed.data.isRead !== undefined && isRecipient ? { isRead: parsed.data.isRead } : {}),
      ...(parsed.data.tag !== undefined ? { tag: parsed.data.tag } : {}),
      ...(parsed.data.folder !== undefined && isRecipient ? { folder: parsed.data.folder } : {}),
      ...(removesForSender ? { deletedForSender: true, senderTrash: true } : {}),
      ...(restoresForSender ? { deletedForSender: false, senderTrash: false } : {}),
    },
    select: { id: true, isRead: true, tag: true, folder: true },
  });

  return NextResponse.json(updated, { status: 200 });
}
