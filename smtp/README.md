# PhoneMail SMTP service

Self-hosted SMTP for the internal Compose network. It accepts messages for the
local mail domain, refuses to relay anywhere else, parses each accepted message,
and POSTs envelope + body to the app's inbound webhook (`/api/mail/inbound`)
using the shared `MAIL_WEBHOOK_SECRET`.

## Why a small Node server instead of Haraka

PROJECT.md names Postfix/Haraka, and the Day 2 brief allowed this fallback
explicitly. The choice was made on evidence:

1. **Base-image constraint.** The build host for this session cannot pull new
   registry images (the Docker CLI credential helper fails with
   "A specified logon session does not exist"), while `node:22-bookworm-slim` is
   already present. A Haraka image would have had to come from a registry.
2. **Same stack, no new moving parts.** `smtp-server` is a Node library, so this
   service shares the runtime that PROJECT.md already standardised on for the
   app — one less technology to debug at 2am.
3. **Behaviour is what matters here.** The spec requires self-hosted SMTP that
   accepts the app's submissions and does local delivery. That is exactly what
   this does, with an explicit relay-denial for any non-local domain.

Replacing this with Haraka later is a container swap: the interface is SMTP in,
one HTTP POST out.

## Interface

| Direction | Contract |
|---|---|
| In | SMTP on port 25, submissions accepted without auth, recipients limited to `@$MAIL_DOMAIN` |
| Out | `POST $APP_INBOUND_URL` with `x-mail-secret: $MAIL_WEBHOOK_SECRET` and `{ from, to, subject, body }` |

Delivery to the app is retried up to 5 times, 2s apart, and the SMTP transaction
is only acknowledged once the app has stored the message. A failed hand-off is
reported as a temporary SMTP failure so the sender learns the truth.

## Environment

| Variable | Purpose |
|---|---|
| `SMTP_PORT` | listen port (default 25) |
| `MAIL_DOMAIN` | the only domain served (default phonemail.com) |
| `APP_INBOUND_URL` | app webhook (default http://app:3000/api/mail/inbound) |
| `MAIL_WEBHOOK_SECRET` | shared secret; must match the app's value |
