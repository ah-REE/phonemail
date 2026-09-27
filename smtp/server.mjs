// PhoneMail SMTP service.
//
// Self-hosted SMTP on the internal Compose network. It accepts messages for the
// local mail domain (MAIL_DOMAIN), refuses to relay anywhere else, parses each
// accepted message, and hands envelope + body to the app's inbound webhook.
// Nothing is stored here: the app owns persistence, so the SMTP hop stays a
// real, observable round trip.
//
// See smtp/README.md for why this is a small Node server rather than Haraka.
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const PORT = Number(process.env.SMTP_PORT ?? 25);
const MAIL_DOMAIN = (process.env.MAIL_DOMAIN ?? "phonemail.com").toLowerCase();
const INBOUND_URL = process.env.APP_INBOUND_URL ?? "http://app:3000/api/mail/inbound";
const WEBHOOK_SECRET = process.env.MAIL_WEBHOOK_SECRET;
// The hop's own ceiling, DERIVED from the app's limits rather than guessed.
//
// The app allows 20MB per file and 40MB per message of RAW bytes. Those bytes ride
// this hop as base64 MIME parts, which costs about 4/3 of the raw size, plus the
// MIME framing for each part: 40MB x ~1.37 is about 55MB... which is why the app's
// per-message cap, not the per-file cap, is the number that matters here. 20MB
// SINGLE file: 20 x 1.37 = ~27.4MB, comfortably inside 30MB. Two 20MB files (40MB
// total, the app's legal maximum): 40 x 1.37 = ~54.8MB, so THIS ceiling has to sit
// above that too - 60MB - or a legal two-file message would be refused by the
// transport instead of by the rule.
const MAX_MESSAGE_BYTES = 60 * 1024 * 1024;
const DELIVERY_ATTEMPTS = 5;
const DELIVERY_DELAY_MS = 2000;

if (!WEBHOOK_SECRET) {
  console.error("[smtp] MAIL_WEBHOOK_SECRET is not set; refusing to start");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deliverToApp(message) {
  let lastError;
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(INBOUND_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mail-secret": WEBHOOK_SECRET,
        },
        body: JSON.stringify(message),
      });

      const text = await response.text();

      if (response.ok) {
        console.log(
          `[smtp] delivered to app: to=${message.to} status=${response.status} body=${text.slice(0, 200)}`,
        );
        return;
      }

      lastError = new Error(`app responded ${response.status}: ${text.slice(0, 200)}`);
      // 4xx (except 429) will not get better by retrying.
      if (response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < DELIVERY_ATTEMPTS) {
      console.log(`[smtp] delivery attempt ${attempt} failed (${lastError.message}); retrying`);
      await sleep(DELIVERY_DELAY_MS);
    }
  }

  throw lastError ?? new Error("delivery failed");
}

const server = new SMTPServer({
  // Internal service: the app submits without credentials.
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: MAX_MESSAGE_BYTES,
  logger: false,

  onRcptTo(address, _session, callback) {
    const recipient = address.address.toLowerCase();
    if (!recipient.endsWith(`@${MAIL_DOMAIN}`)) {
      // No external relay: this service is only a local delivery agent.
      return callback(new Error(`Relay denied: only @${MAIL_DOMAIN} is served here`));
    }
    callback();
  },

  async onData(stream, session, callback) {
    try {
      const parsed = await simpleParser(stream);

      const from = session.envelope.mailFrom?.address ?? parsed.from?.text ?? "";
      const recipients = (session.envelope.rcptTo ?? []).map((r) => r.address);
      const subject = parsed.subject ?? "(no subject)";
      const body = (parsed.text ?? "").trim();

      // Attachments arrive as MIME parts. The APP owns their limits and their
      // storage, so this service only hands the bytes on - base64, because the
      // webhook speaks JSON. A message with no files produces an empty array and
      // therefore an unchanged payload.
      const attachments = (parsed.attachments ?? []).map((file) => ({
        filename: file.filename ?? "attachment",
        contentType: file.contentType ?? "application/octet-stream",
        sizeBytes: file.size ?? (Buffer.isBuffer(file.content) ? file.content.length : 0),
        contentBase64: Buffer.from(file.content ?? "").toString("base64"),
      }));

      console.log(
        `[smtp] accepted from=<${from}> to=<${recipients.join(",")}> subject="${subject}" attachments=${attachments.length}`,
      );

      if (recipients.length === 0) {
        return callback(new Error("No recipients"));
      }

      if (!from) {
        return callback(new Error("No sender"));
      }

      // ONE webhook call carrying the FULL recipient list: the app writes one
      // row per recipient and derives the group thread key from the member set.
      // Looping here would produce N independent single-recipient messages and
      // the app could no longer tell a group send from separate sends.
      await deliverToApp({ from, to: recipients, subject, body, attachments });

      callback();
    } catch (error) {
      console.error("[smtp] delivery failed:", error.message);
      callback(new Error("Message could not be delivered"));
    }
  },
});

server.on("error", (error) => {
  console.error("[smtp] server error:", error.message);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[smtp] listening on 0.0.0.0:${PORT} | local domain=${MAIL_DOMAIN} | inbound=${INBOUND_URL}`,
  );
});
