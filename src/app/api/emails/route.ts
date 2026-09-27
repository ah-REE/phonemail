import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, UNAUTHORIZED_BODY } from "@/lib/auth";
import { classifyToken, lookupRecipientUsers, recipientToken } from "@/lib/alias";
import { validateAttachmentSet } from "@/lib/attachments";
import { EMAIL_FOLDERS, isEmailFolder } from "@/lib/folders";
import { addressForPhone, submitOutboundEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { rememberSubmission, submissionKey } from "@/lib/submissions";
import { deriveThreadKey, isGroupThreadKey } from "@/lib/threadKey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound mail.
 *
 * POST deliberately does NOT write an Email row: it only submits the message to
 * our SMTP service. The row is created when the SMTP service posts the message
 * back to /api/mail/inbound, so a bug in SMTP delivery cannot silently produce a
 * "sent" email that nobody received.
 *
 * Day 6 (group chat): `to` accepts a LIST - an array and/or a comma-separated
 * string - and the whole list travels in ONE SMTP submission (nodemailer takes
 * `to: [array]` natively). The per-recipient fan-out happens once, in the inbound
 * path, so there is no loop here and no chance of half a group receiving it.
 * Day 9 (CC): `cc` is accepted and resolved exactly like `to`, and its addresses
 * are folded into the SAME recipient set - so a two-recipient message formed through
 * To+Cc is the same group a two-recipient To list forms, and the SMTP message
 * carries the Cc header as well.
 *
 * The response carries the DERIVED threadKey of the member set so the client can
 * open the group thread it just created without computing anything itself.
 *
 * Day 8 (attachments): a message may carry up to three files (5MB each, 10MB per
 * message). They are submitted as real MIME parts on the ONE SMTP message, so they
 * take the same round trip as the body and are stored by the inbound path alone.
 *
 * Replying (optional `replyToId`) is enforced here as reply-ONCE: the original
 * message is claimed with a conditional update, so a second reply cannot be
 * recorded even if two requests race. The claim is rolled back if SMTP refuses
 * the submission, so a failed send does not burn the reply.
 */

const INBOX_LIMIT = 50;

const sendSchema = z.object({
  to: z.union([
    z.string().trim().min(1, "to is required"),
    z.array(z.string().trim().min(1)).min(1, "to is required"),
  ]),
  /**
   * Day 9: CC, in the same shapes `to` accepts (a string or a list) and through the
   * SAME resolution - a 10-digit number or an alias. CC recipients are recipients:
   * they receive fan-out rows exactly as the To list does, and the MIME message
   * carries them in Cc for the hop.
   */
  cc: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
    .optional(),
  subject: z.string().trim().min(1, "subject is required").max(200).optional(),
  body: z.string().min(1, "body is required"),
  replyToId: z.string().trim().min(1).optional(),
  /// Present only for a REPLY INSIDE A GROUP. A member's reply is addressed to the
  /// one member whose mail it answers, so deriving the thread from its recipients
  /// would file it in their 1:1 chat; the client names the thread instead, and it
  /// is validated below.
  threadKey: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  // ROUND 7 (attachments): this endpoint takes multipart/form-data as well as JSON,
  // so a message with files is ONE submission - the files ride the SMTP hop and
  // come back through the inbound webhook exactly like the body does.
  const contentTypeHeader = request.headers.get("content-type") ?? "";
  let body: unknown;
  let files: File[] = [];

  if (contentTypeHeader.startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Request body must be valid form data." }, { status: 400 });
    }
    const toEntries = form
      .getAll("to")
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
    body = {
      to: toEntries.length > 1 ? toEntries : toEntries[0],
      subject: form.get("subject") ?? undefined,
      body: form.get("body") ?? undefined,
      replyToId: form.get("replyToId") ?? undefined,
      threadKey: form.get("threadKey") ?? undefined,
    };
    files = form
      .getAll("attachments")
      .filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);
  } else {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
  }

  // Hard limits, checked here as well as in the browser: a client is a convenience,
  // never the guard.
  const attachmentProblem = validateAttachmentSet(
    files.map((file) => ({ filename: file.name, sizeBytes: file.size })),
  );
  if (attachmentProblem) {
    return NextResponse.json({ error: attachmentProblem }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  // One list, whatever shape it arrived in, with duplicates collapsed. An entry
  // may be a 10-digit number OR an alias local part (Day 6); both go through the
  // same lookup the inbound path uses, so the two paths cannot drift apart.
  const rawRecipients = (Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to]).flatMap(
    (entry) => entry.split(","),
  );

  const tokens = [...new Set(rawRecipients.map(recipientToken).filter((token) => token.length > 0))];

  if (tokens.length === 0) {
    return NextResponse.json({ error: "`to` must name at least one recipient." }, { status: 400 });
  }

  const rejected = tokens.filter((token) => classifyToken(token) === "invalid");
  if (rejected.length > 0) {
    return NextResponse.json(
      {
        error:
          "`to` must be 10-digit Indian mobile numbers, or aliases of 3-20 lowercase letters, digits and dots.",
        invalid: rejected,
      },
      { status: 400 },
    );
  }

  const resolved = await lookupRecipientUsers(tokens);

  // An unknown alias is an unknown recipient: same 404, same wording.
  const unknown = tokens.filter((token) => !resolved.has(token));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Recipient not found: ${unknown.join(", ")}.` },
      { status: 404 },
    );
  }

  const recipients = tokens.map((token) => resolved.get(token) as { id: string; phoneNumber: string; registeredVia: string });

  // CC resolves through the SAME lookups as To, so an alias in Cc behaves exactly
  // like an alias in To - including the "unknown alias is an unknown recipient" 404.
  // An address already in To is dropped from Cc rather than written twice.
  const rawCc = (parsed.data.cc === undefined
    ? []
    : Array.isArray(parsed.data.cc)
      ? parsed.data.cc
      : [parsed.data.cc]
  ).flatMap((entry) => entry.split(","));
  const ccTokens = [...new Set(rawCc.map(recipientToken).filter((token) => token.length > 0))].filter(
    (token) => !tokens.includes(token),
  );

  const rejectedCc = ccTokens.filter((token) => classifyToken(token) === "invalid");
  if (rejectedCc.length > 0) {
    return NextResponse.json(
      {
        error:
          "`cc` must be 10-digit Indian mobile numbers, or aliases of 3-20 lowercase letters, digits and dots.",
        invalid: rejectedCc,
      },
      { status: 400 },
    );
  }

  const resolvedCc = await lookupRecipientUsers(ccTokens);
  const unknownCc = ccTokens.filter((token) => !resolvedCc.has(token));
  if (unknownCc.length > 0) {
    return NextResponse.json(
      { error: `Recipient not found: ${unknownCc.join(", ")}.` },
      { status: 404 },
    );
  }

  const ccRecipients = ccTokens.map((token) => resolvedCc.get(token) as { id: string; phoneNumber: string; registeredVia: string });
  // EVERYONE the message reaches, in one list: the fan-out and the group key work
  // from this, which is what makes "two or more recipients is the group" true whether
  // the second address arrived in To or in Cc.
  const allRecipients = [...recipients, ...ccRecipients];

  // A GROUP REPLY names its thread, and this is the first thing checked: the
  // caller must be a member of that thread, the
  // row being answered must be IN it, and the reply must be addressed to the
  // member who wrote that row - never to the group at large, which would be a
  // broadcast wearing a reply's thread key.
  //
  // It runs BEFORE the reply-once claim below, deliberately: the claim is a
  // mutation, so rejecting a reply after taking it would burn the sender's one
  // reply to that mail instead of just refusing the request.
  let groupThreadKey: string | null = null;
  if (parsed.data.threadKey) {
    groupThreadKey = parsed.data.threadKey;
    if (!isGroupThreadKey(groupThreadKey)) {
      return NextResponse.json({ error: "Invalid thread key." }, { status: 400 });
    }
    if (!parsed.data.replyToId) {
      return NextResponse.json(
        { error: "A reply inside a group must answer a message." },
        { status: 400 },
      );
    }

    const rows = await prisma.email.findMany({
      where: { threadKey: groupThreadKey },
      select: { id: true, fromUserId: true, toUserId: true },
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: "No such conversation." }, { status: 404 });
    }
    if (!rows.some((row) => row.fromUserId === user.sub || row.toUserId === user.sub)) {
      return NextResponse.json(
        { error: "You are not a member of this conversation." },
        { status: 403 },
      );
    }

    const answered = rows.find((row) => row.id === parsed.data.replyToId);
    if (!answered) {
      return NextResponse.json(
        { error: "That message is not part of this conversation." },
        { status: 404 },
      );
    }
    if (recipients.length !== 1 || recipients[0].id !== answered.fromUserId) {
      return NextResponse.json(
        { error: "A reply goes to the member who wrote that mail." },
        { status: 400 },
      );
    }
  }

  // Reply-once: claim the original message atomically before sending anything.
  let claimedReplyTo: string | null = null;
  let subject = parsed.data.subject?.trim() ?? "";

  if (parsed.data.replyToId) {
    const original = await prisma.email.findUnique({
      where: { id: parsed.data.replyToId },
      select: { id: true, toUserId: true, subject: true, repliedAt: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Original message not found." }, { status: 404 });
    }
    if (original.toUserId !== user.sub) {
      return NextResponse.json(
        { error: "Only the recipient of a message can reply to it." },
        { status: 403 },
      );
    }
    if (original.repliedAt) {
      return NextResponse.json(
        { error: "You have already replied to this message." },
        { status: 409 },
      );
    }

    const claim = await prisma.email.updateMany({
      where: { id: parsed.data.replyToId, toUserId: user.sub, repliedAt: null },
      data: { repliedAt: new Date() },
    });

    if (claim.count === 0) {
      // Lost the race with a concurrent reply.
      return NextResponse.json(
        { error: "You have already replied to this message." },
        { status: 409 },
      );
    }

    claimedReplyTo = parsed.data.replyToId;
    if (!subject) {
      subject = original.subject.toLowerCase().startsWith("re:")
        ? original.subject
        : `re: ${original.subject}`;
    }
  }

  if (!subject) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }

  const fromAddress = addressForPhone(user.phoneNumber);
  // The stored address is always the canonical number address: an alias is a
  // way in, not a second identity in the message data.
  const addresses = allRecipients.map((recipient) => addressForPhone(recipient.phoneNumber));
  const ccAddresses = ccRecipients.map((recipient) => addressForPhone(recipient.phoneNumber));
  // ROUND 9: WHICH LIST EACH RECIPIENT CAME FROM, as data rather than as a header.
  // The recipient set is the To and Cc lists merged (cc recipients are
  // recipients), so the merge has to be undone for the row stamp: To first, then
  // Cc for anyone the To list did not already carry - a member in both lists is
  // addressed directly, and direct addressing is the stronger fact.
  const toAddresses = recipients.map((recipient) => addressForPhone(recipient.phoneNumber));
  const roles: Record<string, "to" | "cc"> = {};
  for (const address of toAddresses) {
    roles[address] = "to";
  }
  for (const address of ccAddresses) {
    if (!(address in roles)) {
      roles[address] = "cc";
    }
  }

  // Leave the note the inbound path will pick up. Without it a group reply would
  // be filed pairwise and a reply would carry no link to what it answers.
  //
  // ROUND 9: the note is also left for a plain group send, not only for a reply.
  // The role tags are derived from the founding mail's rows, so the founding send
  // is exactly the message whose roles have to be recorded.
  if (claimedReplyTo || groupThreadKey || addresses.length > 1 || ccAddresses.length > 0) {
    await rememberSubmission(submissionKey(fromAddress, subject, addresses), {
      threadKey: groupThreadKey,
      replyToId: claimedReplyTo,
      roles,
    });
  }

  const attachmentPayload = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      content: Buffer.from(await file.arrayBuffer()),
    })),
  );

  try {
    await submitOutboundEmail({
      from: fromAddress,
      // ONE submission, the full recipient list in To.
      to: addresses,
      cc: ccAddresses,
      subject,
      body: parsed.data.body,
      attachments: attachmentPayload,
    });
  } catch (error) {
    console.error("[emails] SMTP submission failed", error);
    if (claimedReplyTo) {
      // Do not burn the reply when the send never happened.
      await prisma.email
        .update({ where: { id: claimedReplyTo }, data: { repliedAt: null } })
        .catch(() => undefined);
    }
    return NextResponse.json(
      { error: "Could not hand the message to the mail service. Please try again." },
      { status: 502 },
    );
  }

  // The same derivation the inbound path will use, so the client can open the
  // thread immediately. A hint, not stored state: nothing is written here.
  // THE GROUP TEST COUNTS EVERYONE, To and Cc together - that is what makes "two
  // or more recipients is a group" true whatever field the second address arrived
  // in. (It counted only To at first, so A to=[B] cc=[C] produced no thread key and
  // the Cc recipient's row was filed as a 1:1 with the sender.)
  const threadKey =
    allRecipients.length > 1
      ? deriveThreadKey([user.phoneNumber, ...allRecipients.map((recipient) => recipient.phoneNumber)])
      : null;

  // No Email row here on purpose - see the file header.
  return NextResponse.json(
    {
      queued: true,
      from: fromAddress,
      to: addresses,
      cc: ccAddresses,
      threadKey,
      subject,
      replyToId: claimedReplyTo,
      attachments: attachmentPayload.length,
      message: "Message submitted to the mail service.",
    },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(UNAUTHORIZED_BODY, { status: 401 });
  }

  // Day 6 folders: the same list, one folder at a time. It defaults to the
  // inbox, so every caller that predates folders keeps its exact behaviour.
  const requestedFolder = new URL(request.url).searchParams.get("folder") ?? "inbox";
  if (!isEmailFolder(requestedFolder)) {
    return NextResponse.json(
      { error: "Unknown folder.", allowedFolders: EMAIL_FOLDERS },
      { status: 400 },
    );
  }

  const emails = await prisma.email.findMany({
    where: { toUserId: user.sub, folder: requestedFolder },
    orderBy: { createdAt: "desc" },
    take: INBOX_LIMIT,
    select: {
      id: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
      repliedAt: true,
      tag: true,
      folder: true,
    },
  });

  return NextResponse.json(
    {
      folder: requestedFolder,
      count: emails.length,
      emails: emails.map((email) => ({
        id: email.id,
        from: email.fromAddress,
        to: email.toAddress,
        subject: email.subject,
        body: email.body,
        isRead: email.isRead,
        createdAt: email.createdAt,
        repliedAt: email.repliedAt,
        tag: email.tag,
        folder: email.folder,
      })),
    },
    { status: 200 },
  );
}
