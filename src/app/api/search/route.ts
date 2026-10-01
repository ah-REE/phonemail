import { NextResponse } from "next/server";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { contactNamesByPhone } from "@/lib/contacts";
import { prisma } from "@/lib/prisma";
import {
  countMatches,
  isSearchable,
  MIN_SEARCH_LENGTH,
  SEARCH_SCAN_LIMIT,
  SEARCH_THREAD_LIMIT,
  snippetAround,
} from "@/lib/search";
import { groupRowVisibleToViewer } from "@/lib/group-visibility";
import { answeredSubject } from "@/lib/group-visibility";
import { phoneOf } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=... - full-text search over the mail this caller may see.
 *
 * TWO THINGS MAKE THIS CORRECT RATHER THAN CLEVER:
 *
 * 1. THE VISIBILITY PREDICATE IS THE CONVERSATIONS ONE, verbatim. Content search
 *    is the classic place a per-viewer rule quietly leaks, because the query is
 *    written for the content rather than for the viewer:
 *      - my own sent rows are mine to see (unless I deleted my side);
 *      - mail addressed to me is mine to see (unless I deleted my side) - the
 *        folder is not consulted, because the folders are the viewer's own filing
 *        and every row stays reachable through one of them;
 *      - another member's BROADCAST (replyToId null) is the group's shared history;
 *      - another member's REPLY is visible to nobody but its sender and its
 *        recipient, so a third member's search must not find it. That is the same
 *        three-branch OR the group thread endpoint uses, and it is why a group
 *        reply is searchable by exactly two people.
 *
 * 2. RESULTS ARE THREADS, not rows. A search for a word that appears in one
 *    broadcast would otherwise return one hit per recipient, which is the same
 *    message listed repeatedly. Grouping is by the derived thread key for group
 *    mail and by the counterpart for pairwise mail - the same identities the chat
 *    list uses, so a result taps through to the list's own thread.
 *
 * A query shorter than MIN_SEARCH_LENGTH is not an error: it returns an empty,
 * explained payload, because the client is typing and a 400 mid-keystroke would
 * have to be special-cased on both clients.
 */
export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (!isSearchable(query)) {
    return NextResponse.json(
      {
        query,
        minLength: MIN_SEARCH_LENGTH,
        scanLimit: SEARCH_SCAN_LIMIT,
        threadLimit: SEARCH_THREAD_LIMIT,
        threads: [],
        message:
          query.length === 0
            ? "Type at least three characters to search your mail."
            : `Type at least ${MIN_SEARCH_LENGTH} characters to search your mail.`,
      },
      { status: 200 },
    );
  }

  /**
   * THE CALLER'S OWN GROUP KEYS, first.
   *
   * The third visibility branch below is the group endpoint's "another member's
   * broadcast is the group's shared history" - and in the thread endpoint it is
   * safe because the rows are already scoped to one threadKey. Unscoped it would
   * read as "any row that is not a reply belongs to everyone", which is a leak
   * this suite's negative control caught: an unrelated account found another pair's
   * mail. So membership is derived here, exactly as the chat list derives it -
   * from keys that appear on the caller's OWN visible rows.
   */
  const ownKeys = await prisma.email.findMany({
    where: {
      threadKey: { not: null },
      OR: [
        { fromUserId: user.sub, deletedForSender: false },
        { toUserId: user.sub, deletedForRecipient: false },
      ],
    },
    select: { threadKey: true },
    distinct: ["threadKey"],
  });
  const myGroupKeys = ownKeys
    .map((row) => row.threadKey)
    .filter((key): key is string => typeof key === "string" && key.length > 0);

  const rows = await prisma.email.findMany({
    where: {
      AND: [
        {
          OR: [
            { subject: { contains: query, mode: "insensitive" } },
            { body: { contains: query, mode: "insensitive" } },
          ],
        },
        // THE PER-VIEWER RULE - the group thread endpoint's three branches, with
        // the third scoped to the threads this caller is actually in, which is what
        // keeps a member's private reply out of a third member's results AND keeps
        // every group the caller is not in out of them entirely.
        {
          OR: [
            { fromUserId: user.sub, deletedForSender: false },
            { toUserId: user.sub, deletedForRecipient: false },
            {
              replyToId: null,
              toUserId: { not: user.sub },
              deletedForSender: false,
              threadKey: { in: myGroupKeys },
            },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: SEARCH_SCAN_LIMIT,
    select: {
      fromUserId: true,
      toUserId: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      createdAt: true,
      threadKey: true,
      replyToId: true,
      submissionId: true,
    },
  });

  // ROUND 34: the thread endpoint's privacy sieve, applied here too (search
  // spans threads, so it post-filters): a group row with replyToId null that is
  // not MY row must belong to a real fan-out (a broadcast) - a lone null row is
  // the shape the old fan-out left behind, invisible to everyone but its sender.
  const candidateSubmissions = rows
    .filter((row) => row.threadKey && row.replyToId === null && row.fromUserId !== user.sub)
    .map((row) => row.submissionId)
    .filter((value): value is string => Boolean(value));
  const fanOutRows = candidateSubmissions.length
    ? await prisma.email.groupBy({
        by: ["submissionId"],
        where: { submissionId: { in: candidateSubmissions } },
        _count: { _all: true },
      })
    : [];
  const fanOut = new Set(
    fanOutRows
      .filter((entry) => (entry._count?._all ?? 0) >= 2 && entry.submissionId)
      .map((entry) => entry.submissionId as string),
  );
  const visibleRows = rows.filter((row) => {
    if (!row.threadKey) {
      return true; // pairwise rows already obey the endpoint's two branches
    }
    return groupRowVisibleToViewer(
      { fromUserId: row.fromUserId, toUserId: row.toUserId, replyToId: row.replyToId, submissionId: row.submissionId, subject: row.subject },
      user.sub,
      fanOut,
    );
  });

  interface Hit {
    kind: "pair" | "group";
    key: string;
    label: string;
    members: string[];
    subject: string;
    snippet: string;
    matches: number;
    at: Date;
    href: string;
  }

  const groups = new Map<string, Hit>();
  const groupMembers = new Map<string, Set<string>>();
  const counterparts = new Map<string, string>();

  for (const row of visibleRows) {
    const isGroup = Boolean(row.threadKey);
    const other = row.fromUserId === user.sub ? row.toAddress : row.fromAddress;
    const identity = isGroup ? `group:${row.threadKey}` : `pair:${phoneOf(other)}`;

    if (isGroup) {
      const members = groupMembers.get(row.threadKey as string) ?? new Set<string>();
      members.add(phoneOf(row.fromAddress));
      members.add(phoneOf(row.toAddress));
      groupMembers.set(row.threadKey as string, members);
    } else {
      counterparts.set(identity, phoneOf(other));
    }

    const bodyMatches = countMatches(row.body, query);
    const subjectMatches = countMatches(row.subject, query);
    const existing = groups.get(identity);
    const matches = bodyMatches + subjectMatches;

    if (!existing) {
      // Rows arrive newest first, so the first row seen for a thread is the one
      // whose time the result is sorted by; the snippet still prefers a BODY hit,
      // because a body hit is what "search" usually means.
      groups.set(identity, {
        kind: isGroup ? "group" : "pair",
        key: isGroup ? (row.threadKey as string) : (counterparts.get(identity) as string),
        label: "",
        members: [],
        subject: row.subject,
        snippet: bodyMatches > 0 ? snippetAround(row.body, query) : snippetAround(row.subject, query),
        matches,
        at: row.createdAt,
        href: isGroup
          ? `/thread/group/${encodeURIComponent(row.threadKey as string)}`
          : `/thread/${phoneOf(other)}`,
      });
    } else {
      existing.matches += matches;
    }
  }

  // Labels: the contact name the viewer already chose, else the address, else the
  // member list for a group.
  const contactNames = await contactNamesByPhone(user.sub);
  const phones = [...new Set([...counterparts.values(), ...[...groupMembers.values()].flatMap((set) => [...set])])];
  const users = phones.length
    ? await prisma.user.findMany({
        where: { phoneNumber: { in: phones } },
        select: { phoneNumber: true, displayName: true },
      })
    : [];
  const profileNames = new Map(users.map((entry) => [entry.phoneNumber, entry.displayName]));
  const nameFor = (phone: string) => contactNames.get(phone) ?? profileNames.get(phone) ?? null;

  const threads = [...groups.entries()]
    .map(([identity, hit]) => {
      if (hit.kind === "group") {
        const threadKey = hit.key;
        const members = [...(groupMembers.get(threadKey) ?? new Set<string>())].sort();
        const named = members.filter((member) => member !== user.phoneNumber);
        return {
          ...hit,
          label: (named.length > 0 ? named : members).map((member) => nameFor(member) ?? member).join(", "),
          members,
        };
      }
      return { ...hit, label: nameFor(hit.key) ?? hit.key, members: [hit.key] };
    })
    .sort((left, right) => right.at.getTime() - left.at.getTime())
    .slice(0, SEARCH_THREAD_LIMIT);

  return NextResponse.json(
    {
      query,
      minLength: MIN_SEARCH_LENGTH,
      scanLimit: SEARCH_SCAN_LIMIT,
      threadLimit: SEARCH_THREAD_LIMIT,
      total: threads.length,
      threads: threads.map((thread) => ({
        kind: thread.kind,
        key: thread.key,
        label: thread.label,
        members: thread.members,
        subject: thread.subject,
        snippet: thread.snippet,
        matches: thread.matches,
        at: thread.at,
        href: thread.href,
      })),
    },
    { status: 200 },
  );
}
