import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/sessions/[id] — log ONE device out.
 *
 * Deleting the row is the whole mechanism: the token that named this session stops
 * being accepted by requireUser on its very next request, so the device is out
 * without any denylist to keep. `deleteMany` with the user's id in the filter is what
 * makes it impossible to log out a session that is not yours — a wrong id simply
 * deletes nothing, and the response says which.
 *
 * Logging out the CURRENT session is allowed and is exactly what signing out does;
 * the client clears its stored token when it sees `current: true`.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const { id } = await context.params;

  const result = await prisma.session.deleteMany({
    where: { id, userId: user.sub },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "No such session." }, { status: 404 });
  }

  return NextResponse.json(
    { loggedOut: id, current: id === user.sid },
    { status: 200 },
  );
}
