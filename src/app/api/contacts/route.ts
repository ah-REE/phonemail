import { NextResponse } from "next/server";
import { z } from "zod";

import { recipientToken, lookupRecipientUsers } from "@/lib/alias";
import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { addressForPhone } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contacts - the owner's address book, one row per address per user.
 *
 * A contact is stored as an ADDRESS, not as a user id: the same person can be
 * reached as 9876543210@phonemail.com or through one of their aliases, and the
 * address is what the app already speaks everywhere else. `displayName` is the
 * name THIS user gave them, which is what overrides a raw number in the list and
 * the thread headers - the other account's own profile name is only the fallback.
 */

const ContactInput = z.object({
  // A number, a number@phonemail.com, or an alias - the same tokens the send
  // path accepts, resolved by the same rule, so the two cannot disagree.
  address: z.string().trim().min(3, "An address, a number or an alias is required").max(64),
  displayName: z.string().trim().max(40).optional(),
});

/** GET /api/contacts - mine, oldest first, with the live account name alongside. */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: user.sub },
    orderBy: { createdAt: "asc" },
  });

  // One resolution for every address, so each row can carry whose address it is:
  // the account's own display name (if it set one) and its canonical number.
  const resolved = await lookupRecipientUsers(contacts.map((contact) => recipientToken(contact.address)));
  const phonNumbers = [...new Set([...resolved.values()].map((entry) => entry.phoneNumber))];
  const accountNames = new Map(
    (
      await prisma.user.findMany({
        where: { phoneNumber: { in: phonNumbers } },
        select: { phoneNumber: true, displayName: true },
      })
    ).map((entry) => [entry.phoneNumber, entry.displayName]),
  );

  return NextResponse.json(
    {
      count: contacts.length,
      contacts: contacts.map((contact) => {
        const match = resolved.get(recipientToken(contact.address));
        return {
          id: contact.id,
          address: contact.address,
          displayName: contact.displayName,
          accountName: match ? accountNames.get(match.phoneNumber) ?? null : null,
          accountPhone: match?.phoneNumber ?? null,
          createdAt: contact.createdAt,
        };
      }),
    },
    { status: 200 },
  );
}

/** POST /api/contacts - add by mail id, resolved and validated. */
export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const parsed = ContactInput.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid contact." },
      { status: 400 },
    );
  }

  const token = recipientToken(parsed.data.address);
  const resolved = await lookupRecipientUsers([token]);
  const account = resolved.get(token);

  if (!account) {
    // Unknown is unknown: the same 404 an unknown recipient gets when sending.
    return NextResponse.json({ error: "No PhoneMail account answers to that." }, { status: 404 });
  }

  const address = addressForPhone(account.phoneNumber);
  const displayName = parsed.data.displayName?.trim() || null;
  const accountName =
    (await prisma.user.findUnique({ where: { id: account.id }, select: { displayName: true } }))
      ?.displayName ?? null;

  const contact = await prisma.contact.upsert({
    where: { userId_address: { userId: user.sub, address } },
    create: { userId: user.sub, address, displayName },
    update: { displayName },
  });

  return NextResponse.json(
    {
      contact: {
        id: contact.id,
        address: contact.address,
        displayName: contact.displayName,
        accountName,
        accountPhone: account.phoneNumber,
        createdAt: contact.createdAt,
      },
      // True when this was an update rather than a new row, so the screen can say
      // which happened instead of guessing.
      updated: contact.createdAt.getTime() < Date.now() - 1000,
    },
    { status: 201 },
  );
}
