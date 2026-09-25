import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { DISPLAY_NAME_MAX, displayNameProblem } from "@/lib/names";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me - the signed-in user's profile.
 * PATCH /api/me - set or clear the display name.
 *
 * The JWT's `sub` is the only user this route can ever read or write, so it needs
 * no ownership check: an absent/invalid token is a 401 and nothing else.
 *
 * The response carries `hasAvatar` rather than the bytes: the picture itself is
 * served by /api/me/avatar so it can be cached as an image.
 */

const patchSchema = z.object({
  displayName: z.union([z.string().max(DISPLAY_NAME_MAX * 4), z.null()]),
});

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      id: true,
      phoneNumber: true,
      displayName: true,
      createdAt: true,
      avatarUpdatedAt: true,
    },
  });

  if (!profile) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  return NextResponse.json(
    {
      user: {
        id: profile.id,
        phoneNumber: profile.phoneNumber,
        displayName: profile.displayName,
        createdAt: profile.createdAt,
        hasAvatar: Boolean(profile.avatarUpdatedAt),
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  // null clears the name; a string is trimmed and validated.
  let nextValue: string | null;
  if (parsed.data.displayName === null) {
    nextValue = null;
  } else {
    const problem = displayNameProblem(parsed.data.displayName);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
    nextValue = parsed.data.displayName.trim();
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: { displayName: nextValue },
    select: { id: true, phoneNumber: true, displayName: true },
  });

  return NextResponse.json(
    {
      user: {
        id: updated.id,
        phoneNumber: updated.phoneNumber,
        displayName: updated.displayName,
      },
    },
    { status: 200 },
  );
}
