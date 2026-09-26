import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/contacts/[id] - remove one of MINE.
 *
 * The userId is part of the WHERE, not a check after the fetch: deleting somebody
 * else's row is not a permission error here, it simply matches nothing.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { id } = await context.params;
  const deleted = await prisma.contact.deleteMany({ where: { id, userId: user.sub } });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "No such contact." }, { status: 404 });
  }

  return NextResponse.json({ removed: deleted.count }, { status: 200 });
}
