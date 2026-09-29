# Security — what is actually in this build

Every claim below is verifiable against the code in this repository. Each entry
names the file and the symbol or literal to look for, so nothing here has to be
taken on trust:

```bash
grep -rn "OTP_TTL_SECONDS" src/lib/otp.ts
grep -rn "x-mail-secret" src/app/api/mail/inbound/route.ts
grep -rn "deletedForSender" prisma/schema.prisma
```

If a grep does not find what an entry claims, the entry is wrong and should be
treated as a bug in this document.

## 1. Authentication is OTP-only, and the code is generated locally

| What | Where | Grep for |
|---|---|---|
| 6-digit codes from a cryptographic RNG, not `Math.random` | `src/lib/otp.ts` | `randomInt(100000, 1000000)` (imported from `node:crypto`) |
| Codes expire in **300 seconds** | `src/lib/otp.ts` | `OTP_TTL_SECONDS = 300` |
| A code is **one-time**: it is deleted the moment it verifies | `src/lib/otp.ts` | `redis.del(otpKey(phoneNumber))` inside the success path of `verifyOtp` |
| **Tiered request policy**: the first two requests are immediate, then 60s apart, and at most 5 codes per number per 2-hour window | `src/lib/otp.ts` | `OTP_COOLDOWN = 2`, `OTP_COOLDOWN_SECONDS = 60`, `OTP_WINDOW_LIMIT = 5`, `OTP_WINDOW_SECONDS = 2 * 60 * 60`, `class OtpCooldownError` with its `reason` |
| The window is set with the FIRST request and never extended (a sliding window would let a caller hold the budget open) | `src/lib/otp.ts` | `windowTtl > 0 ? windowTtl : OTP_WINDOW_SECONDS` |
| Every refusal names its reason ("cooldown" or "window") and the actual wait | `src/app/api/auth/send-otp/route.ts` | `reason: error.reason`, `retryAfterSeconds: error.retryAfterSeconds` |
| **5 wrong attempts burns the code** (brute-force bound) | `src/lib/otp.ts` | `OTP_MAX_ATTEMPTS = 5`, `redis.incr(otpAttemptsKey(...))`, `attempts >= OTP_MAX_ATTEMPTS` |
| There is **no password path** at all | whole tree | `grep -rn "password" src` returns only the SMS-gateway credential (`SMS_GATE_PASSWORD`), never a user password |

A fresh code resets the strike counter, so a new code always arrives with five
fresh attempts — and the counter carries the OTP's own TTL, so it cannot outlive
the code it protects.

## 2. Sessions

- **HS256 JWTs, 7-day life**, signed with a secret the server refuses to start
  without: `src/lib/jwt.ts` — `JWT_ALGORITHM = "HS256"`, `JWT_EXPIRES_IN = "7d"`,
  and `class MissingJwtSecretError` raised by `getJwtSecret()` when `JWT_SECRET`
  is unset. A missing secret is a loud startup failure, not a silent default.
- **Tokens never travel in a URL.** The client keeps the token in
  `sessionStorage` and sends it in an `Authorization` header
  (`src/lib/auth.ts` → `requireUser`; `src/lib/useAuth.ts` → `authorizedFetch`).
  Even the file download follows this rule (see §6).
- Every protected route begins with `requireUser`, and a missing or invalid token
  answers **401** with a shared body (`UNAUTHORIZED_BODY`).

## 3. Who gets an SMS, and who does not

`src/lib/notify.ts` — `shouldNotify(registeredVia)`:

- Only accounts FIRST created through `portal`, `desktop` or `ivr` are
  notifiable; an unknown value falls to the safe side. The set is the
  `notifiable` constant, so widening it is a visible edit.
- The receiver's own switch (`User.smsNotifications`) can only ever **narrow**
  the gate, never widen it past what the spec allows.
- Self-send is skipped (`"skipped-self"`): mailing yourself is not a notification.
- A per-recipient throttle returns `"throttled"` rather than queueing, and the
  whole path can **never fail a delivery** — a mail is stored whether or not a
  notification could be sent.

## 4. Machine-to-machine endpoints use shared secrets, not user tokens

| Endpoint | Mechanism | Grep for |
|---|---|---|
| `POST /api/mail/inbound` (the SMTP service) | header `x-mail-secret` compared to `MAIL_WEBHOOK_SECRET`; unset secret is a logged error and a **401**, never an open door | `x-mail-secret`, `MAIL_WEBHOOK_SECRET` in `src/app/api/mail/inbound/route.ts` |
| `POST /api/ivr/signup` (the phone bridge) | header `x-ivr-secret` **or** `?token=` compared to `IVR_WEBHOOK_SECRET` | `x-ivr-secret`, `IVR_WEBHOOK_SECRET` in `src/app/api/ivr/signup/route.ts` |

## 5. The write path has exactly one door

- **Only the inbound webhook creates a message row.** `grep -rn "prisma.email.create" src`
  returns a single hit: `src/lib/inbound.ts`. The send route hands the message to
  SMTP and returns `202`; the row appears when the message completes the round
  trip. A message that never arrived therefore cannot appear as delivered.
- **Reply-once is an atomic claim, not a check-then-act.** `src/app/api/emails/route.ts`
  uses `prisma.email.updateMany({ where: { id, toUserId: user.sub, repliedAt: null } })`
  and treats `claim.count === 0` as the refusal (`409`). Two simultaneous replies
  cannot both win, because the database decides.
- **The claim rolls back if the send fails** — the same route reverts it with
  `.update({ where: { id: claimedReplyTo }, data: { repliedAt: null } })`, so a
  failed send does not burn the sender's one reply.

## 6. Attachments

- **Downloads are authenticated and party-only**: `GET /api/attachments/[id]`
  requires a JWT (401 without one) and answers **403** unless the caller is the
  message's sender or its recipient.
- **The token never appears in a URL.** The card fetches the bytes with the
  session's `Authorization` header and hands the browser a blob
  (`src/components/attachments.tsx`), so a download cannot be opened by a third
  party copying a link — there is no link to copy.
- **Limits are enforced in three places** — the browser, the send route and the
  inbound webhook — from one module (`src/lib/attachments.ts`), because a client
  is a convenience and never the guard.

## 7. The group reply invariant

> In a group — however it was formed — a member's reply to a mail is visible
> ONLY to that mail's author and the replying member.

- **Nothing else is ever in a payload.** The group thread query filters per
  viewer in the database (`src/app/api/conversations/thread/[key]/route.ts`):
  a row is returned only if it is mine, or addressed to me, or a broadcast
  (`replyToId: null`) in a thread I belong to. A private reply between two other
  members matches none of those and is never loaded, let alone sent.
- **The reply cannot be addressed to the group.** `src/app/api/emails/route.ts`
  validates a reply inside a group before accepting it: the caller must be a
  member of the named thread, the row being answered must be in that thread, and
  the reply must be addressed to the member who wrote that row. A broadcast
  wearing a reply's thread key is refused.
- **Sockets are addressed by user id.** `src/lib/socket.ts` emits into the room
  named after the recipient (`io.to(userId).emit(...)`), so a socket event is
  received by exactly the rows' recipients — the same set the database allowed.
- Proven by suite: `ct18` asserts, for both a To+CC group and a To-only group,
  that the third member's payload excludes the reply and their socket receives
  nothing (and `ct3` asserts the same for the original To-only case).

## 8. Aliases

`src/lib/alias.ts`:

- **Globally unique, and never colliding with a phone number**: creation checks
  `prisma.user.findUnique({ where: { phoneNumber: localPart } })` **and**
  `prisma.alias.findUnique({ where: { localPart } })`, so an address can never be
  ambiguous between a number and an alias.
- **One per account**: `ALIAS_LIMIT = 1`.
- **Must mix letters and digits** (`"An alias must contain letters and numbers."`),
  so an alias cannot be used to smuggle a second phone number.

## 9. Deletion

- **Account deletion is OTP-verified and cascades in FK order**:
  `src/app/api/me/delete/route.ts` verifies a fresh code against the account's
  own number (`too many incorrect attempts` → refusal), then removes the user's
  emails (both directions), aliases and contacts before the user row; attachments
  follow their message through `onDelete: Cascade` (`prisma/schema.prisma`,
  the `Attachment` model).
- **"Delete chat" is per viewer and never touches the other side**:
  `src/app/api/conversations/[phone]/route.ts` (`DELETE`) sets
  `deletedForSender` / `deletedForRecipient` on the caller's own pairwise rows
  only — `threadKey: null` keeps group messages out of it. The flags are
  *additive*: the counterpart's copy is the same row, untouched, which is why
  deletion is a flag and not a row delete. Documented in the README.

## 10. Defaults that fail safe

- Every API route requires a user before doing anything; the two webhooks require
  a shared secret; an unconfigured secret is a refusal, not an allowance.
- An unknown `registeredVia` means **no SMS**.
- An unknown token shape is `invalid` and refused (`classifyToken`), rather than
  guessed at.
- A group thread the caller is not a member of answers **403**; a thread key that
  is not a well-formed group key answers **400**.

## 11. The service worker's scope

`public/sw.template.js` is served by `src/app/sw.js/route.ts` with
`Service-Worker-Allowed: /` and `Cache-Control: no-cache`. It **never intercepts
`/api/*` or `/socket.io`** (both are explicitly excluded), and navigations are
network-first, so the worker cannot serve private data from a cache or hide a
build from the user. Its cache name is stamped from the image's own
`.next/BUILD_ID`.

## 13. The app PIN (rounds 22, 28) - what it is, and what it is not

**It gates the interface, not the API.** A PIN is stored as a bcrypt hash
(`User.pinHash`, `lib/pin.ts`) and checked by `POST /api/me/verify-pin`. A correct
PIN does nothing to the session: no token is issued, refreshed, extended or
revoked by it. The JWT remains the only thing that authorises a request, which
means **the PIN is convenience for a shared device, not a security boundary** - a
borrowed phone cannot be scrolled, and that is the whole promise.

Concretely, what it does not do: it does not protect an unlocked API client, it
does not survive someone with the token (a stolen copy of `sessionStorage`, a
browser profile copied off the disk, or any request made outside the app), and it
is not a second authentication factor.

As a LOGIN (round 28) the same PIN is a real credential - by choice, never by
default: `POST /api/auth/login-pin` verifies it and issues the SAME session
verify-otp issues. The strikes bound it exactly like the unlock (five wrong
entries, 60 seconds, per account), and OTP remains the primary path in both
clients - the PIN door appears only for accounts that set one, and only behind
a quiet link. That is the trade this feature makes, stated plainly: a PIN is
weaker than a one-time code, which is why it never replaces the code.

**What it does do, and where the rules live:**

| Rule | Where |
|---|---|
| Four to six digits, digits only, hashed with bcrypt (10 rounds) | `lib/pin.ts` (`pinProblem`, `hashPin`) |
| Since round 28 the PIN is also an OPTIONAL login: it issues the same JWT + Session row `verify-otp` issues, behind the same strikes | `POST /api/auth/login-pin` |
| A PIN sign-in stands the tab's lock down - the PIN was just proven - through the same flag every sign-in sets | `components/pin-lock.tsx`, `useAuth().signIn` |
| Set / change / REMOVE all need the current PIN (removal included, or the lock is decoration) | `PUT /api/me/pin` |
| Five wrong entries refuse the PIN for 60 seconds, per ACCOUNT rather than per tab, with the reason and the wait | `POST /api/me/verify-pin`, `pin-lock:<userId>` in Redis |
| A forgotten PIN is reset by a live one-time code for the account's own number - the same verification account deletion uses | `POST /api/me/pin/reset`, `verifyOtp` |
| The lock shows on a fresh tab or a PWA launch, and stands down for the tab that just signed in | `components/pin-lock.tsx`, `sessionStorage` |
| The API's view of an account does not change because a PIN exists | no other route reads `pinHash` |

The strikes are the OTP pattern's twin (see §1): a counter, then a timed refusal,
reset by the same window expiring or by a correct entry.

## 12. Known gaps, stated plainly

These are real, and they are limitations rather than oversights:

1. **No TLS at the application layer.** This is a local deployment by design: the
   stack is reached over `http://localhost:3000` and the *mail* hop between the
   app and its own SMTP container is internal Docker networking. Deploying this
   anywhere real means terminating TLS in front of it — nothing in the app does
   that for you.
2. **npm advisories: 1 moderate and 4 high** (`npm audit --omit=dev`, transitive).
   They are reported rather than patched: no dependency was upgraded during the
   build, because the verified artefact is the committed one. Upgrading the
   `next`/`postcss` chain is the next maintenance step.
3. **Tokens are revocable per device; their LIFETIME is still 7 days.** Every sign-in
   creates a `Session` row (`prisma/schema.prisma`), the JWT carries its id (`sid`,
   `src/lib/jwt.ts`), and `requireUser` (`src/lib/auth.ts`) refuses a token whose row
   is gone - so "log this device out" deletes the row and that device's next request is
   401, and deleting the account deletes every session FIRST
   (`src/app/api/me/delete/route.ts`). What remains true: a token is valid for up to
   7 days with **no refresh rotation**, and there is no denylist of individual tokens -
   revocation is per session, which is the unit a person actually thinks in ("log out
   that laptop"), not per token. Short-lived access tokens with a refresh pair are the
   next step if this ever leaves localhost.
4. **Committed placeholder secrets.** `docker-compose.yml` ships placeholder
   values for `JWT_SECRET`, `MAIL_WEBHOOK_SECRET`, `IVR_WEBHOOK_SECRET` and the
   SMS gateway credentials so that `docker compose up -d` works with no `.env`.
   **Rotation policy: replace all four before any real deployment**, and keep the
   real values in a gitignored `docker-compose.override.yml` — which is also the
   file that switches the app out of dev-OTP mode.
5. **The dev-OTP mode is deliberately open.** With placeholder credentials the
   app answers every `send-otp` with the fixed code `123456` and a `devHint`
   saying so. That is what makes a fresh clone testable without secrets; it is
   also why the app must never be pointed at the public internet in that state.

No claim in this document goes beyond what the code does; where the code stops,
the section stops.
