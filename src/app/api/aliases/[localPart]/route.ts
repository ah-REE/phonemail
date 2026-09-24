import { NextResponse } from "next/server";

import { recipientToken } from "@/lib/alias";
import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/aliases/[localPart] - remove one of MY aliases.
 *
 * Owner-scoped by construction: the delete is filtered by userId, so an alias
 * belonging to someone else is a 404 rather than someone else's data going
 * missing. `deleteMany` (not `delete`) is what lets the filter do the
 * authorizing in one statement.
 */
export async function DELETE(request: Request, context: { params: Promise<{ localPart: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { localPart } = await context.params;
  const token = recipientToken(decodeURIComponent(localPart ?? ""));

  if (!token) {
    return NextResponse.json({ error: "Invalid alias." }, { status: 400 });
  }

  const result = await prisma.alias.deleteMany({
    where: { localPart: token, userId: user.sub },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "No such alias." }, { status: 404 });
  }

  return NextResponse.json({ removed: token }, { status: 200 });
}
