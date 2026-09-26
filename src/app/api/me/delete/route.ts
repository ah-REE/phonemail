import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { verifyOtp } from "@/lib/otp";
import { otpSchema } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/me - close the account.
 *
 * TWO things must be true and neither is optional: the caller holds a valid
 * session, AND they can produce a live one-time code for their own number. The
 * code is checked by the same verifyOtp the login path uses, so it is single-use,
 * attempt-limited and dies on the same 5-minute TTL; obtaining it is rate-limited
 * by /api/auth/send-otp, which owns the 60s cooldown. A session alone is not
 * enough to destroy a mailbox - a borrowed phone in an unlocked tab must not be
 * able to delete someone else's account.
 *
 * Deletion is EXPLICIT, in foreign-key order, in one transaction. Email rows
 * reference User twice (sender and recipient) and those two relations declare no
 * onDelete rule of their own, so the rows must go first; contacts and aliases
 * cascade from the user but are removed explicitly here so the counts can be
 * reported back and the outcome is identical on any database.
 *
 * The response says exactly what was removed. A delete that cannot say what it
 * deleted is a delete nobody can verify.
 */

const deleteSchema = z.object({
  otp: otpSchema,
});

export async function DELETE(request: Request) {
  const user = requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A one-time code is required to delete an account." },
      { status: 400 },
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, phoneNumber: true },
  });

  if (!account) {
    return NextResponse.json({ error: "No such account." }, { status: 404 });
  }

  let verified: Awaited<ReturnType<typeof verifyOtp>>;
  try {
    verified = await verifyOtp(account.phoneNumber, parsed.data.otp);
  } catch (error) {
    console.error("[me/delete] Redis failure", error);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!verified.ok) {
    if (verified.reason === "locked") {
      return NextResponse.json(
        { error: "Too many incorrect attempts. Request a new code." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      {
        error: verified.reason === "missing" ? "That code has expired. Request a new one." : "That code is not right.",
        attemptsLeft: verified.attemptsLeft,
      },
      { status: 400 },
    );
  }

  const [emails, aliases, contacts] = await prisma.$transaction([
    prisma.email.deleteMany({ where: { OR: [{ fromUserId: account.id }, { toUserId: account.id }] } }),
    prisma.alias.deleteMany({ where: { userId: account.id } }),
    prisma.contact.deleteMany({ where: { userId: account.id } }),
    prisma.user.delete({ where: { id: account.id } }),
  ]);

  return NextResponse.json(
    {
      deleted: true,
      removed: {
        emails: emails.count,
        aliases: aliases.count,
        contacts: contacts.count,
      },
    },
    { status: 200 },
  );
}
