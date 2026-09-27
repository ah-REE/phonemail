import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound SMTP submission.
 *
 * The app never talks to the public internet for mail: it hands the message to
 * our own SMTP service (the `smtp` Compose service, MAIL_DOMAIN=phonemail.com),
 * which then posts the parsed message back to /api/mail/inbound. That round
 * trip is the point — the Email row is only ever written by the inbound path.
 */

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);

/** Mail from/to addresses are always <phone>@<MAIL_DOMAIN>. */
export function mailDomain(): string {
  return process.env.MAIL_DOMAIN ?? "phonemail.com";
}

export function addressForPhone(phoneNumber: string): string {
  return `${phoneNumber}@${mailDomain()}`;
}

let transporter: Transporter | undefined;

/**
 * Lazy singleton transport. `ignoreTLS` is intentional: the SMTP service is
 * plain SMTP on the internal Compose network, and it does not advertise
 * STARTTLS, so letting nodemailer try to upgrade would fail.
 */
export function getTransport(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      ignoreTLS: true,
      tls: { rejectUnauthorized: false },
      // Local service: a short timeout keeps a broken SMTP container from
      // hanging the API call.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export interface OutboundEmail {
  from: string;
  /**
   * One recipient, or the full list of a group message. A list is submitted as
   * ONE message with every address in To - nodemailer takes an array natively -
   * so a group's member set travels intact to the inbound fan-out.
   */
  to: string | string[];
  subject: string;
  body: string;
  /**
   * The files that travel WITH the message (Day 8). They are passed to nodemailer
   * as real MIME parts, so they cross the same SMTP hop the body does and come back
   * through the inbound webhook - which is what keeps "the row is only written by
   * the inbound path" true for attachments too.
   */
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}

/** Submits a message to the SMTP service. Throws when submission fails. */
export async function submitOutboundEmail(message: OutboundEmail): Promise<void> {
  await getTransport().sendMail({
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.body,
    // Nodemailer builds the multipart/mixed message: a message with no files is
    // byte-for-byte what it was before this feature existed.
    attachments: (message.attachments ?? []).map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
}
