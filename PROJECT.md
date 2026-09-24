# PhoneMail — AlphaStack 7-Day Buildathon

**Deadline:** Wednesday, Sep 30, 2026, 11:59 PM
**Today:** Wednesday, Sep 23, 2026 (Day 1)
**Team:** Solo build

---

## 1. What This Is

An email system where a phone number IS the email address
(e.g. `9876543210@phonemail.com`). Two responsive web interfaces —
no APK. Designed for rural, first-time smartphone users who already
know how to use WhatsApp.

**Build priority:** Mobile interface → Desktop interface → Backend infra

---

## 2. Confirmed Clarifications (from evaluators)

- No APK required or preferred — just a responsive website with two
  interfaces (mobile-styled + desktop-styled).
- OTP auth is **preferred** over password auth. Since OTP works
  reliably via Twilio, **password auth is not being built** — this
  is noted in the README as satisfying the spec's conditional
  fallback (only needed "if no free OTP providers are available").
- ~~Fast2SMS's "OTP Message" route sends a fixed, pre-built template
  (no custom text) — this satisfies the "generic template only"
  clarification without any extra work.~~ **Historical — Day 2 hotfix:**
  Fast2SMS requires KYC before any send, so the transport is now
  Twilio's Messages REST API. Twilio imposes no template-only constraint,
  so the SMS text is ours: "Your PhoneMail verification code is {otp}.
  It expires in 5 minutes."
- Live hosting is optional/bonus, not required — evaluators will run
  the project locally via Docker regardless.
- Evaluators will run **exactly two commands**:
  ```
  git clone <repo-url>
  docker compose up -d
  ```
  Everything (DB schema, migrations, service startup order) must
  happen automatically. No manual `.env` setup, no manual `npm install`.
- README.md is a primary deliverable — evaluator reads it as the main
  way to understand the project.

---

## 3. Final Tech Stack

| Layer | Choice | Why |
|---|---|---|
| App (frontend + backend) | **Next.js (App Router), Node.js runtime** | One codebase for API routes + both UIs — satisfies "Backend: Node.js or Go" since Next.js runs on Node.js. Fewer services = fewer Docker failure points, and this stack is extremely well-represented in AI training data → agents make fewer mistakes on it |
| ORM | **Prisma** | Auto-generates migrations + types from schema; `prisma studio` gives a free visual DB browser for fast debugging |
| Validation | **Zod** | Catches malformed data before it becomes a bug; pairs natively with Prisma types |
| Primary DB | PostgreSQL | Durable storage: accounts, emails |
| Fast-auth layer | Redis | In-memory OTP + rate-limiting → sub-500ms login (kept exactly as-is, this is the "wow" feature) |
| Auth tokens | JWT | Stateless, no DB hit per request |
| Realtime (chat updates) | **Socket.io** | Live chat-style inbox updates; more mainstream/documented than raw WebSockets → more reliable AI-generated code |
| Styling | **Tailwind CSS + shadcn/ui** | Prebuilt accessible components, speeds up all 9–10 unique screens |
| Chat encryption | RSA (public-key) | End-to-end encryption of email/chat content — *stretch* |
| Email transport | Self-hosted SMTP, implemented with Node's `smtp-server` package | Required by spec as "SMTP (local)" — do not replace with a 3rd-party email API. `smtp-server` is maintained by the author of `nodemailer`, so the stack stays one runtime; the Postfix/Haraka swap path is documented in smtp/README.md |
| OTP + SMS | **sms-gate.app** (self-hosted Android SMS gateway) ✅ done | Sends through the developer's own phone + SIM via a self-hosted gateway: free, no KYC, no DLT. Real sends require the gateway phone to be online with the app logged in; with the committed placeholder credentials the API runs documented dev-OTP mode (fixed 123456 + devHint) |
| IVR ("press 1" signup) | Exotel (free trial) 🔜 **current focus** | Open inbound calls without per-caller verification |
| Mobile interface | Next.js route/layout, PWA (manifest + service worker) | WhatsApp-style UI, same codebase as desktop |
| Desktop interface | Next.js route/layout | Gmail-style UI, same codebase as mobile |
| Containerization | Docker + Docker Compose | Mandatory two-command boot |
| Optional hosting | Oracle Cloud Free Tier + DuckDNS | Free, permanent, bonus live link |

> **Node.js/Go requirement — confirmed satisfied:** Next.js's API
> routes and server run entirely on the Node.js runtime. State this
> explicitly in the README so an evaluator skimming the stack doesn't
> mistake "Next.js" for a non-compliant framework.

---

## 4. AI / Vibe-Coding Toolkit

- **Confirmed models on hand:** Mercury 2.5, GLM 5.3 Flash (100M tokens),
  Claude — rotate between these as needed (e.g. one runs low on quota,
  or gives a bad result on a specific task), used one at a time
- **Agent harness:** Cline (VS Code) or equivalent — primary. Backup:
  Kilo Code, Continue.dev, OpenCode
- **UI design:** Google Stitch — describe screens in plain English
- **Shared memory:** this file. Every new AI session starts with:
  *"Read PROJECT.md and the current code, then continue."*
- **Load testing:** k6 or autocannon (free) — confirm sub-500ms login

---

## 5. Screen Inventory

### Mobile Client (~9–10 unique layouts, 14 total incl. reused components)
1. Language selection
2. Terms & Conditions
3. Phone number entry (auto-filled, editable)
4. OTP verification (auto-filled/verified)
5. Home (chat list) — search bar, filter chips, compose button, menu, profile icon
6. Side menu drawer (Home, Drafts, Spam, Trash)
7. Chat/conversation thread — subject field, reply-once, swipe-to-tag
8. Compose (traditional view) — locked To/CC when replying
9. Traditional full view (long email expanded)
10. Group chat thread (reuses #7 layout)
11–13. Drafts / Spam / Trash (reuse #5 layout, filtered)
14. Profile & Settings — alias IDs, language, personal details

### Desktop Web Client (6 screens)
1. Login/Signup (phone + OTP + Next, ToS link)
2. Inbox (Gmail-style sidebar + list)
3. Email reading view
4. Compose
5. Settings
6. Profile

### Web Portal (1 screen, separate mini-site)
1. Register — phone + OTP only, resets after each signup

**Total: 21 screens, ~9–10 genuinely unique designs**

---

## 6. Day-by-Day Plan

### Day 1 — Wed Sep 23 (today): Walking Skeleton
- [x] GitHub repo created
- [x] Fast2SMS account set up (OTP Message route, no DLT needed) +
      Exotel trial account signed up
- [x] Define the DB schema (Prisma) and JWT payload shape early — keeps
      later days consistent even working sequentially
- [x] `Dockerfile` for the Next.js app
- [x] `docker-compose.yml`: app + Postgres + Redis, health checks, auto-migrations (`prisma migrate deploy` on startup)
- [x] Next.js API route: phone number + **fake OTP** (`123456` in dev) → Redis → JWT
- [x] Confirm `docker compose up -d` boots clean, login responds <500ms
- [x] End-to-end: signup → fake OTP → JWT → empty inbox, fully in Docker *(auth chain verified end to end in Docker; the inbox screen itself arrives Days 3-5 - no inbox UI exists yet)*

### Day 2 — Thu Sep 24: Real OTP + Email Core
- [x] Real OTP via Fast2SMS wired in (send via `route=otp`, verify
      against Redis locally — see Section 10 for working code)
- [x] SMTP container (Postfix/Haraka) — send/receive test email *(shipped as a small self-hosted Node SMTP service on the smtp-server package instead of Haraka — see Section 9 Day 2)*
- [x] Web portal (2-field registration-only page, can be a simple
      Next.js route or a tiny standalone static page)
- [x] Socket.io server wired into the Next.js app for realtime chat updates

### Day 3 — Fri Sep 25: Mobile Interface, Part 1
- [x] Stitch designs (elder-friendly: large text, high contrast, big tap targets) *(implemented directly as Tailwind design tokens instead of via Stitch — 18px base type, 48px tap targets, high-contrast palette; Stitch was a suggestion, not a requirement)*
- [x] Next.js mobile route/layout, built as a PWA: onboarding screens (language → T&C → phone → OTP)
- [x] Home screen: chat-list, search, filter chips, compose, menu, profile
- [x] **PWA manifest + service worker** — committed, not optional; this
      is the one extra we agreed is low-effort/high-value, do it now
      while building the shell rather than bolting it on later

### Day 4 — Sat Sep 26: Mobile Interface, Part 2 (finish the priority feature)
- [x] Chat/conversation thread: subject field logic, reply-once, swipe-to-tag
- [x] Compose (traditional view) + traditional full view for long emails *(compose is a real screen with validation; the full view is reached from a long message)*
- [ ] Verify PWA install prompt works on a real phone browser *(blocked: needs a real handset — manifest and service worker are served and valid, installation itself is untested)*
- [x] Full mobile flow test: signup → OTP → home → send/receive → reply *(verified programmatically end to end — onboarding, home, send/receive, reply, tag — not by tapping through a browser)*

### Day 5 — Sun Sep 27: Desktop Interface + Telephony
- [ ] Stitch → Gmail-style desktop design
- [ ] Desktop Next.js route/layout: inbox, single-screen OTP login, settings/profile
      (shares auth/API logic with mobile route — no duplicate backend code)
- [ ] **Exotel IVR: toll-free number → press 1 → account created** ← next up
- [ ] Fast2SMS "new email" notification (generic OTP-style template,
      triggered on new email — reuse the same `sendOtpSms`-style function)

**Checkpoint ⚠️:** By end of today you should have a fully working
MVP — both interfaces, OTP auth, SMTP, IVR or SMS. Everything from
here is enhancement, not core function.

### Day 6 — Mon Sep 28: Buffer 1 — Remaining Features + Performance
- [ ] Group chat logic (2+ recipients → group; future 1:1 stays separate)
- [ ] Drafts, Spam, Trash; alias ID management in settings
- [ ] k6/autocannon load test on login — fix anything over 500ms
- [ ] Postgres connection pooling, response compression
- [ ] Docker network hardening: only expose the `app` and `smtp` ports;
      keep Postgres/Redis internal-only
- [ ] *Stretch, only if the above is done early:* RSA end-to-end
      encryption, i18next language support, custom SMS via alternate
      provider, Oracle Cloud + DuckDNS live hosting

### Day 7 — Tue Sep 29: Buffer 2 — Documentation & Rehearsal
- [ ] Write README.md: what it does, exact 2 commands, full feature
      list mapped to spec, architecture explanation, known limitations
- [ ] Fresh-machine test: clone repo, `docker compose up -d` only,
      confirm zero manual steps needed
- [ ] Full demo rehearsal: mobile flow, desktop flow, IVR call, SMS
- [ ] Fix whatever breaks

### Wed Sep 30, 11:59 PM — SUBMIT

---

## 7. Docker Services (final list)

`app` (Next.js — serves both mobile + desktop interfaces + API routes)
· `postgres` · `redis` · `smtp`
— 4 services total (down from 6 in earlier drafts), all on one internal
Docker network, one `docker-compose.yml`, booted by `docker compose up -d`.
Fewer services = fewer things that can fail to boot on someone else's machine.

---

## 8. Fallback / Cut List (if time runs short)

Priority order to drop, if needed, from lowest to highest impact:
1. Custom SMS via alternate provider (stretch only — likely to be dropped)
2. Live hosting (Oracle Cloud + DuckDNS) — nice bonus, not required
3. Multi-language support — fall back to English only, document intent
4. RSA end-to-end encryption — document as future work if it slips
5. Group chat logic — fall back to 1:1 chats only

**Never cut:** Docker two-command boot, OTP-only login, PWA setup,
README quality, core chat-style mobile inbox (this is the "wow" feature).

---

## 9. Notes / Decisions Log

### Testing conventions (permanent)

**Test accounts are exactly two real numbers owned by the developer:
8870313035 and 6381195975.** Agent verification runs MUST switch to dev mode
first (rename the override away) and restore the prior mode after. Real mode is
used only for user-driven demos, and only with these numbers. Reserved
unregistered number for 404 tests (dev mode only): 9999999999. A third user
requires an explicit decision — never invent numbers.

The mechanics, in order:

1. **Safety gate first.** If `docker-compose.override.yml` exists, real SMS is
   live and ANY `/api/auth/send-otp` sends a real message from the developer's
   SIM (this went wrong once: two OTPs reached strangers on Day 4). Rename the
   override away and `docker compose up -d` before the first OTP request, then
   confirm the response carries `devHint` — that is the proof no SMS was sent.
2. **Only these two numbers** may be signed up or sent to: 8870313035 (SIM
   slot 0) and 6381195975 (SIM slot 1). Nothing else, ever, without asking.
3. **9999999999** is reserved for negative-path tests (unknown recipient →
   404). It is never signed up, never appears in the database, never receives
   anything, and is only used while dev mode is active.
4. **Restore the mode you found** when the run is over — the developer's
   rehearsals use real SMS.


*(Update this section daily as you build — helps any AI tool pick up
context instantly)*

- Day 1 (final): Walking skeleton complete and verified end to end in Docker.
  - Stack: Next.js 15.5.26 (App Router) + Prisma 6.19.3 + Postgres 17 + Redis 7;
    JWT via jsonwebtoken (HS256, 7d); zod validation.
  - Auth chain: phone -> fake OTP `123456` in Redis (`otp:<phone>`, EX 300) ->
    verify (one-time use, key deleted) -> upsert User -> JWT. Swapped Twilio ->
    Fast2SMS for OTP/SMS (no recipient whitelist, no DLT on the OTP route -
    see Section 10 for code).
  - Evaluator path verified from a fresh clone on a clean volume: exactly
    `git clone` then `docker compose up -d` - all three services healthy, no
    .env, no manual steps. The app entrypoint applies `prisma migrate deploy`
    (bounded 5x3s retry) before the server starts.
  - Hardening: `prisma`/`@prisma/client` in dependencies so they survive
    --omit=dev; `prisma generate` in the prod-deps stage; `.gitattributes` pins
    .sh/Dockerfile/docker-compose.yml to LF; the image strips CRLF from the
    entrypoint before chmod.
  - Found by container verification (not visible to build or typecheck): the
    slim build stages have no `openssl` CLI, so `prisma generate` fell back to
    debian-openssl-1.1.x while the bookworm runtime needs debian-openssl-3.0.x.
    The app booted and reported *healthy* (health touches no DB) but every
    DB-backed route failed: /api/auth/verify-otp returned 500 and wrote no User
    row. Fixed by pinning `binaryTargets = ["native", "debian-openssl-3.0.x"]`
    in prisma/schema.prisma (commit b1a95bd).
  - Measured on this machine (curl.exe, 5 runs each): send-otp 4.9-5.9 ms,
    verify-otp 8.0-13.7 ms - far under the 500 ms target.
  - Commits: 6f9687a walking skeleton; 0741852 Day 1 hardening; b1a95bd Prisma
    engine target.
  - Known gap carried forward: /api/health is intentionally dependency-free, so
    it reported healthy while the DB path was broken (that is what hid the
    Prisma defect). A DB-aware readiness check belongs in Day 6 hardening.
- Day 2 (final): real OTP with a dev fallback, email core, SMTP service, Socket.io, portal.
  - OTP: Fast2SMS `route=otp` sends a random 6-digit code (redis `otp:<phone>`, EX 300).
    When FAST2SMS_API_KEY is missing or still the committed placeholder the API skips
    SMS, uses the fixed dev OTP `123456`, and reports `devHint` - that is what keeps the
    evaluator's placeholder-key boot fully working. Added the §10 60s resend cooldown (429)
    and a brute-force guard (5 wrong codes burn the pending OTP; further attempts 429).
  - REAL SMS IS UNVERIFIED: no real Fast2SMS key exists on the build machine, so every
    verification below ran in fallback mode. Real-key behaviour is coded to §10 and awaits
    a live test with the user's key.
  - Email core: `Email` model with two User FKs (+ the inbox index), migration
    `20260924120000_add_email_model` generated offline and proven byte-identical to a
    re-run of `prisma migrate diff`. POST /api/emails (JWT) resolves the recipient and
    SUBMITS over SMTP only - it never writes a row; POST /api/mail/inbound (shared-secret
    webhook) is the only writer; GET /api/emails (JWT) returns the newest 50 for the inbox.
    `requireUser()` is the shared bearer guard.
  - SMTP: shipped as a small self-hosted Node SMTP service (`smtp-server` + `mailparser`)
    instead of Haraka, because the build host cannot pull new registry images and because
    PROJECT.md already standardises on Node. Behaviour is what the spec asks for: serves
    `phonemail.com` only, denies relay for anything else, and POSTs each accepted message
    to the app with a retry before it acknowledges the SMTP transaction. Rationale and the
    swap path are in smtp/README.md.
  - Socket.io: `next start` cannot host it, so `server.mjs` boots Next programmatically and
    attaches Socket.io to the same listener (start script + Dockerfile CMD updated; entrypoint
    migration logic untouched). The handshake verifies the JWT, rejects unauthenticated
    sockets, joins room = user id, and the inbound path emits `new-email` { from, subject,
    preview } to that room.
  - Portal: `/portal` phone+OTP registration page calling the existing auth endpoints.
  - Verified on this machine: 4 services healthy; fallback signup; cooldown 429; brute-force
    burn (the correct code stops working after 5 failures); two-user round trip A -> SMTP
    -> inbound -> B's inbox with the SMTP log and the Postgres row as evidence; the send
    route proven not to write rows (SMTP stopped -> 502 and the inbox unchanged); a real
    socket client received `new-email`; /portal serves and its bundle calls the real
    endpoints; latency send-otp 6.4-8.5 ms, verify-otp 9.9-12.6 ms. Evaluator simulation
    from a fresh clone (`git clone` + `docker compose up -d` only) green with both
    migrations applied on a cold volume.
  - Still unverified: real SMS delivery; the browser click-through on /portal (verified at
    HTTP + bundle level, no browser automation available); registry image pulls on a machine
    whose Docker credential helper works (same caveat as Day 1).
  - Commits: 9002768 Day 2 part 1 (OTP + email core + portal); 5b73519 Day 2 part 2
    (SMTP service + Socket.io server).
- Day 2 hotfix: Fast2SMS required KYC before any send; swapped to Twilio via
  REST (fetch, no SDK). Evaluator flow unaffected (fallback mode unchanged).
  Real-SMS demo limited to Twilio-verified numbers.
  - `src/lib/otp.ts`: Twilio Messages API — Basic auth (sid:token),
    form-encoded `To=+91<canonical>`, `From`, `Body`. Success = 2xx with a
    `sid`; anything else throws, logs Twilio's error code/message, and does NOT
    consume the resend cooldown (the SMS is attempted before Redis is touched).
    Config detection covers all three `TWILIO_*` variables, including "still a
    committed placeholder" -> fallback mode with the fixed dev OTP and a
    devHint that now names Twilio.
  - Config surface: compose drops `FAST2SMS_API_KEY` and adds the three
    `TWILIO_*` placeholders; `docker-compose.override.yml.example` documents the
    real values (the override file itself stays gitignored).
  - Unchanged by design: Redis key names, TTLs, the 60s cooldown, the 5-strike
    burn, verify-otp behaviour, JWT issuance, every response shape, portal UI.
  - Evidence: 19/19 unit assertions against the real module (mocked fetch,
    stubbed Redis); 7/7 live regression checks (fallback, cooldown 429, burn,
    two-user signup, SMTP round trip); fresh-clone evaluation green on a cold
    volume; four services healthy.
  - Also normalised placeholder values that had picked up a display-artifact
    ellipsis (they had silently become 10-character strings), which briefly
    broke the compose database credentials during the swap.
  - REAL TWILIO SEND IS UNVERIFIED: no credentials exist on the build machine.
    Commit: eba6d9a.

- Day 2 hotfix 2: trial template `sms_2fa` returns the generated OTP in the API
  response body; real mode parses it, stores it in Redis, verifies locally — live
  OTP on a free Twilio trial. Each send consumes one trial SMS; trials message
  only console-verified numbers.
  - `src/lib/otp.ts` real mode: POST with `Body=sms_2fa` (no custom text and no
    extra parameters — trials reject them). Success requires HTTP 2xx AND a `sid`
    AND `errorCode` null AND a 6-digit code parseable from the response `body`
    (strict `/verification code is (\d{6})/i` first, then the first standalone
    6-digit run). Anything else throws `OtpSendError`.
  - The stored value is TWILIO's code, not one we generated: the local
    `generateOtp()` path is removed in real mode. Fallback mode is unchanged
    (fixed `123456`, `devHint`, no network).
  - Ordering contract kept: nothing is written to Redis unless Twilio accepted the
    message AND a code was parsed, so a rejection leaves no OTP behind and does not
    consume the resend cooldown. Unchanged: key names, TTLs, cooldown, 5-strike
    burn, verify-otp, JWT, response shapes.
  - Evidence: 22/22 unit assertions against the real module (mocked fetch, stubbed
    Redis) covering the template body, code parsing (strict/loose/unparseable),
    errorCode, missing sid, non-2xx, retry-then-cooldown, and the stored code being
    Twilio's; 6/6 live fallback regression checks; fresh-clone evaluation green on a
    cold volume. Commit: 28565c0.
  - Local config note: `docker-compose.override.yml` (gitignored) now holds real
    Twilio values, so the running stack is in REAL mode. Twilio currently rejects
    that auth token for that account SID (HTTP 401, 'auth token is not valid for
    account ...'), so real sends fail with 503 until the token is corrected in the
    override file. Fallback can be exercised with
    `docker compose -f docker-compose.yml up -d` (bypasses the override).
  - README guidance (for the Day 7 README): state that OTP is Twilio-based with a
    dev fallback, so the stack runs with no credentials at all; that a trial account
    only messages numbers verified in the Twilio console; and that each send
    consumes one trial SMS credit.

- Day 2 hotfix 3: OTP SMS transport swapped to **sms-gate.app** — a self-hosted
  Android SMS gateway that sends through the developer's own phone + SIM — and
  local random OTP generation is RESTORED: we author the message text again, so
  the Twilio trial-template parsing is deleted outright (Twilio history lives
  here and in section 10, not in live code).
  - Transport: `POST https://api.sms-gate.app/3rdparty/v1/message` with Basic
    auth from `SMS_GATE_LOGIN`/`SMS_GATE_PASSWORD` and body
    `{ textMessage: { text }, phoneNumbers: ["+91<canonical>"] }`. Success is
    HTTP 2xx (the gateway queues to the paired phone; delivery is
    asynchronous). Non-2xx throws, logs the status and the gateway's own
    payload, and consumes no cooldown — the send is attempted before any Redis
    write, unchanged from Day 2.
  - Security: the code now comes from `crypto.randomInt(100000, 1000000)`, not
    `Math.random` — uniform and unpredictable (evaluators asked about this).
    Issuing a new code also resets the 5-strike counter, so a fresh code always
    comes with five fresh attempts. Logs never contain the Authorization header,
    the credentials or the message text (which carries the OTP); failures log
    only the HTTP status and the gateway's response payload.
  - Message text: "Your PhoneMail verification code is {otp}. It expires in 5
    minutes. Do not share it with anyone."
  - Evidence: 19/19 unit assertions against the real module (mocked fetch,
    stubbed Redis) covering URL, Basic auth, JSON body shape, the exact message
    text, stored-and-verified random code, rotation (superseded code rejected),
    attempt reset, TTLs, cooldown, burn, failure-leaves-zero-state, logging
    hygiene and fallback-never-touches-the-network; 6/6 live regression checks;
    fresh-clone evaluation green on a cold volume. Commit: 02ee742.
  - Config: compose now ships `SMS_GATE_LOGIN`/`SMS_GATE_PASSWORD` placeholders;
    the real values go in the gitignored `docker-compose.override.yml` (see
    `docker-compose.override.yml.example`).
  - REAL SEND IS USER-VERIFIED: the gateway phone must be online with the app
    logged in; the user tests through /portal with their own number.

- Day 3:
- Day 3 part 1 (mobile interface, PWA): shipped the phone interface on the
  Day 1/2 API layer, plus two supporting endpoints.
  - Design system: Tailwind v3 with semantic tokens (wa-* palette, 18px base
    font, `min-h-tap`/`min-w-tap` = 48px enforced on every control). Stitch was
    a suggestion in the plan, not a requirement — the tokens were written
    directly, and the build verifies the styling end to end.
  - Shell: `app/(mobile)/` route group owns `/`; on a phone it is full-bleed, in
    a desktop browser it is a centred phone-width frame. The old Day 1
    placeholder at `src/app/page.tsx` was replaced by the group's own page (the
    placeholder file was preserved outside the repo, not deleted).
  - Onboarding: four screens (language -> terms -> phone -> OTP) against the real
    endpoints. The OTP screen auto-submits on the sixth digit, shows the
    server's `devHint` so an evaluator can see the dev code, counts down the
    real 60s resend window, and shows the lockout state after five strikes.
  - Home: WhatsApp-style chat list from `GET /api/conversations` — threads
    grouped by counterpart across BOTH directions, ~60-char previews, newest
    first, per-thread unread counts, cap 30. Search filters the visible list;
    All/Unread are client state; compose, menu drawer (Home/Drafts/Spam/Trash)
    and the profile icon all lead somewhere real (stub screens where the brief
    said Days 4-5 own the content).
  - Realtime: `socket.io-client` is a real dependency; the home screen connects
    with the stored JWT and refetches on `new-email`. If the socket cannot
    connect it falls back to polling every 30s, so the list still works with no
    websockets — the indicator shows `live` or `polling`.
  - API: `GET /api/conversations` (JWT) and `PATCH /api/emails/[id]` (JWT,
    recipient-only: 403 for anyone else, 404 for an unknown id; `params` awaited
    per Next 15).
  - PWA: `public/manifest.json`, a minimal service worker (precaches the shell,
    network-first for /api/*, never touches /socket.io), and real 192/512 PNG
    icons generated programmatically. The Dockerfile now copies `public/` into
    the runner image — verified by fetching /manifest.json, /sw.js and both
    icons FROM the container, not from `next dev`.
  - Verified programmatically (17/17 checks): shell + onboarding + PWA assets all
    200 from the container; two fresh users onboarded through the real endpoints;
    A -> B delivery appears as ONE thread with unread=1; mark-read returns 403 for
    the sender and 404 for a bad id, then flips isRead and drops unread to 0; a
    reply groups back into the same thread for A. Socket proof (4/4): anonymous
    sockets rejected, authenticated socket receives `new-email` with the right
    payload, client refetch fires. Evaluator simulation from a fresh clone green.
  - NOT verified: the browser click-through itself (no browser automation here —
    the pages, their bundles and their endpoint calls are verified; tapping
    through them is not), and PWA install prompts on a real handset.
  - Commit: 6b3278c.

- Day 4:
- Day 4 (mobile interface, part 2): the screens that make it a working client,
  ending with the organisers' own evaluation shape — two tabs, two users, live
  delivery between them.
  - Per-tab sessions (Task 0, critical): the auth session moved from
    localStorage to sessionStorage, so each TAB is its own user. With
    localStorage a second tab silently inherited the first user's token and the
    two-user test collapsed into one account. Trade-off accepted and documented:
    closing a tab signs you out, which forces the onboarding flow an evaluator
    should see anyway. The socket takes its token from the same hook, and
    sign-out clears both keys.
  - Thread screen: WhatsApp-style bubbles (theirs left, ours right), the subject
    as the thread header line, per-message timestamps, messages that were unread
    when the thread opened marked `new`, and a long message collapsing to a
    preview with `Read full message` expanding to the traditional full view
    (complete body + From/To/Subject header block).
  - Endpoints: GET /api/conversations/[phone] (both directions, chronological,
    cap 200; a pure read) and POST /api/conversations/[phone]/read (batched
    mark-read when a thread opens, so opening is what marks it read).
  - reply-once: POST /api/emails accepts `replyToId` and claims the original
    message with a conditional update, so a second reply cannot be recorded even
    under a race (409). The claim is rolled back if SMTP refuses, so a failed
    send does not burn the reply. Replying to your own message or to someone
    else's is 403; an unknown id is 404. `Email.repliedAt` drives the UI, which
    replaces the Reply affordance with `Replied`.
  - swipe-to-tag: `Email.tag` (persisted) written through PATCH /api/emails/[id]
    from a fixed set (important/later/done, nullable). The gesture is a pointer
    swipe; a `⋯` button exposes the same actions for anyone not swiping. Day 6's
    folders build on this field.
  - Migration 20260924140000_add_thread_state: repliedAt + tag + a
    (fromUserId, toUserId, createdAt) index, generated offline and proven
    byte-identical to a re-run of prisma migrate diff.
  - Realtime: a shared useRealtime hook owns the socket and the 30s polling
    fallback for whichever screen is open. The open thread APPENDS the socket
    payload in place (marked `arriving…`) instead of refetching, so a message
    that lands while you are reading the thread appears immediately.
  - Verified programmatically: 28/28 checks against the running stack (session
    storage contract in code, compose validation, thread auth/400/404/ordering/
    ownership/unread, mark-read-on-open, reply-once 202→409 plus the 403/404
    edges, tag persist/reject/forbid/clear) and 8/8 in a fresh-clone evaluation
    (four services healthy, all three migrations on a cold volume, two users,
    round trip, reply, tag, PWA assets 200).
  - NOT verified: the actual two-tab browser behaviour and the browser
    click-through (no browser automation here), and the PWA install prompt on a
    handset. One incident worth recording: my first verification run happened
    while the local override was active, so the app was in REAL mode — the two
    send-otp calls queued real SMS through the gateway before the run was
    switched to dev mode.
  - Commits: b1a5356 (20s sms-gate budget), da53d4c (Day 4).

- Day 5: IVR (Exotel) is next up
- Day 6:
- Day 7:

---

## 10. OTP Implementation Reference (historical — Fast2SMS)

> **Note (Day 2 hotfix):** the live transport is Twilio's Messages REST API.
> `src/lib/otp.ts` is the source of truth; the Fast2SMS sample below is kept
> only as history and is no longer what runs.

`lib/otp.ts` — generate, send, verify. No manual number list anywhere;
any phone number a user types in flows straight through this.

```javascript
import redis from './redis';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function requestOtp(phoneNumber) {
  const cooldownKey = `otp-cooldown:${phoneNumber}`;
  if (await redis.get(cooldownKey)) throw new Error('Please wait before requesting another OTP');

  const otp = generateOtp();
  await redis.set(`otp:${phoneNumber}`, otp, { EX: 300 }); // 5 min expiry

  const url = new URL('https://www.fast2sms.com/dev/bulkV2');
  url.searchParams.set('authorization', process.env.FAST2SMS_API_KEY);
  url.searchParams.set('route', 'otp');
  url.searchParams.set('variables_values', otp);
  url.searchParams.set('numbers', phoneNumber);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (!data.return) throw new Error('Failed to send OTP');

  await redis.set(cooldownKey, '1', { EX: 60 }); // 60s cooldown
}

export async function verifyOtp(phoneNumber, submittedOtp) {
  const storedOtp = await redis.get(`otp:${phoneNumber}`);
  if (!storedOtp || storedOtp !== submittedOtp) return false;
  await redis.del(`otp:${phoneNumber}`); // one-time use
  return true;
}
```

API routes: `app/api/auth/send-otp/route.ts` calls `requestOtp()`,
`app/api/auth/verify-otp/route.ts` calls `verifyOtp()` and issues a
JWT on success. See chat history for the full route handlers.

**Env vars needed:** `FAST2SMS_API_KEY`, `REDIS_URL`, `JWT_SECRET` —
set these in `docker-compose.yml`'s environment section so evaluators
don't need to create a `.env` file manually.
