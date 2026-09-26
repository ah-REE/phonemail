import { prisma } from "@/lib/prisma";
import { phoneOf } from "@/lib/threadKey";

/**
 * Contact names, resolved for the surfaces that show a person.
 *
 * A contact is stored as an ADDRESS (see /api/contacts), and an address is just
 * "<number>@phonemail.com", so contacts are keyed here by NUMBER - which is what
 * every thread payload already carries (`counterpart`, `members`, `fromAddress`).
 *
 * A contact with no name of its own is deliberately NOT in the map: the whole
 * point of the map is to OVERRIDE a raw number with a name, and an unnamed
 * contact has nothing to override with.
 *
 * Precedence, everywhere this is applied: the name YOU gave a person beats the
 * name they chose for themselves, which beats the raw number. That ordering is
 * the user's own address book winning over someone else's profile, which is how
 * every mail client behaves.
 */
export async function contactNamesByPhone(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.contact.findMany({
    where: { userId, displayName: { not: null } },
    select: { address: true, displayName: true },
  });

  const names = new Map<string, string>();

  for (const row of rows) {
    const name = row.displayName?.trim();
    if (name) {
      names.set(phoneOf(row.address), name);
    }
  }

  return names;
}
