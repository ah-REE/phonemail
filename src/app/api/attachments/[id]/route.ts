import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/attachments/[id] - the bytes of one attached file.
 *
 * PARTY-ONLY, and "party" is the message's own pair of users: its sender and its
 * recipient. There is no share link and no anonymous read, because the whole
 * privacy story of this app is that the mailbox is private - a file anyone with a
 * URL could fetch would undo that in one line.
 *
 * The response carries the stored content type and the real filename in a
 * disposition header, so a download arrives named as it was sent rather than as an
 * opaque id. Caching is disabled: the bytes are the user's private mail.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { id } = await context.params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    select: {
      filename: true,
      contentType: true,
      data: true,
      email: { select: { fromUserId: true, toUserId: true } },
    },
  });

  if (!attachment) {
    return NextResponse.json({ error: "No such attachment." }, { status: 404 });
  }

  const isParty =
    attachment.email.fromUserId === user.sub || attachment.email.toUserId === user.sub;

  if (!isParty) {
    return NextResponse.json({ error: "That file belongs to somebody else's mail." }, { status: 403 });
  }

  // A filename with a quote in it must not be able to end the header early.
  const safeName = attachment.filename.replace(/["\\\r\n]/g, "_");
  const body = new Uint8Array(attachment.data);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": attachment.contentType,
      "content-length": String(body.byteLength),
      "content-disposition": `attachment; filename="${safeName}"`,
      "cache-control": "private, no-store",
    },
  });
}
