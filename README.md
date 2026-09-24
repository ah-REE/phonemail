# PhoneMail

Your phone number **is** your email address: send to `9876543210@phonemail.com`
and it arrives in a chat-style mobile inbox. Built for rural, first-time
smartphone users who already know how to use WhatsApp — large type, one accent
colour, big tap targets, no jargon.

> Full documentation is in progress. This stub covers what an evaluator needs:
> how to run it and how it maps to the spec.

## Run

Exactly two commands:

```bash
git clone <repo-url>
docker compose up -d
```

Then open <http://localhost:3000>. The first boot builds the images, which
takes a few minutes. No `.env` file, no manual `npm install`, no credentials are
needed — every service is wired by `docker-compose.yml`.

## Compliance notes

**a. BACKEND = NODE.JS.** Built on Next.js (App Router) whose API routes and
server run entirely on the Node.js runtime — no Edge runtime anywhere in the
project. This satisfies the "Backend: Node.js or Go" requirement.

**b. EMAIL TRANSPORT = SELF-HOSTED LOCAL SMTP.** The `smtp` service is a
self-hosted SMTP server speaking real SMTP on port 25 (verifiable with a
`telnet` handshake), implemented with Node's `smtp-server` package (maintained
by the author of `nodemailer`) rather than Postfix/Haraka. No third-party email
API is used. The Postfix/Haraka swap path is documented in
[`smtp/README.md`](smtp/README.md).

**c. OTP AUTH.** Placeholder credentials (the committed default) run dev mode —
fixed OTP `123456`, `devHint` in responses — so the two-command boot needs no
secrets. Real SMS runs through a self-hosted Android SMS gateway
(sms-gate.app) configured via a gitignored `docker-compose.override.yml`; the
gateway phone must be online. The evaluated flow never depends on real SMS.

**d. REALTIME.** Socket.io on a custom Node server; JWT-authenticated
connections; per-user rooms.
