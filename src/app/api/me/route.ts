import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { DISPLAY_NAME_MAX, displayNameProblem } from "@/lib/names";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me - the signed-in user's profile.
 * PATCH /api/me - set or clear the display name, and flip the new-mail SMS switch.
 * DELETE /api/me/delete - close the account (see that route).
 *
 * The JWT's `sub` is the only user this route can ever read or write, so it needs
 * no ownership check: an absent/invalid token is a 401 and nothing else.
 *
 * The response carries `hasAvatar`, derived from avatarUpdatedAt. NOTE: no route
 * serves those avatar columns and nothing writes them - they are unused scaffolding.
 * Every account shows the shared default mark (src/components/avatar.tsx). This is
 * recorded as a partial in the README's spec mapping.
 */

const patchSchema = z
  .object({
    displayName: z.union([z.string().max(DISPLAY_NAME_MAX * 4), z.null()]).optional(),
    // The owner's switch for the "you have new mail" SMS. A partial update is the
    // point: flipping the switch must not require re-sending the name.
    smsNotifications: z.boolean().optional(),
  })
  .refine((value) => value.displayName !== undefined || value.smsNotifications !== undefined, {
    message: "Nothing to update.",
  });

export async function GET(request: Request) {
  const user = await requireUser(request);
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
      smsNotifications: true,
      // ROUND 22: whether the app PIN is set. The client needs the FLAG to decide
      // whether to draw the lock screen - never the hash.
      pinHash: true,
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
        smsNotifications: profile.smsNotifications,
        hasPin: Boolean(profile.pinHash),
      },
    },
    { status: 200 },
  );
}

export async function PATCH(request: Request) {
  const user = await requireUser(request);
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

  const data: { displayName?: string | null; smsNotifications?: boolean } = {};

  // null clears the name; a string is trimmed and validated.
  if (parsed.data.displayName !== undefined) {
    if (parsed.data.displayName === null) {
      data.displayName = null;
    } else {
      const problem = displayNameProblem(parsed.data.displayName);
      if (problem) {
        return NextResponse.json({ error: problem }, { status: 400 });
      }
      data.displayName = parsed.data.displayName.trim();
    }
  }

  if (parsed.data.smsNotifications !== undefined) {
    data.smsNotifications = parsed.data.smsNotifications;
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data,
    select: { id: true, phoneNumber: true, displayName: true, smsNotifications: true },
  });

  return NextResponse.json(
    {
      user: {
        id: updated.id,
        phoneNumber: updated.phoneNumber,
        displayName: updated.displayName,
        smsNotifications: updated.smsNotifications,
      },
    },
    { status: 200 },
  );
}
