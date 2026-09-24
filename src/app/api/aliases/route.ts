import { NextResponse } from "next/server";
import { z } from "zod";

import {
  aliasAddress,
  localPartIsTaken,
  localPartProblem,
  recipientToken,
} from "@/lib/alias";
import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alias IDs (Day 6) - list and create. Removal is DELETE /api/aliases/[localPart].
 *
 * Every endpoint is owner-scoped: the JWT's `sub` is the only userId that is
 * ever read or written, so one account can neither see nor remove another's
 * aliases.
 */

const createSchema = z.object({
  localPart: z.string().trim().min(1, "localPart is required").max(64),
});

export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const aliases = await prisma.alias.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "asc" },
    select: { id: true, localPart: true, createdAt: true },
  });

  return NextResponse.json(
    {
      count: aliases.length,
      aliases: aliases.map((alias) => ({
        id: alias.id,
        localPart: alias.localPart,
        address: aliasAddress(alias.localPart),
        createdAt: alias.createdAt,
      })),
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const localPart = recipientToken(parsed.data.localPart);

  const problem = localPartProblem(localPart);
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  // The uniqueness rule that keeps addresses unambiguous: not another alias,
  // and not somebody's phone number.
  if (await localPartIsTaken(localPart)) {
    return NextResponse.json(
      { error: `"${localPart}" is already taken.` },
      { status: 400 },
    );
  }

  try {
    const alias = await prisma.alias.create({
      data: { userId: user.sub, localPart },
      select: { id: true, localPart: true, createdAt: true },
    });

    return NextResponse.json(
      { alias: { id: alias.id, localPart: alias.localPart, address: aliasAddress(alias.localPart), createdAt: alias.createdAt } },
      { status: 201 },
    );
  } catch (error) {
    // The check above is a friendly pre-check, not a lock: a concurrent create
    // can still lose the unique index race. Same answer either way.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: `"${localPart}" is already taken.` }, { status: 400 });
    }
    console.error("[aliases] create failed", error);
    return NextResponse.json({ error: "Could not create the alias." }, { status: 500 });
  }
}
