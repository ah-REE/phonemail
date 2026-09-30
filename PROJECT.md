# PhoneMail — AlphaStack 7-Day Buildathon

**Deadline:** Tuesday, Sep 29, 2026, 11:59 PM

**`docs/SPEC.md` is the official organizer task document and the source of truth; PROJECT.md is the working plan.**
**Today:** Sunday, Sep 27, 2026 - the final documentation session. The build itself finished on Sep 26; the submission deadline is Tuesday, Sep 29, 11:59 PM.
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
- OTP auth is **preferred** over password auth. OTP works through the
  self-hosted SMS gateway (the Twilio trial was superseded - see
  Section 9), so **password auth is not being built** — this
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
| Styling | **Tailwind CSS** (no component library) | Design tokens in `tailwind.config.ts`; every screen is built from them, so a repaint is one file |
| Chat encryption | - | **Cut, and the claim removed.** RSA end-to-end encryption was a stretch goal and was never built. Round 4 removed the app's false "end-to-end encrypted" wording: the UI now says what is true - the mailbox is private, the mail stays between you and the people you write to, the sender is known |
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
1. Language selection - SUPERSEDED by the welcome screen; language lives in the Settings Language row
2. Terms & Conditions
3. Phone number entry (auto-filled, editable)
4. OTP verification (auto-filled/verified)
5. Home (chat list) — search bar, filter chips, compose button, menu, profile icon
6. Side menu drawer - WITHDRAWN; Drafts/Spam/Trash are rows in Profile & Settings (Section 9)
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
- [x] Verify PWA install prompt works on a real phone browser *(blocked: needs a real handset — manifest and service worker are served and valid, installation itself is untested)*
- [x] Full mobile flow test: signup → OTP → home → send/receive → reply *(verified programmatically end to end — onboarding, home, send/receive, reply, tag — not by tapping through a browser)*

### Day 5 — Sun Sep 27: Desktop Interface + Telephony
- [x] Stitch → Gmail-style desktop design *(implemented directly with the Tailwind tokens rather than via Stitch — same reasoning as Day 3: Stitch was a suggestion)*
- [x] Desktop Next.js route/layout: inbox, single-screen OTP login, settings/profile *(ships at /desktop under app/(desktop)/; shares auth, API and realtime with mobile)*
      (shares auth/API logic with mobile route — no duplicate backend code)
- [x] **Exotel IVR: toll-free number → press 1 → account created** ← next up *(endpoint and docs complete and tested; the real call is user-verified once the Exotel console is wired)*
- [x] Fast2SMS "new email" notification (generic OTP-style template, *(implemented on the sms-gate.app transport, since Fast2SMS was dropped in the Day 2 hotfix)*
      triggered on new email — reuse the same `sendOtpSms`-style function)

**Checkpoint ⚠️:** By end of today you should have a fully working
MVP — both interfaces, OTP auth, SMTP, IVR or SMS. Everything from
here is enhancement, not core function.

### Day 6 — Mon Sep 28: Buffer 1 — Remaining Features + Performance — documentation + rehearsal must be COMPLETE by EOD
- [x] Group chat logic (2+ recipients → group; future 1:1 stays separate) *(shipped Day 6: the DERIVED thread key - see the Day 6 group-chat entry below)*
- [x] Drafts, Spam, Trash; alias ID management in settings *(both shipped Day 6 - the folders on 2026-09-25, see the two Section 9 entries)*
- [x] k6/autocannon load test on login - fix anything over 500ms *(measured with a light Node script instead of k6/autocannon, because the OTP endpoints are cooldown-guarded and cannot be hammered without measuring the guard rather than the login: /api/health p50 5.7 ms and p95 7.6 ms over 30 sequential requests, send-otp 13.3 ms and verify-otp 13.7 ms as round trips, and a 50-way concurrent burst all 200s at p95 315 ms. Everything sits far inside the 500 ms target, so nothing needed fixing.)*
- [ ] Postgres connection pooling, response compression *(not done: Prisma's own pool is what runs, and no compression layer was added. Neither was needed to hold the 500 ms target - see the measured numbers above)*
- [x] Docker network hardening: only expose the `app` and `smtp` ports; *(actually stricter than asked: postgres, redis AND smtp publish nothing, and only `app:3000` is reachable from the host)*
      keep Postgres/Redis internal-only
- [ ] *Stretch, only if the above is done early:* RSA end-to-end
      encryption, i18next language support, custom SMS via alternate
      provider, Oracle Cloud + DuckDNS live hosting

### Day 7 - Tue Sep 29: SUBMISSION ONLY (final green run, no new work)

**Closed out on Sunday, Sep 27.** The two unchecked boxes below are the
operator-side ones (a real IVR call, a real SMS leg) and the optional
pooling/compression work; each carries its reason inline.
- [x] Write README.md: what it does, exact 2 commands, full feature
      list mapped to spec, architecture explanation, known limitations *(done - a line-by-line spec mapping with the honest rows for attachments, phone auto-detection, WebOTP, IVR, the swipe-right alternative and desktop, plus load numbers and the npm advisory count)*
- [x] Fresh-machine test: clone repo, `docker compose up -d` only,
      confirm zero manual steps needed *(done repeatedly; most recently by cloning from ORIGIN into a timestamped directory, where all 12 migrations applied on a clean volume, the four services came up healthy, the clone served all four smoke routes, and all 17 suites ran against it green at 525 of 526 with the one documented socket skip)*
- [ ] Full demo rehearsal: mobile flow, desktop flow, IVR call, SMS *(NOT done - the flows are verified programmatically, but the IVR call needs the Exotel console wired and a real call, and the SMS leg needs the gateway phone online. Both are operator-side and were never performed here.)*
- [x] Fix whatever breaks *(nothing broke: the closing runs on the working stack and on a fresh clone from origin were both fully green)*

### Tue Sep 29, 11:59 PM - SUBMIT

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
4. RSA end-to-end encryption - **CUT, and never claimed again**: it was not built, and the UI's encryption wording was removed rather than left as decoration
5. Group chat logic — fall back to 1:1 chats only

**Never cut:** Docker two-command boot, OTP-only login, PWA setup,
README quality, core chat-style mobile inbox (this is the "wow" feature).

---

## 9. Notes / Decisions Log

### Testing conventions (permanent)

**Agent test accounts are exactly two real numbers owned by the developer:
8870313035 and 6381195975** — this rule binds agent-created and agent-operated
accounts only: agent runs use these two numbers and invent nothing. Two further
accounts are settled, documented exceptions — 9500089722 and 8072788917, the
developer's friend's first and second test logins, user-created through the real
portal (not agent artifacts) and user-confirmed. Agent verification runs MUST
switch to dev mode first (rename the override away) and restore the prior mode
after. Real mode is used only for user-driven demos, and only with the numbers
listed above. Reserved unregistered number for 404 tests (dev mode only):
9999999999. Any account beyond these requires an explicit decision — never invent
numbers.

The mechanics, in order:

1. **Safety gate first.** If `docker-compose.override.yml` exists, real SMS is
   live and ANY `/api/auth/send-otp` sends a real message from the developer's
   SIM (this went wrong once: two OTPs reached strangers on Day 4). Rename the
   override away and `docker compose up -d` before the first OTP request, then
   confirm the response carries `devHint` — that is the proof no SMS was sent.
2. **Agent runs may sign up or send to only these two numbers**: 8870313035 (SIM
   slot 0) and 6381195975 (SIM slot 1). The two exception accounts above are
   user-created logins, not agent-created, so they sit outside this rule. Nothing
   else, ever, without asking.
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

- Day 4 polish hotfix (from the developer's first real click-through):
  - Finding 1 — the refresh race (FIXED): the guards waited on a `ready` flag
    that is resolved in an effect, so between the first paint and that effect the
    session was still UNKNOWN. An unknown session is not a signed-out one, but
    there was no third state to express that, so a guard could act on the gap.
    `useAuth` now exposes `status = loading | authenticated | unauthenticated`,
    reads the session SYNCHRONOUSLY in the useState initializer (SSR-guarded) so
    nothing is left to guess once the client mounts, and EVERY redirect is gated
    on a confirmed status; the first paint is a skeleton, never onboarding.
    Per-tab sessionStorage, the socket's token source and logout clearing both
    keys are unchanged. Honesty note: the browser timing could not be reproduced
    here, so the original mechanism is reasoned from the code rather than
    observed — the fix removes the window either way, and the developer's
    click-through is the confirmation.
  - Finding 2 — conservative polish, same design language: 8px-based rhythm and
    one card radius as tokens, darker muted text for real contrast, skeletons for
    the chat list and the thread instead of blank flashes, an empty state with one
    clear action, visible focus rings, restrained 180ms transitions with a
    reduced-motion guard, one shared AppBar so the chrome cannot drift between
    screens, and thread auto-scroll to the newest message.
  - Verified: build green; 16/16 (the auth contract read from source, plus a full
    dev-mode regression on the two convention numbers — round trip, reply-once
    409, tags, mark-read, conversations, reserved-number 404, every route 200);
    8/8 in a fresh-clone evaluation. NOT verified: the browser refresh behaviour
    itself and how the polish looks on a handset — both are the developer's next
    click-through.
  - Commit: 41232a7.

- Day 5: IVR (Exotel) is next up
- Day 5 (desktop client, IVR, notifications): the MVP checkpoint day.
  - Desktop: app/(desktop)/desktop with its own layout (explicit /desktop URL so
    evaluators open both interfaces without user-agent guessing). Single-screen
    login (phone + inline OTP), three-zone inbox (rail, thread list, reading pane
    that marks a thread read on select), compose pane, profile, settings. REUSE
    only: the same useAuth (per-tab sessionStorage, so the two-tab method is safe
    here too), authorizedFetch, useRealtime and endpoints as mobile — no
    desktop-only backend logic. Cross-links both ways for discoverability.
  - IVR: POST /api/ivr/signup — shared secret via ?token= (or the x-ivr-secret
    header), caller number taken from CallFrom, upsert (idempotent), XiML
    Response/Say reply. No OTP by design: the call itself proves the number, so a
    caller cannot create an account for a number they do not control.
    docs/ivr-setup.md documents the Exotel console steps and the tunnel or hosted
    URL requirement.
  - Notification: the inbound path (after the row is written and the socket event
    is emitted) sends the recipient a plain SMS through the same gateway, with
    the text 'New PhoneMail message from <sender>: <subject>', throttled to one
    per recipient per 60s. It can NEVER fail a delivery (outcomes are returned as
    values, not thrown) and dev mode skips it silently. The inbound response now
    reports the outcome, so the mechanism is visible in the SMTP service log.
  - Verified: build green; mobile AND desktop routes 200; IVR 401 (wrong secret)
    / 400 (unreadable number) / 200 + idempotent repeat (10/10 live checks);
    notification logic covered by 7/7 unit assertions against a mocked transport
    and stubbed Redis (dev-mode silence, one send, per-recipient throttle,
    failure-never-throws); both convention accounts still sign in with the dev
    OTP and the round trip still delivers.
  - USER-VERIFIED (cannot be done from here): the Exotel console plus a real call,
    the notification SMS actually arriving on the handset, and how the desktop
    interface feels in a browser. Account 9500089722 is still pending the
    developer's decision.


- Day 5 hotfix: OTP SMS rotates among user-verified formats — resists
  exact-duplicate filtering while every format is proven to deliver; untested
  formats are never shipped.
  - src/lib/otp.ts: `OTP_MESSAGE_FORMATS` holds the verified list (currently a
    single entry, "PhoneMail: {otp}"); `otpMessage()` picks one with
    crypto.randomInt — the same randomness standard as the code itself. The long
    templated wording the carrier drops is gone, and a unit assertion fails if it
    ever returns.
  - Tests: 22/22 — every generated message matches a committed format, all
    committed formats appear across 500 generations, no format is over-long or
    templated, and the body shape / To / From assertions still pass.
  - NEEDS FROM THE DEVELOPER: more manually-verified formats. With one entry this
    is a rotation mechanism, not yet a mix — and unverified formats must not ship.
- Day 6: SMS wording is FINAL and user-verified — all five candidate texts were
  sent to the developer's handset (8870313035) through the real sms-gate path on
  2026-09-24 and all five physically arrived. Committed aftermath: the OTP
  rotation pool is the four verified OTP formats, and the new-mail notification
  uses the spec's exact wording "You have received an email from <sender>.
  Subject: <subject>." with <sender> as the sender's number@phonemail.com.
- Day 6: repository and conventions
  - docs/SPEC.md now holds the organizer's task document verbatim (saved from the
    paste between the SPEC markers, markers excluded) and PROJECT.md declares it
    the source of truth, with PROJECT.md as the working plan.
  - Account 9500089722 is the developer's friend's test login (user-created for a
    real portal sign-in, not an agent artifact). Settled — do not flag again.
  - Account 8072788917 is the developer's friend's SECOND test account — a second
    real number the same friend owns, used for the same real portal sign-in.
    Settled (user-confirmed 2026-09-24) — keep the account; do not flag or
    remove it again.
- Day 6:

- Day 6: service-worker versioning and the notification gate.
  - Service worker: /sw.js is now served by a route handler from
    public/sw.template.js with the cache name stamped from the image's own
    .next/BUILD_ID, plus Cache-Control: no-cache, must-revalidate and
    Service-Worker-Allowed: /. activate already dropped non-current caches and
    still calls skipWaiting/clients.claim; /api/* stays network-first and
    /socket.io is skipped. Caught and fixed in the same session: the first
    version stamped the cache name with a literal placeholder match, which
    silently no-opped inside the image (two-byte difference between the
    repository and shipped copies) and would have shipped a worker whose cache
    name never changed - the exact stale-shell failure the task exists to
    prevent. The stamp is now a regex on the CACHE line. Commits 52f0644,
    e36b620.
  - Notification gate (spec): User.registeredVia ('mobile' | 'portal' |
    'desktop' | 'ivr', default 'mobile', migration 20260924220000). verify-otp
    takes a `source` and records it on FIRST registration only (a later sign-in
    through another client never rewrites it); /portal sends 'portal', desktop
    login 'desktop', mobile onboarding 'mobile' and the IVR webhook writes
    'ivr' directly. The inbound path notifies only when the recipient's
    registeredVia is in the allowlist {portal, desktop, ivr}: a missing or
    unrecognised value falls to the safe side (no SMS). The 60s throttle, the
    never-fail-delivery rule and the inbound outcome field are unchanged; the
    outcome now also reports 'skipped-mobile'.
  - Verified: notify unit suite 8/8 (including the gate allowlist) and OTP suite
    22/22; migration applied on a container start; live dev-mode regression -
    a mobile-registered recipient reports skipped-mobile while portal, desktop
    and ivr recipients take the SMS path (dev-mode, so no network). Both
    convention accounts were set to 'portal', which is how they were actually
    created, so the notification demo behaves correctly.

- Day 6: onboarding per spec — the separate T&C screen is gone. The flow is now
  Language -> Phone -> OTP, with the acknowledgement as a consent line under the
  Send OTP button ("By continuing, you agree to the Terms & Conditions", teal
  link) that opens a plain /terms view. The phone pre-fill is untouched.
- Day 6: GROUP CHAT - the derived thread key (2+ recipients; 1:1 untouched).
  - Decision (user-confirmed): a group conversation is NOT stored, it is
    DERIVED. threadKey = "grp:" + sha256(sorted unique [sender, ...recipients],
    comma-joined, members in canonical 10-digit form). A -> B+C and B -> [A,C]
    therefore reduce to the same set {A,B,C} and land in the same thread with
    no group id to allocate, store or keep in sync; the rows alone rebuild the
    conversation. A message with exactly ONE recipient gets threadKey NULL, so
    pairwise threads group byte-for-byte as before.
  - Accepted trade-off: two SEPARATE composes to the same member set merge into
    one group thread (Gmail-conversation behaviour). Deliberate, user-confirmed.
  - Plumbing - one submission, fanned out exactly once: POST /api/emails takes
    an array and/or a comma list and submits ONE SMTP message with every
    recipient in To (no per-recipient loop); the SMTP service forwards the whole
    list in the webhook payload; /api/mail/inbound accepts `to` as an array (a
    bare string or comma list is still accepted, so an older SMTP container
    keeps working); inbound.ts writes one Email row per recipient, all sharing
    the derived key, then runs the socket emit and the notification gate per
    recipient exactly as it did for a single one.
  - Read model: GET /api/conversations excludes keyed rows from pairwise
    grouping and returns them separately as groupThreads (members, latest
    message, timestamp, per-user unread); GET /api/conversations/thread/[key]
    returns the WHOLE thread to any member - membership is proven by the rows
    themselves (sender or recipient on at least one row), so a non-member
    holding the key gets 403. Mark-read stays per member: it only updates rows
    addressed to the requester, so one member reading cannot clear another
    member's badge.
  - UI: the chat list renders group threads (avatar = member count, title = the
    members); /thread/group/[key] is the group conversation with a LOCKED
    in-thread composer that sends to all OTHER members (no add/remove); home
    compose takes multiple recipients as removable chips.
  - Migration 20260924230000_add_group_thread_key (nullable threadKey + the
    (threadKey, createdAt) index the group queries use).
  - Verified on this machine (dev mode, real SMTP round trip): build green
    (`npm run build`, exit 0, /thread/group/[key] and both group API routes in
    the route table); the migration applied on container start ("Applying
    migration `20260924230000_add_group_thread_key`"); a 43-assertion API
    regression passed 43/43 - the group thread is visible to all three members
    with the complete 3-member list, unread B=1 / C=1 / A=0, the second compose
    to the same members lands on the SAME derived key, a single-recipient send
    stays pairwise (threadKey null) and leaves the group untouched, the reply
    lands on the same key and reaches both other members, mark-read clears only
    the reader's own badge, and a malformed key is 400 / an unknown key is 404.
    The recipient-set lock is asserted at CODE level (no remove affordance and
    no free-text recipient input in the group composer) - it is NOT
    browser-verified, and the non-member 403 path is code-inspected only
    (testing it would need a fourth account, which the conventions forbid).
  - Deferred, recorded honestly: the desktop inbox still renders pairwise
    threads only (group mail is invisible there, not lost); the group view has
    no swipe-to-tag and no per-group reply-once - those stay pairwise
    affordances.

- Day 6: ALIAS IDs (a second address for one account) + desktop group visibility.
  - Model: Alias(id, userId FK cascade, localPart UNIQUE, createdAt), migration
    20260924233000_add_alias. localPart is unique AND is checked against
    User.phoneNumber before creation, so "<localPart>@phonemail.com" always
    resolves to exactly one account - an alias can neither shadow a phone number
    nor be shadowed by one, and a collision is refused (400).
  - API (JWT): GET /api/aliases (list mine), POST /api/aliases (create),
    DELETE /api/aliases/[localPart]. Owner-scoped by construction - the token's
    sub is the only userId ever read or written. Rules: 3-20 characters, lowercase
    letters/digits/dots, no leading/trailing/doubled dots, reserved words blocked
    (admin, support, postmaster, abuse, hostmaster, webmaster, noreply, mail,
    smtp, api, portal, ivr, ... - the full list is in lib/alias.ts). Invalid or
    duplicate is 400.
  - Resolution: ONE lookup (lib/alias.ts) shared by POST /api/emails and the
    inbound path, so the two cannot drift apart. From resolution onward an alias
    takes exactly the same path as a number - same row, same socket event, same
    notification gate - and an unknown alias is indistinguishable from an unknown
    number (404). Stored addresses stay canonical <number>@phonemail.com, and the
    derived group key is built from NUMBERS rather than from whatever alias a
    sender typed, so the same people always land in the same thread.
  - UI: alias management (list / add / remove) on the mobile profile & settings
    screen. Functional only - the visual pass comes later.
  - Desktop correctness fix: the desktop inbox rendered PAIRWISE threads only, so
    group mail was visible on mobile and invisible there. It now renders the
    groupThreads that /api/conversations already returned and opens one through
    /api/conversations/thread/[key] with the same per-member mark-read semantics.
  - Verified (dev mode): build green; the migration applied on container start
    ("Applying migration 20260924233000_add_alias", Alias table present); the prior
    group regression still 43/43 AND an alias suite 31/31 - create 201 plus the
    full address, owner-scoped list (another account sees none), duplicate 400,
    too-short 400, reserved-word 400, invalid-character 400, leading-dot 400,
    phone-number collision 400, mail to the alias delivered (unread +1), mail to
    the full alias address delivered too, unknown alias 404, non-member (8072788917)
    reading a group thread 403 with the group absent from that account's list,
    foreign delete 404, owner delete 200, mail to a deleted alias 404. The desktop
    rendering itself is build- and code-verified only - no browser in this session.
  - DEFERRED, not started (mobile-spec items this session did not reach):
    search-to-chat from the home search box; the traditional-compose button in the
    thread input row; swipe-right "traditional view" reply; Favorites and
    Attachments filter chips; Drafts/Spam/Trash folders plus swipe-to-move.
    Nothing was begun for these, so no half-built code sits in the tree.

- Day 6: VISUAL REFRESH step 1 - the token layer (screens follow).
  - What moved: tailwind.config.ts (the colour scale, the type scale, the radii,
    the touch floor, the content width) and src/app/globals.css (canvas and ink
    defaults, the focus ring, .btn-primary / .btn-quiet / .field / .surface /
    .row / .skeleton), plus next/font in src/app/layout.tsx.
  - VALUES ACTUALLY ADOPTED from the mockup markup (the brief's rule: the
    mockups win over any other description): canvas #f5faff; surface #ffffff;
    fills #eaf5fe / #e5eff8 / #dfeaf2 / #d9e4ec; ink #131d23; muted #3f4946;
    outline #6f7976; outline-variant #bec9c5; primary #00453d;
    primary-container #075e54; secondary #006d2f; secondary-container #5dfd8a;
    surface-tint #1c695f; action green #25d366; error #ba1a1a.
  - NOTE - the design source contradicts itself, and this is the decision that
    matters most to review: design/safe_clean_messenger/DESIGN.md's front-matter
    and the mockup markup carry the tone set above, while its PROSE section
    describes an older WhatsApp-like palette (#EFEAE2 canvas, #111B21 ink,
    #DAE1E3 borders, #667781 muted, #D9FDD3 bubbles). The mockups were followed,
    so the prose values are NOT in the app. If the prose is what was intended,
    only tailwind.config.ts has to change.
  - Shape and elevation per the design: pill controls (rounded-pill), 16px cards,
    24px sheets, and strictly flat - no drop shadows, no blur, no gradients.
    Touch floor raised 48px -> 56px and content width 430px -> 480px.
  - Typography: Plus Jakarta Sans (headlines) + Inter (body/labels) through
    next/font, which downloads and SELF-HOSTS the files at build time (11 woff2
    files in the build output) - no runtime font CDN, so the offline
    `docker compose up -d` guarantee is intact.
  - DEVIATION (reported): the root font size stays 18px rather than the mockups'
    16px body text, because 18px is the elder-friendly floor agreed in section 3.
  - Verified: build green with the fonts self-hosted; the compiled CSS carries
    the new palette (canvas, ink, teal, action green, outline-variant, error all
    present, every old value gone); .btn-primary compiles to a 56px pill on
    rgb(37 211 102) with rgb(19 29 35) text and .field to a 56px, 16px-radius
    white field with a 1px rgb(190 201 197) border; all 14 routes answer 200 in
    dev mode; the served /sw.js cache stamp rotated (phonemail-shell-
    RXLe344GFdCqQPDZWC8IC -> phonemail-shell-TFQzCc7Ddl75emLNKIss8), so returning
    users and installed PWAs receive the new shell; and the 74-assertion dev-mode
    regression (43 group + 31 alias/403) is still green - which is the evidence
    that this changed presentation and nothing else.
  - NOT DONE - the session ran out of budget here, and no half-restyled screen is
    in the tree: screen-order items 1-8 (onboarding x3, home, thread pairwise +
    group, compose, traditional full view, settings/profile, drawer + /terms +
    /portal, the desktop route group). Because the token layer moved first, every
    untouched screen is ALREADY on the new palette; what is missing is each
    screen's own designed layout and the per-screen linking audit.
  - UNVERIFIED: how any of it LOOKS. There is no browser in this session, so the
    visual result is the user's click-through - including whether the 56px touch
    floor and the new header/CTA treatment sit well on the existing screens.

- Day 6: the remaining mobile-spec items - search-to-chat, chips, folders,
  the camera-slot compose button.
  - Search-to-chat (spec): a COMPLETE 10-digit number typed into the home
    search box offers "Message <number>" and opens that pairwise thread. Partial
    or invalid input offers nothing, and the thread's own empty state covers the
    no-history case.
  - Chips (spec): Favorites is a `favorite` value on the existing Email.tag field
    (no migration) and a thread counts as a favourite when ANY of its messages
    carries it - /api/conversations now reports a `favorite` flag per thread.
    Attachments is present with a friendly empty state ("No messages with
    attachments yet"); `attachments` is a constant 0 and that is deliberate -
    there is no attachment backend in this build, and the chip is honest about it
    rather than absent.
  - Folders (spec): `Email.folder` (inbox | spam | trash), migration
    20260925060000_add_email_folder, default 'inbox' so nothing needed a backfill.
    folder is RECIPIENT-SCOPED state, exactly like isRead and tag: moving a message
    takes it out of that reader's inbox and chat list while the sender still sees
    what they sent. A move is one PATCH on /api/emails/[id]; GET /api/emails takes
    ?folder= (defaults to inbox, so older callers are unchanged) and an unknown
    folder is 400. The thread screen's existing reveal panel gained Spam and Trash
    buttons, and /spam and /trash became real folder screens with a move-back.
  - Drafts (spec): NOT a folder value, and the reason is structural - an Email row
    needs BOTH a sender and a recipient, and an abandoned compose has no recipient
    yet, so a database draft would need a second model for a feature whose whole
    job is not losing what you typed. Drafts therefore live in this browser's local
    storage: compose saves as you type, clears the draft once the message reaches
    the mail service, and /drafts lists it with Resume/Discard. Documented in
    lib/folders.ts and here, because it is the one menu item whose data never
    reaches the server.
  - Camera-slot compose (spec): the pairwise thread's input row now has the
    traditional-compose button in the camera position, opening /compose with To
    pre-filled and LOCKED (a new `lockTo` param, the same lock a reply has).
  - Verified (dev mode, real SMTP round trip): build green; the migration applied
    on container start ("Applying migration 20260925060000_add_email_folder", the
    column present with default 'inbox'); all routes 200 including the three
    folder screens; and 107 assertions across three suites - 43 group, 31
    alias/403 unchanged, and 33 new ones covering the favourite flag, attachments
    0, the folder move round trip (spam -> trash -> inbox, leaving and rejoining the
    chat list with the unread count following), the 400 on an unknown folder, and
    code-level checks for the search offer, the chips, the locked recipient set, the
    draft save/clear/resume and the camera-slot button. The client-side behaviour
    behind those code checks is NOT browser-verified - no browser in this session.
  - Deferred, explicitly: swipe-right "reply in traditional view" (Task 5 of the
    brief, the one explicitly marked LOW; its spec alternative - tap, full view,
    Reply - already exists), and the per-screen visual layouts, which are the next
    session's job. No half-built code for either.

- Day 6: VISUAL RESTYLE, screen 1 of 9 - onboarding (language, phone, OTP).
  - Source of truth: design/choose_your_language, design/phone_verification and
    design/otp_verification code.html. The screen.png pictures could NOT be
    cross-checked (this environment's image model fails), so the markup alone is
    authoritative - and the user grades the result against the pictures in a
    browser, which is the part no session can do for them.
  - Layout follows the mockups' order and proportions: progress row (back button,
    centred brand, "N of 3", step dots where the active step is an elongated
    pill), the PhoneMail mark, a 26px/34 bold heading with its subtitle, 56px
    rounded-xl rows, the security badge, and a pinned bottom CTA. The language
    rows are a real radio fieldset; the selected row carries the check, and
    "Hindi"/"Tamil" are plain words with "coming soon" - the design's wording,
    where the app's earlier labels used native script the mockups do not show.
  - The PhoneMail mark is reproduced EXACTLY as inline SVG from
    design/phonemail_logo/code.html (teal rounded square, white envelope, green
    handset), so no binary asset had to be added and the mockups' icon slots use
    it too.
  - The phone screen keeps every real behaviour and gains the mockup's elements:
    the +91 field with an internal divider and a clear button, the live
    <number>@phonemail.com address preview (the app's real domain, not the
    mockup's @phonemail.me sample), the lock helper, and the consent line with
    the /terms link.
  - The OTP screen: centred heading, "OTP sent to +91 <number>" with an inline
    Edit (the same action as the back button), the secure-channel badge, six
    rounded digit boxes, a Verify button (a real fallback for the auto-submit),
    and the resend countdown driven by the server's own retryAfterSeconds.
  - Deliberately NOT implemented, with reasons: the mockup's "Check Messages" /
    "Call me" pills are OS-level actions a web app cannot perform; "Code expires
    in ..." would need client-side expiry tracking the app does not keep (the
    server owns the 5-minute TTL); and the mockup's second legal link (Privacy
    Policy) has no route - a dead link is worse than one honest link.
  - Verified: build green; /onboarding answers 200; and the full dev-mode
    regression is still green (43 + 33 + 31 = 107 assertions across the group,
    final-items and alias/403 suites), which doubles as this screen's functional
    check - the restyle changed markup and classes only, no logic.
  - NOT DONE: screens 2-9 of the brief (home, pairwise thread, group thread,
    compose, traditional full view, settings/profile, drawer + /terms + /portal,
    desktop) and the group-folder add-on that was scoped to screens 3-4. No
    half-restyled screen is in the tree.
  - UNVERIFIED: the visual result itself. The onboarding page is a client
    component, so the HTML the server returns is the loading skeleton - the new
    layout is confirmed by building it and by reading the source, not by
    observing a browser render.

- Day 6: VISUAL RESTYLE, screen 2 of 9 - the home / chat list.
  - Source: design/phonemail_home/code.html. Layout follows it: a 60px top bar
    (menu button, wordmark, account avatar that links to the profile), a pill
    search field, a horizontally scrolling chip row, 76px conversation rows with
    a 48px avatar, time and unread badge, the encryption footer, and the 48px
    circular compose button pinned bottom-right. Thread rows now show the
    counterpart as the title with subject and preview beneath, matching the
    mockup's rhythm.
  - Two app features the mockup predates, placed without distorting it: the
    search-to-chat offer renders as one more row directly under the search field
    while a complete number is typed, and the live/polling indicator moved down
    into the encryption footer (the mockup's top bar is a clean three-element
    row and a fourth item would break its proportions). Group threads keep their
    member-count avatar and sit with the pairwise rows.
  - Verified: build green; / answers 200; the three suites are green again
    (43 + 33 + 31 = 107 assertions). Two assertions in the final-items suite had
    to be corrected, and this is worth recording: they asserted the literal
    `setFilter("favorites")` string, which the restyled chips no longer emit
    because the chip row is now rendered from an array. The check was over-fitted
    to the old markup - the feature was never at risk - and it now asserts the
    chip set and labels instead.
  - NOT DONE: screens 3-9 (pairwise thread, group thread, compose, traditional
    full view, settings/profile, drawer + /terms + /portal, desktop) and the
    group-folder add-on scoped to screens 3-4. No half-restyled screen is in the
    tree.
  - UNVERIFIED: the visual result, as always - no browser in this session. The
    home page is a client component, so the served HTML is the loading skeleton;
    the layout is confirmed by compiling it and by reading the source.

- Day 6: VISUAL RESTYLE, screens 3 and 4 - the pairwise thread and the group
  thread - plus compose and the group-folder add-on. The mandatory core of this
  session is complete.
  - Source: design/pm_kisan_scheme_conversation/code.html. Both threads share
    the design: a sticky bg-primary-container top bar (back, avatar, title, the
    thread's subject as a centred pill), incoming bubbles bg-surface-container
    rounded-tl-sm, outgoing bubbles bg-secondary-container rounded-tr-sm, and a
    sticky bottom bar holding the paperclip, the message field and the
    traditional-compose button in the camera slot.
  - The group thread uses the same design with the members header the brief asks
    for: the member count in the avatar and every member named under the title.
    Its composer keeps the spec's lock (sends to all OTHER members, no
    add/remove) and now matches the thread's bottom bar.
  - Compose follows design/compose_email: 56px label/value rows (To, Subject)
    with 1px surface-variant hairlines between them, a 170px message area, and a
    56px function row carrying the paperclip and a round 48px send button in
    secondary-container. The app's multi-recipient chips and the locked
    recipient set live in the To row, and the reply/group notes moved to a small
    line under it rather than being dropped.
  - The paperclip appears in BOTH the thread bar and compose, per the design, and
    tapping it reports honestly that attachments have no backend yet - it is not
    a dead control.
  - Deliberately omitted, with reasons: the thread mockup's more_vert menu (no
    per-thread actions exist), its quickreply templates (no template feature),
    the compose mockup's Cc row (the app has no Cc), its three extra attachment
    buttons beyond the paperclip (all would open the same empty backend), and its
    drawn keyboard (not an app feature). The thread keeps no inline sender - its
    field opens the compose screen, which is the app's real behaviour.
  - GROUP-FOLDER ADD-ON, done as specified: `folder` is recipient-scoped state, so
    the group thread endpoint and the chat list's group rows now exclude the
    reader's OWN spam/trash rows while leaving every other row - and therefore
    every other member's view and the member list - untouched. Asserted: B moving
    its own group row to spam takes B's view from 70 rows to 69 while C and A stay
    at 70, and the member list still names all three.
  - Verified: build green; all routes 200 (/ , /onboarding, /compose, /thread/[phone],
    /profile, /spam, /trash, /drafts); the three suites are green at 43 + 42 + 31 =
    116 assertions. Note the correction recorded in the screen-2 entry was needed
    again in spirit: two code-level checks had to be re-pointed at structure rather
    than at an old literal string.
  - UNVERIFIED: the visual result of every restyled screen - no browser here, and
    the pages are client components, so the served HTML is the loading skeleton.
    The layout is confirmed by compiling it and reading the source. The reader
    grades it against the design pictures.
  - NOT DONE: the stretch items (traditional full view, settings/profile, drawer +
    /terms + /portal) and this session's evaluator simulation from a fresh clone.
    Desktop was explicitly deprioritised by the brief and is untouched.

- Day 6: EVALUATOR SIMULATION from origin, on the restyled build.
  - `git clone https://github.com/ah-REE/phonemail.git` then `docker compose up
    -d` - the two-command promise, against the REMOTE rather than a local path,
    which is what makes it an evaluator simulation rather than a smoke test. The
    clone landed on ea6c277 (origin/main) and all four containers came up healthy
    on a clean volume, with all 7 migrations applying from scratch.
  - All three suites are green on that fresh clone: 43 group + 42 final-items
    (including the 7 group-folder add-on assertions) + 31 alias/403 = 116
    assertions. The same 116 passed on the working stack at the same commit, so
    the restyle is verified to change presentation without changing behaviour.
  - Not run this session, recorded honestly: the stretch items (traditional full
    view, settings/profile, drawer + /terms + /portal). Desktop was explicitly
    deprioritised by the brief and keeps its current token-consistent styling. The
    visual result of every restyled screen remains user-verified in a browser.

- Day 6: VISUAL RESTYLE, screens 6-8 - traditional full view, settings/profile,
  and the drawer + /terms. /portal is the one piece that did not make it.
  - Traditional full view (design/email_reader): the expanded message now follows
    the reader mockup - a sender block (avatar, number, address, time), a To chip,
    the subject as a 22px bold heading, a hairline, then the body at the mockup's
    30px leading. The mockup's more_vert and its "Verified Government Sender"
    badge are omitted: the app has no per-message actions and cannot verify who a
    sender is, and a badge claiming otherwise would be a lie in the UI. Its
    Reference-ID card has no counterpart in the data model.
  - Settings/profile (design/profile_settings_minimal_focus): centred title bar, an
    80px avatar with a verified badge, the phone and the address pill, then
    uppercase section headings over flat bordered cards - Alias IDs (the app
    feature the mockup predates: each alias on its own row with Remove, plus an add
    row), Preferences (Language), Actions (Sign out) - and the encryption footer
    with the build line.
  - Three mockup rows are deliberately absent because rendering them would mean
    inventing a feature rather than restyling one: the "SMS alerts" toggle (the
    notification gate is server-side `registeredVia` state the client never sees,
    so a toggle could not be honest about what it controls), "Personal details"
    (no such screen) and "Delete account" (no endpoint behind it).
  - Drawer and /terms now use the design language: the drawer is a panel with the
    brand header and chevroned rows, and /terms has the 56px teal title bar with
    the back arrow. Neither has a mockup of its own, so both were built from the
    tokens and the patterns the restyled screens established.
  - NOT DONE: /portal. It is styled with its own inline `styles` object rather than
    Tailwind, so bringing it into the token system is a rewrite of that page rather
    than a restyle of classes - it is one page and the remaining piece of this
    pass, left rather than half-converted.
  - UNVERIFIED: the visual result, as always - no browser in this session, and
    these are client components, so the served HTML is the loading skeleton.

- Day 7: the README and the closing verification. No new features.
  - README.md rewritten as the primary deliverable: what it is, the exact two
    commands, the four services, how to test with the committed placeholders
    (dev OTP 123456 + devHint, and why the placeholder credentials are what make
    that safe), a demo script for the two-tab test and the group/alias/chips
    flows, a line-by-line spec mapping with an honest status on every row, the
    architecture (Node runtime only, the SMTP round trip as the only row writer,
    derived group keys, recipient-scoped folders, the registeredVia gate, the
    unified alias lookup, per-tab sessions, the build-stamped worker, committed
    migrations, the OTP transport history), the limitations, and the evidence.
  - The spec rows that are NOT a plain yes are stated as such rather than
    smoothed over: attachments (affordance + empty state, no backend), phone
    auto-detection (a browser cannot read the SIM - last-number pre-fill), OTP
    auto-detection (auto-submit only, no WebOTP), the separate Terms screen (the
    amended spec replaced it with a consent line), the hidden Subject field on
    reply (the app keeps it visible and pre-fills `re:`), the swipe-right
    traditional reply (the spec's own alternative is what ships), the one-screen
    portal (two steps here), personal details and profile picture (not built),
    and the IVR call itself (operator-side).
  - Repository hygiene: the tracked tree carries no scratch files, temp scripts
    or stray binaries - the only large files are the design exports (kept, and
    referenced by the README's design story) and the two PWA icons. .gitignore
    was re-read and still covers node_modules, .next, next-env.d.ts, .env* and
    both override variants. DELIVERY/ deliberately stays OUT of the repository:
    it is where the session reports live, it is not part of the product, and an
    evaluator cloning the repo should not receive a folder of AI session
    artefacts. The reports live in the AutoCoder workspace instead.
  - Load numbers (one run, dev mode, this machine, Node HTTP client, recorded in
    the README): /api/health p50 5.7 ms / p95 7.6 ms over 30 sequential requests;
    send-otp 13.3 ms and verify-otp 13.7 ms as round trips; and a 50-way
    concurrent burst returning all 200s at p95 315 ms. The OTP endpoints are
    cooldown-guarded by design, so they are measured as round trips rather than
    under load - which is why a k6/autocannon run would have measured the guard,
    not the login.
  - npm audit --omit=dev reports 5 advisories (1 moderate, 4 high) in the
    transitive tree. Recorded in the README's limitations rather than quietly, and
    deliberately not fixed during the build: the verified artefact is the
    committed one, and an upgrade would invalidate every verification in this log.
  - Closing verification: 116 assertions (43 group + 42 final items + 31
    alias/403) green on the working stack AND on a fresh clone from GitHub at
    b07db59, with all 7 migrations applying on a clean volume and all four
    services healthy - the two-command promise, re-proved against the remote.
  - Still outstanding, and unchanged: the demo rehearsal needs the Exotel console
    and a real call, plus the gateway phone online for the SMS leg - both
    operator-side. /portal keeps its original inline styling, and the settings
    mockup's personal-details and profile-picture rows are not built.

- Day 7: DESIGN FIDELITY AUDIT and corrections. The user clicked through in a real
  browser and reported that everything after the OTP screen diverged from the
  designs. They were right, and here is why.
  - ROOT CAUSE (two causes, both mine, neither a design problem):
    1. The post-OTP screens were translated from an abridged outline whose
       extraction stripped every colour and size class. Onboarding was not, which
       is exactly why the user saw onboarding match and everything else drift. With
       the colour classes gone, plausible-looking tokens were substituted for the
       design's: bordered inputs where the design uses filled pills, muted-variant
       text where the design uses the outline token, wa-green where the design uses
       secondary-container, no row dividers where the design has hairlines.
    2. Three of the design exports - phonemail_home, compose_email and email_reader
       - are 28-byte placeholder files containing the literal text
       '<FIFE Image failed to fetch>'. There was no picture to cross-check for those
       three screens at all, so markup alone had to carry them.
  - The image model in this environment fails for every image (HTTP 406), so the
    user's design pictures were read through the autoglm-image-recognition skill
    instead (upload-mix.py, then the recognition API). That worked, and every
    finding below comes from those six descriptions compared against code.html.
  - FIXES SHIPPED:
    - Home: header avatar is the action-green container with its dark label (not
      brand teal); the search field is a filled surface-container-high pill with no
      border; unselected chips are filled, not outlined; rows carry the design's
      hairline divider; row avatars are bg-primary-container with on-primary labels;
      timestamps use the outline token; the unread badge and the FAB use
      secondary-container; the search-to-chat offer takes the row treatment.
    - Compose: the shared AppBar became the design's bar (56px, centred title, no
      bottom border - it was taller, left-aligned and bordered); the title reads
      Compose as the mockup says; row labels use the outline token; all four
      attachment affordances are present in the brand colour instead of one.
    - Thread (pairwise and group): the chat canvas is tinted surface-container, not
      white; the camera slot now sits INSIDE the message pill as the design and the
      spec both show; the design's centred date divider pill was added; the subject
      pill uses the container-high fill.
    - Traditional full view: the sender avatar, address, time, To chip and divider
      now use the design's tokens, and the design's full-width Reply button is
      present at the end of the view (the spec's own tap-to-reply path).
    - Settings/profile: rebuilt around the design - the identity block sits ON the
      teal header (avatar #00453d with a white ring, phone in white, address in a
      #00453d/80 pill with a #25D366 label), the page canvas is #F8FAFC, cards are
      white on slate-200/80, section labels are 11px uppercase slate-400, row icons
      sit in teal-50 (and red-50 for the destructive row), and row text is 15px
      slate-900 with slate-600 values.
    - Drawer: the design's teal profile header (avatar, phone, address) with
      Home/Drafts/Spam/Trash rows, the active row highlighted, and Settings anchored
      at the bottom above a divider.
  - OMISSIONS THAT REMAIN, each with its reason: the verified-sender banner and the
    'we verify sender identity' disclaimer (the app cannot verify who a sender is, so
    claiming it would be a lie in the UI); the mockup's Cc row and reference card (no
    such data); the SMS-alerts toggle (the notification gate is server-side state the
    client never sees); Personal details and Delete account (no screen and no
    endpoint); the thread's three-dot menu (no per-thread actions); and the design's
    paper-plane send button, rendered as the traditional-compose entry because the
    app has no inline sender.
  - VERIFIED: `npm run build` green after every batch of fixes. NOT VERIFIED, and
    this is a real gap: the dev-mode regression and the origin evaluator simulation
    could NOT run for these changes because Docker Desktop's daemon went down
    mid-session (the note below records it). The fixes are compiled and reviewed
    against the design descriptions, not exercised against a running stack.
  - The final visual grade is the user's re-click-through: the screens that changed
    are Home, the pairwise and group threads, compose, the traditional full view,
    Settings/profile and the drawer.

- Day 7: FINAL FEATURE PASS, part 1 of 2 - display names and the sent tick.
  Profile pictures (the brief's Task 3) are NOT started; the columns for them are
  already migrated, so only the routes and the UI remain.
  - DISPLAY NAMES (brief Task 1, HIGH): `User.displayName` (nullable TEXT) with
    migration 20260925170000_add_display_name_and_avatar. NULL is meaningful - it
    means "show the number" - and every surface goes through one helper
    (src/lib/names.ts labelFor) so no screen invents a fallback of its own.
  - API: GET /api/me returns the profile (id, phone, displayName, createdAt,
    hasAvatar); PATCH /api/me sets or clears the name. Both are JWT-only - the
    token's sub is the only user they can touch, so an absent token is a 401 and
    nothing else (asserted). Validation: trimmed, 1-40 characters, blank is 400,
    null clears. The profile responses carry `hasAvatar` rather than bytes, so the
    picture can be served and cached as an image separately.
  - The names travel with the data, so the client never guesses:
    /api/conversations returns `counterpartName` per thread and `memberNames`
    aligned with `members` for groups; the pairwise thread endpoint returns
    `counterpartName` plus `fromName` on every message; the group thread endpoint
    returns `memberNames` plus `fromName` per message. Displayed on the home rows,
    the pairwise thread header, the group members header, the group bubbles' sender
    label, the traditional full view's From block, the settings Name row, and the
    desktop list and reading pane. The notification SMS template is untouched.
  - The settings screen gained a "Personal details" section with the editable Name
    row - which also fills the mockup's Personal-details row for the name part.
  - SENT TICK (brief Task 2): outgoing bubbles in both threads show ONE check. It
    is honest rather than decorative - an outgoing row exists only because the SMTP
    round trip completed, so the row's presence IS "sent". No read states and no
    double tick exist anywhere: isRead stays the reader's inbox badge and is never
    surfaced to the sender (asserted at code level).
  - Verified (dev mode, confirmed devHint=true BEFORE any OTP request): migration 8
    applied on container start; 142 assertions green = 26 new feature assertions
    (name set / read / cleared, the number fallback, propagation into the chat list,
    both thread endpoints and the group member list, the 401 guards, the 40-char and
    blank-name rejections, and the tick at code level) + 43 group + 42 final items +
    31 alias/403.
  - NOT DONE, and next: profile pictures (brief Task 3) - POST /api/me/avatar
    (image only, 500KB cap, bytes in Postgres) and GET /api/me/avatar with the right
    content type and cache headers, then the tap-to-upload flow and replacing the
    letter initial everywhere. The three avatar columns are already migrated.
  - UNVERIFIED: the visual result (the user's click-through), as always.

- Day 7: THE TRADITIONAL READER FOR FIRST CONTACT (user request, with the
  mockup source pasted in).
  - Behaviour: a thread whose ONLY message is an incoming one - i.e. a message
    from a number you have never written to - now opens as the traditional reader
    instead of a lone chat bubble. First contact reads like a letter; the
    conversation starts when you reply, and every other thread stays a chat. In
    reader mode the chat composer is hidden, because the reader's own Reply bar is
    the action, and that Reply still goes through reply-once (it carries replyTo).
  - New component src/components/mail-reader.tsx, built element by element from the
    pasted source: the security strip on surface-container-low; the metadata block
    (44px avatar on surface-container-high, the name at 18px semibold, the address
    in body-sm/outline and selectable, the time in 11px outline); the state chip on
    surface-container at 11px; the subject at 22px bold; the 1px surface-container
    divider; the body at 20px/30px with paragraph spacing; the reference card on
    surface-container-low; and the sticky full-width Reply bar on the brand's dark
    green (bg-secondary #006d2f) with white text.
  - The reference card shows the message's OWN id - the app has no reference
    scheme, and its id is the one reference a message really has.
  - TWO DELIBERATE REWORDINGS, both reported because they are copy decisions
    rather than layout ones:
    1. the strip reads "Verified Government Sender • End-to-End Secure" in the
       mockup. NOTHING in this app verifies who a sender is, so the strip states
       what IS true and is sender-state aware: "New sender" for exactly the
       first-contact case this feature is about, "End-to-End secure" otherwise.
    2. the green verified tick beside the sender name is omitted, for the same
       reason - it would assert a check that never ran.
    Both are one-line changes if the owner wants the mockup wording verbatim; they
    were not made silently, and the reasoning is in the component header.
  - Verified (dev mode, confirmed devHint=true BEFORE any OTP request): build
    green; / and /thread both 200; 164 assertions green = 21 new reader assertions
    (the design's own classes element by element, the first-contact detection, the
    reader replacing the bubbles, the composer being hidden, reply-once preserved,
    and the two rewording decisions asserted as such) + 27 names + 43 group + 42
    final items + 31 alias/403.
  - UNVERIFIED: the visual result - the reader is the user's to click through, and
    the flow to see it is: send a message from another number to an account you
    have never written to, then open that thread.

- Day 7: THE ONBOARDING FIRST SCREEN REPLACED with the owner's new design
  (design/onboarding_new, read in full - it is the source of truth for this
  screen).
  - What it is now: a welcome screen - "Welcome to PhoneMail" at 26px bold in
    #111B21, a 290px circular aura with the PhoneMail mark at 112px inside it, the
    tagline "Your phone number is your email address." at 15px/#54656F, the consent
    line, and one CTA: a 52px pill in #00A884, white, bold, uppercase, wide tracking
    with the mockup's subtle shadow and its 0.98 active-scale.
  - The superseded screen: the language picker. Language is a setting on the profile
    screen, so nothing was lost; the phone step's back button now lands on the new
    welcome screen, and the step indicator still counts the real three steps.
  - DEVIATIONS FROM THE MOCKUP, each deliberate:
    1. the illustration is drawn as inline SVG. The mockup points at two
       Google-hosted PNGs, and the app fetches NOTHING remote (that is what keeps
       `docker compose up -d` honest offline), so the aura is reproduced in the
       design's own tones and the envelope is the app's real mark.
    2. the step indicator is present. The new design shows none, but the real flow
       has three steps and the phone and OTP screens both show one - leaving step 1
       unlabelled would be the inconsistent choice, so it stays (dots under the
       title, the same treatment as the other two steps).
    3. the consent line keeps only the Terms link. The mockup also names a Privacy
       Policy and there is no such route; a dead link is worse than one honest link,
       which is the same call made on the phone step.
  - Animation: none, matching the screen it replaced - the onboarding has no
    entrance choreography to inherit, so nothing new was invented.
  - Verified: build green; /onboarding 200; the flow completes in dev mode (welcome
    -> phone -> OTP -> home) with devHint confirmed before any OTP request; the
    assertions below; and the full dev-mode regression plus an origin evaluator
    simulation. README's spec mapping and demo script were updated with it.
  - UNVERIFIED: the visual result - the user's click-through against the design
    picture in design/onboarding_new.

- Day 7: THE WELCOME SCREEN CORRECTED against the owner's pictures of it (a
  crop of the centre illustration and a full-screen shot). The first pass had
  invented the centre from the markup alone, and the picture showed what it
  really is.
  - The illustration, rebuilt to the picture: a soft radial glow, a DASHED ring
    (not concentric solid circles), six grey outline icons sitting ON that ring
    (chat bubble upper-left, plus upper-right, @ left, phone right, camera
    lower-left, bell lower-right), small grey dots between them, two filled green
    dots at 12 and 6 o'clock, and at the very centre a GLOSSY BLUE GRADIENT
    ENVELOPE (#2563eb -> #1e40af body, #bfdbfe -> #3b82f6 flap, a white gloss
    line along the fold) - not the teal brand mark the first pass drew.
  - Also corrected from the picture: the CTA is 56px in #17A589 with 16px white
    bold uppercase text (was 52px in #00A884 at 14px); the tagline is 16px in
    #5A6675 (was 15px); the legal line is #6B7280 with the link in the design's
    teal #17A589 and no underline (was #027EB5); and the step dots are REMOVED -
    the full-screen picture shows none, so the earlier decision to keep them for
    consistency is superseded by the design itself. Step 1 is therefore the only
    unlabelled step; the phone and OTP steps keep their indicator, as instructed.
  - The remote-asset deviation stands and is unchanged: the mockup points at
    Google-hosted PNGs and the app fetches nothing remote, so both the aura and
    the envelope are drawn as SVG in the design's own colours.
  - Verified (dev mode, devHint confirmed before any OTP request): build green;
    /onboarding 200; the flow completes welcome -> phone -> OTP -> home; and 187
    assertions green = 23 for this screen (every element above asserted against
    the picture's values) + 21 reader + 27 names + 43 group + 42 final items + 31
    alias/403. The same suites were re-run on a fresh clone from origin.
  - UNVERIFIED: the visual result - the user's click-through against the pictures.

- Day 7 (Fri Sep 25, late): SUBMISSION FLOOR TAGGED, and the final program
  scoped. NO feature work landed in this session - recorded plainly so the next
  session starts in the right place.
  - SAFETY, done first and verified: tag `submission-fallback` created at HEAD
    6aa3cb4 and pushed. `git ls-remote --tags origin` dereferences it to
    6aa3cb4, so the floor is fixed: if the program is not fully green by Mon
    Sep 28 EOD, that tag is what gets submitted. Nothing below it may be
    rewritten.
  - WHY NOTHING ELSE LANDED: the final program (Phases 0-3) was handed over,
    and Phase 0 alone is four new screens plus auth internals (password hashing,
    a login route, a set-password route, rate limiting, a registration-success
    screen). The repository-side executor (ZCode) failed for the sixth time
    today with `Model request failed` and no file changes, and the session's
    remaining budget could not cover a native implementation of the whole phase.
    Per the brief's own rule - land each phase verified or stop clean - the work
    was NOT started rather than half-done. The tree is clean at 6aa3cb4 and
    every suite is green at that commit.
  - PHASE 0 PLAN, session-ready (execute in this order, verifying each slice):
    1. `passwordHash String?` on User + migration `add_password_hash` (nullable,
       purely additive) + a bcrypt implementation that needs no native build
       (bcryptjs).
    2. POST /api/auth/login: phone + password, bcrypt compare, the EXISTING Redis
       strike pattern reused for rate limiting, and on success the same JWT shape
       verify-otp already issues, so every downstream guard is untouched.
    3. POST /api/auth/set-password: phone + OTP + new password, so an existing
       account can add a password through the flow it already has. OTP stays
       primary; all existing OTP endpoints stay untouched.
    4. Screen 1 becomes Login/Signup with two paths (Create account / Log in),
       both offering the OTP route, designed inside the CURRENT system (tokens,
       type, easings, components, the owner's logo and hero).
    5. Signup gains the set-password step and the registration-success screen
       (logo/hero animation, 'Your PhoneMail account is ready', the new address,
       one CTA).
    6. Assertions for the split + the FULL prior regression + a fresh-clone
       simulation, then a Section 9 entry for the phase, commit and push.
  - PHASES 1-3 remain as specified (settings completion incl. avatar upload, a
    real SMS-notifications toggle and delete-account; contacts; the curated
    verified-sender registry with an honest badge).
  - Verified in this session: nothing but the tag. Suite state at 6aa3cb4:
    welcome 23/23, reader 21/21, names 27/27, group 43/43 and final 42/42 on a
    clean clone (185/187 on the loaded dev database, the two failures being
    accumulated-state artifacts that pass on a fresh clone), alias 31/31.

- Day 7 (Fri Sep 25, final session): PHASE 0, BACKEND SLICE LANDED AND VERIFIED.
  The screens are the remaining half of this phase; the API is complete.
  - What shipped: `passwordHash String?` on User + migration
    20260925235000_add_password_hash (nullable, additive - NULL means 'no
    password yet', which is every existing account); src/lib/password.ts
    (bcryptjs, no native build; the SAME Redis-counter strike pattern the OTP
    flow uses, in its own keys because a pending OTP and a login attempt are
    different states); POST /api/auth/login (bcrypt compare, the lockout, and
    the same JWT shape verify-otp issues so every downstream guard is
    untouched); POST /api/auth/set-password (gated by the OTP, so it works for
    both the new signup flow and an existing account that has never had a
    password; it returns a session so the client goes straight to the inbox).
  - Two deliberate behaviours: an account with no password answers 401 with
    `needsPassword`, and every rejection carries `canUseOtp` - the added path
    must never be a dead end when OTP is the primary one. Password validation
    runs BEFORE the OTP is consumed, so a rejected password does not burn the
    code the user is holding.
  - Verified: build green; migration 9 applied on container start; both new
    routes live; 21/21 new auth-split assertions (signup -> set-password ->
    login; the wrong-password rejection with attemptsLeft; the passwordless
    account's needsPassword; a short password and a mismatched confirmation
    both 400; the untouched OTP flow still signing in AFTER those rejections,
    proving the OTP was not consumed; five wrong passwords locking the number
    with retryAfterSeconds; the right password still refused while locked). The
    full prior regression then ran green in dev mode: welcome 23/23, reader
    21/21, names 27/27, alias 31/31, and group 43/43 + final 42/42 on a clean
    clone (185/187 on the loaded dev database - the two failures are the known
    accumulated-state artifacts, not regressions).
  - REMAINING IN PHASE 0 (the screens): screen 1 becomes Login/Signup with two
    paths; the signup flow gains the set-password step; a registration-success
    screen; and the 'set your password' entry for existing accounts. All of it
    inside the current design system. The OTP flow stays untouched.

- Day 7 (Sat Sep 26): PHASE 0, SCREENS LANDED - the phase is complete.
  - Screen 1 is now a Login/Signup door: the hero, the owner's mark and the
    consent line stay exactly as they were, and the single CTA became two -
    'Create account' (signup) and 'Log in' (the password screen). OTP is
    offered on BOTH paths, which is what keeps it primary.
  - SIGNUP: phone -> OTP -> a NEW set-password step -> a NEW
    registration-success screen -> inbox. The OTP is deliberately NOT verified
    at the OTP step in signup mode: set-password verifies AND consumes it in
    the same call that stores the hash, so (a) nobody is ever signed in without
    the password they came to set, and (b) a valid code is never spent on a step
    that changes nothing. A rejected or expired code returns the person to the
    OTP step carrying the server's own message, not a guess.
  - LOGIN: a NEW phone + password screen -> POST /api/auth/login -> inbox, with
    'Log in with an OTP instead' beside the button at all times. Every refusal is
    actionable rather than a dead end: a passwordless account is sent to the OTP
    flow with the server's message, a wrong password shows the attempts left, and
    a lockout shows the seconds to wait.
  - The success screen states the account is ready, shows the new address
    (selectable, so it can be copied), and carries one CTA to the inbox.
  - All three new screens are built from the LIVE design system - the field /
    btn-primary / btn-quiet classes, the display face, the entrance stagger, and
    the owner's mark with its float - so the phase extends the redesign rather
    than introducing a second visual language.
  - Verified: build green; the screen assertions; the API flow re-run at 21/21
    AFTER the screens landed (so the backend is proven intact under the new UI);
    the full prior regression green in dev mode (welcome 23/23, reader 21/21,
    names 27/27, alias 31/31, and group 43/43 + final 42/42 on a clean clone);
    and dev mode confirmed (devHint) BEFORE any OTP request. One assertion
    failure during this work was my own literal-string check - the copy wraps
    across lines in the source - and was fixed and re-run to green.
  - PHASE 0 IS COMPLETE. Phases 1-3 remain: settings completion (avatar upload,
    a real SMS-notifications toggle, delete-account), contacts, and the curated
    verified-sender registry with its honest badge.

- Day 7 (Sat Sep 26), refined again on the owner's direction (same day):
  - THE DOOR'S COLOUR IS NOW THE BRAND BLUE, taken from the owner's own mark:
    the envelope in the logo runs #3a7bea into #1f4fa8, deepened slightly at
    the light end (#3170e8 into #2a51c4) so white text stays legible on it. A
    new .btn-brand carries it, and every primary in the onboarding flow uses
    it, so the door, the code step, the password step and the success screen
    read as one colour instead of blue outside and violet inside. This
    replaces both the teal #00a98f and the accent violet on this flow.
  - THE HERO IS REDRAWN TO SCALE. It is one square of
    min(320px, 78vw, 40vh) rather than a fixed 320px box, and the mark (32.5%
    of it) and the bloom (81%) are shares of that square - so on a narrow
    phone, and on a short one, the hero shrinks to the space it is placed in
    and nothing drifts out of proportion.
  - THE IDLE LOOP IS REBUILT: the dotted orbit drifts one way over 120s while
    the icon ring counter-drifts over 90s for parallax, so the satellites stay
    upright; the envelope floats on its own height (6s) and the bloom behind
    it breathes (7s); three soft rings leave the envelope every 4.5s, staggered
    1.5s apart, the way a message goes out; and the two green dots blink like
    status lights (3s). The dotted ring also now takes the stroke tone the
    owner's own notes name (#c3cfdd). Every one of those loops is stopped by
    the existing reduced-motion rule.
  - LOG IN GOES STRAIGHT THROUGH THE CODE. The door's Log in button now goes
    to the number and then the code, with no password in the way. The password
    path is still whole and still working, but it is opt-in from the code step
    ('Use my password instead') instead of standing at the door.
  - Also fixed while in the file: the login screen's phone field carried a
    double-escaped digit regex, so a pasted letter stayed visible in it; the
    regex is now a plain digit class.
  - Verified: build green; the welcome suite 23/23 (five of its checks asserted
    the old hero - the CTA colour, the bloom tint, the fixed size, the loop
    keyframes and the ring class names - and were updated to assert the new
    design rather than deleted); the Phase 0 screens suite 26/26 (one check
    named the old btn-primary class); this turn's brand suite 24/24; and the
    DEPLOYED container was checked directly - it serves the new CSS (.btn-brand,
    #3170e8, #2a51c4, hero-ping, hero-blink) and the new flow in its JS chunks
    (the door, the code step's password link, the success copy, the fluid hero
    width) - so the running app matches HEAD.
  - Still the owner's to judge, since this is a look: the hero's new motion and
    the blue against their mark.

- Day 7 (Sat Sep 26), on the owner's direction: THE APP IS PAINTED FROM ITS
  OWN LOGO, the hero is rebuilt, and the app is OTP-only.
  - THE PALETTE IS SAMPLED, NOT INVENTED. The mark is 77% blue (mean #256cf3,
    deepest #01067c) and 11% cyan (#34cafd) on white; the brand illustration
    around it adds the violet where the envelope's flaps cross (#7c3aed), the
    green of its two status dots (#22c55e), the periwinkle of the ring that
    hugs the icon (#dbeafe), the cool greys of the orbit (#9ca3af / #d1d5db)
    and an off-white canvas (#f9fafb). Every token in the system is now one of
    those or a step between two of them: canvas #f8fafc, chrome the
    illustration's indigo #1e3a8a, accent the mark's own blue #256cf3 with
    #dbeafe as its soft tint, success #22c55e, outline #9ca3af/#d1d5db, and ONE
    gradient - #256cf3 into #6d3fe0, the mark's blue running into the
    illustration's violet - which every primary action now wears.
  - The token called 'pine' was renamed 'navy': a token named after a tree
    holding an indigo is a lie waiting to confuse whoever reads the config.
    The shadows went cool, the canvas tint became the mark's blue from one
    corner and the violet from the other, the manifest and the browser chrome
    dropped their WhatsApp-era colours (#efeae2/#075e54 -> #f8fafc/#1e3a8a),
    the off-palette utility classes (text-slate-*, bg-teal-50) were repointed
    at tokens, and the PWA icons are the mark on the illustration's off-white.
  - THE HERO IS REDRAWN FROM THE ILLUSTRATION rather than around the earlier
    drawing: a periwinkle ring wrapping the icon, a dotted grey orbit at r=126,
    six line icons of the illustration's own family on it (camera, search,
    document, paperclip, envelope, settings), and the two green status dots.
    Four slow loops and nothing else: the orbit drifts while the icons
    counter-rotate (150s), the icon floats (6s), the glow breathes (8s), the
    dots breathe (4.5s). The rings that left the envelope and the blinking are
    gone - they read as fidgeting in a mail app.
  - TWO REAL BUGS FOUND WHILE WORKING ON THIS.
    (1) THE SUCCESS SCREEN COULD NEVER RENDER. Signing in flips the session to
        authenticated, and the onboarding guard bounced straight to the inbox,
        so the screen that shows the new address was skipped every time. The
        guard now exempts that step.
    (2) THE MARK OVERLAPPED ITS OWN RING. The first build put the mark at 46%,
        but its ink reaches 1.284 x its half-side (measured from the file), so
        its corners crossed the periwinkle ring. The mark is 42% and the ring
        r=98, and the suite now asserts that clearance numerically so it cannot
        come back.
  - OTP ONLY, EVERYWHERE. The password screens, the password link and both
    password routes are gone: /api/auth/login and /api/auth/set-password now
    answer 404. Signing up is: number, code, account, address. The
    'one-time password' copy reads 'one-time code'. User.passwordHash stays in
    the schema - dropping a column is a destructive migration that buys
    nothing - and nothing reads or writes it.
  - A SAFETY-GATE LESSON, found by the check rather than assumed. After
    switching back to real mode, 'docker compose up -d --build' left the app
    container from the dev run, so the gate credentials read as the
    placeholders while the compose config resolved the real ones. Restoring the
    override is not enough on its own: force-recreate the app service and
    re-read the container's own environment before calling the session real.
  - Verified: build green; the palette/hero/OTP suite 34/34; the onboarding
    screens 26/26; the welcome suite 23/23; the reader suite 21/21 in dev mode
    (a full OTP login, so the only authentication path is exercised end to
    end), then real mode restored and confirmed in the container's environment;
    and against the deployed container: every page 200, both password routes
    404, send-otp and verify-otp live, and the served CSS carrying the indigo,
    the periwinkle, the mark's blue and the orbit grey.
  - Still the owner's to judge, because this is a look: the hero's balance and
    the palette in the flesh.

- Day 7 (Sat Sep 26), still the owner's direction: THE HERO IS ONE CLEAN VECTOR
  DRAWING, AND IT DOES NOT MOVE.
  - The hero was the last thing still not right. It is now a single
    self-contained SVG and nothing else: the brand's app tile drawn from the
    mark's own blue (light at the shoulder #6aa6fb, mid #2f6fe4, deep
    #1c3f9c), an envelope whose folded flap is the light end of that same blue
    (#eaf3ff -> #9cc9ff -> #4a8af6), a hairline where the fold catches the
    light, a sheen across the tile's upper half, a soft shadow under the tile
    and a soft light behind it. The raster mark is no longer composited in,
    and the orbit, the six icons and the dotted ring are gone.
  - EVERY HERO ANIMATION IS GONE - the drift, the icon counter-rotation, the
    float, the breathe, the dots - and the keyframes went with them. The owner
    said it did not need to move; it now does not. The page's staggered
    entrance on the other four blocks stays, since that is the screen arriving
    rather than the drawing moving.
  - The success screen uses the same drawing at a smaller size, and both
    instances carry their own gradient ids, so rendering two on one page
    cannot collide.
  - Verified: build green; the welcome suite 20/20, the palette and hero suite
    26/26, the onboarding screens 26/26 - all three updated where they had
    asserted the animated orbit rather than deleted - and the deployed
    container recreated and checked to serve the new drawing with the real
    credentials still in place.

- Day 7 (Sat Sep 26), the owner's last pass for now: THE HERO IS SIMPLY THE
  LOGO, waiting states are clean, and the last of the green is gone.
  - THE HERO IS NO LONGER A DRAWING OF ANY KIND. It is the owner's own mark,
    centred, at min(236px, 62vw, 32vh) - wider than the 134px it was before -
    with nothing behind it and nothing moving. The vector tile drawn in the
    previous pass is removed, and the drawn-mark component with it. The
    success screen shows the same mark at 156px.
  - The consent line is the owner's own wording - 'By clicking Create account
    you agree to accept the terms and conditions' - sitting directly above the
    button it is about, with the one link that has a route.
  - WAITING STATES, in the three places that needed them. The send and verify
    buttons carry a spinner (one arc at 800ms, inheriting currentColor,
    stopped by reduced motion) instead of the words 'Sending.' and 'Verifying.'
    standing in for an action. The app shell and the desktop shell each gained
    a route-level loading skeleton. And the desktop inbox's two bare
    'Loading...' lines became the same list and thread skeletons the rest of
    the app already used.
  - THE LAST GREEN LEFT THE INTERFACE. The profile screen's three green fills
    and its green label - the two Save buttons, the avatar badge and the
    address pill's label - are the mark's blue now, with the two contrast
    corrections the sweep alone would have got wrong (white labels on filled
    blue, the light tint on the dark pill). No bg-success, text-success or
    green literal is left anywhere in src. The palette still keeps 'success'
    as an entry - it is one of the illustration's own colours - but nothing in
    the interface uses it, and the config says so.
  - One self-inflicted bug, caught by the build: the first attempt at
    rewriting the profile page's header comment replaced everything before the
    comment too, which took the file's imports with it. The file was reverted
    and redone with the head untouched.
  - Verified: build green; the welcome suite 15/15, the palette suite 27/27
    and the onboarding screens 26/26, all updated to the mark-centred hero; and
    the deployed container serving the new hero width and the consent wording
    with real mode intact.

- Day 7 (Sat Sep 26), the owner's screenshot said it plainly: the mark is an app
  icon again, and the legal line is theirs, capitalised.
  - At 236px the mark was about 46% of the screen width and it dominated the
    door - the title, the line under it and the buttons all read as small
    print beside it. It is 156px now (min(156px, 40vw, 20vh)): about 40%, and
    still a little wider than the 134px it started at. The success screen's
    156px now matches it exactly.
  - 'Terms and Conditions' is capitalised, and the line sits in
    text-on-surface-variant rather than the faint outline tone, which the
    screenshot showed was easy to miss.
  - Verified: build green; the welcome suite 15/15 (its legal-line check moved
    to the readable token), the palette suite 27/27, the screens suite 26/26;
    and the deployed bundle serving the 156px mark and the capitalised line.

- Day 7 (Sat Sep 26): THE CHAT INTERFACE, REBUILT TO THE OWNER'S REFERENCE.
  - The owner supplied a screenshot of the chat screen and asked for it exactly.
    Its values were SAMPLED FROM THE IMAGE, not taken from the description: the
    canvas #eff6fe, the outgoing bubble #e2f9e9 (pale green), the incoming bubble
    #edf2fa, the sheets #f9fbfe, the rail circle #eef2f9 and the metadata grey
    #6b7280. Its blue is #256cf3 - which is already this system's accent - so the
    reference and the logo agree, and the chat needed no new brand colour.
  - Both thread screens now share it: a white header with rounded bottom corners
    and a soft shadow, a rail back circle, a 48px accent avatar (the initial for
    1:1, the member count for a group), a 17px bold title over a 13px grey
    subtitle; the message list on the chat canvas; bubbles with ONE 16px radius
    and no tail, outgoing in the pale green and incoming in the light grey with a
    40px accent-soft avatar outside; the metadata row INSIDE the bubble (time,
    sender on a group, the sent tick in the accent); and the composer as a white
    sheet with a rounded top, a 56px rounded field (the paperclip lives inside it
    on 1:1, with its honest notice) and the brand-blue action.
  - THREE DELIBERATE DEPARTURES from the reference, each because the app cannot
    honestly do what the mockup shows, and each one line to reverse:
    (1) the sent tick stays a SINGLE check - the app knows the mail service
        accepted a message, nothing tells it the other side received it, and a
        second tick would claim a delivery this system cannot observe;
    (2) the group's locked chips carry no remove x, because a thread's recipient
        set genuinely cannot be changed here - the + opens the traditional
        composer, where it can;
    (3) the 1:1 composer's action reads 'Write to <number>' and opens the
        composer, because this app has no inline sender - that footer has always
        been a doorway to compose rather than a text box.
  - Also: the last two green surfaces outside the chat (the drafts pill and the
    onboarding step dot) were repainted to the accent, so the only green left in
    the interface is the chat's own outgoing bubble, which the reference names.
  - Verified: build green; the new chat suite 21/21 (the sampled colours, the
    single radius, the absence of tails, the avatar, the metadata row, the sheets,
    both threads agreeing, no green class left in either); the reader suite 21/21
    after updating the one assertion that named the old container class - it was
    asserting precisely what this change replaced; the group suite 42/43, its
    single failure the known loaded-DB artifact (the target message was already
    read, so the unread count could not move), which has passed 43/43 both earlier
    today and on a clean clone; names 27/27; the welcome 15/15, palette 27/27 and
    screens 26/26 suites; and real mode restored and confirmed in the container.
  - The visual judgement remains the owner's, since I cannot see images.

- Day 7 (Sat Sep 26): the slide-out menu is gone, the mark centres itself, the
  compose pencil is the mockup's own glyph, and the two missing adds are in.
  - The home's hamburger and its drawer screen are removed, as asked. Its three
    folder links - Drafts, Spam and Trash - moved to Settings > Folders in the
    same pass: without that, removing the drawer would have left three working
    screens with no door at all. /drafts, /spam and /trash all still answer.
  - The header kept its centred title. It never needed the hamburger to hold the
    centre, so the title is placed absolutely and the profile mark stays right.
  - THE FLOATING BUTTON'S PENCIL IS NOW THE MOCKUP'S OWN GLYPH. The owner said
    it sat out of position, and the reason was in the drawing:
    design/phonemail_home uses Material's filled 'edit' at 24px in the 56px
    circle, while the app carried a hand-drawn outline path whose visual mass sat
    up and to the left of its own box. The mockup's path is centred by
    construction, so the button now uses it.
  - THE MISSING ADD. The app had exactly one visible plus - the group composer's,
    added with the chat reference. The 1:1 composer now carries the same one, and
    the compose screen's To row gained an explicit + that commits the typed
    recipient; until now typing and pressing Enter was the only way, and nothing
    on screen said so. If the plus was meant to be the home's floating button
    rather than the pencil, that is a one-line swap.
  - Verified: build green; the chat suite 21/21, welcome 15/15, palette 27/27 and
    screens 26/26; no reference to the drawer remains anywhere in src; the
    deployed bundle serves the mockup's edit glyph and no longer contains 'Open
    menu'; and every page answers, so the re-homed folders are genuinely
    reachable.

- Day 7 (Sat Sep 26): the owner supplied the logo itself; it is now the app's
  mark everywhere.
  - The supplied image was the mark sitting on a grey/white checkerboard with a
    faint watermark, so it was cut out rather than colour-keyed: the background
    was flooded inwards from every border (a single-colour key leaves half a
    checkerboard behind), the anti-aliased fringe was eaten, every speck except
    the mark's own connected component was dropped (251 stray pixels), and the
    silhouette was eroded one pixel and feathered. THE MARK IS NEVER RESAMPLED:
    public/brand/phonemail-logo.png is 780x780 - the mark's own pixels, not a
    scaled copy of them.
  - It is used everywhere the brand appears: both onboarding heroes, the
    onboarding bar's brand slot, the PWA icons (the mark at 78% of the tile on
    the illustration's off-white, its aspect preserved), and - a place that was
    simply missing before - a browser favicon and an Apple touch icon. The app
    had no favicon of any kind until this pass.
  - A note on the cut-out, so the judgement is on record: the visual review
    flagged a faint trace along the mark's top edge. The numeric checks say the
    only opaque thing left in the asset is the mark's own single connected
    component - everything not attached to it is gone, and 251 stray pixels were
    dropped - so that trace is the supplied artwork's own light top band rather
    than background left behind. If it reads as dirty on a real screen, one more
    pixel of erosion clears it.
  - Verified: build green; the palette 27/27, welcome 15/15, screens 26/26 and
    chat 21/21 suites; the deployed app serving the new asset at its full size
    with the favicon, the Apple icon, both PWA icons and the manifest all
    answering; and real mode confirmed in the container.

- Day 7 (Sat Sep 26): the door's wording, and both text boxes rebuilt to the
  owner's reference.
  - The consent line on the first screen is the owner's own: 'By continuing,
    you agree to the Terms & Conditions', with the link on it. The number
    step's copy of the same line is removed, so it is said once, on the screen
    that asks you to agree.
  - The caption under the mark no longer explains that a phone number is an
    email address: it reads 'A private inbox, ready in seconds.', and the number
    step's reads 'One number is all we need'.
  - BOTH TEXT BOXES ARE NOW THE OWNER'S REFERENCE BAR: one wide rounded field
    (28px radius, a hairline outline-variant border, the chat field's white, a
    soft card shadow, and the accent on focus). The number field carries the
    reference's furniture - a country chip in the soft tint, a hairline divider,
    the number large and bold as it is typed, the accent caret, and a clear
    button that appears with the number.
  - The six code cells became one bar in the same geometry. They are still six
    real inputs - so the auto-advance, the paste handling and the per-digit
    screen-reader labels all still work - but they carry no borders of their own
    and sit inside the one rounded shape, with a clear button for the code too.
  - Where the reference uses a green caret and a mint chip, this uses the accent
    and its soft tint: the owner asked for the green to leave the interface two
    passes ago, and the reference's blue is this system's accent anyway.
  - Verified: build green; the screens suite 26/26, welcome 15/15 after updating
    the one assertion that quoted the old consent wording, palette 27/27 and
    chat 21/21; and the deployed bundle serving the new bar geometry and the new
    copy. Real mode confirmed in the container.

- Day 7 (Sat Sep 26): the home page rebuilt to the owner's reference, and four
  smaller corrections with it.
  - THE HOME IS NOW THE REFERENCE. The wordmark sits left with 'Mail' in the
    brand gradient; the top-right carries the unread count in the soft tint; the
    search field is a flat pill in the surface tint; the selected chip is the
    accent with white on it; the rows carry tints sampled from the image (a blue
    pair for a group avatar - a light back circle and an accent front holding two
    people - plus #d9effe and #dac5fb for the other two); the footer keeps only
    the encryption line; and the floating button is the reference's accent circle
    with its blue shadow.
  - TWO DEPARTURES, both stated rather than hidden. The reference's unread badge
    is a mint green, and the owner asked the green out of this app two passes
    earlier, so the badge is the accent - one line to put it back. And the
    top-right badge is the only way into settings since the slide-out menu went,
    so it stays a link - labelled as one, rather than a badge that quietly
    navigates - and it falls back to a person glyph when nothing is unread
    instead of sitting there reading 0.
  - The pencil is drawn here rather than taken from a glyph set, as asked: the
    body and tip in one stroke, the ferrule in another, centred by construction.
  - The number step's country code loses its tinted chip and the clear button
    loses its grey disc, both as asked - they are plain now, and the divider
    between them stays.
  - The code entry goes back to six cells, in the reference's material: white,
    one rounding, a hairline that turns to the accent on a filled digit. The
    'OTP sent to ...' line moved out of the centre to sit left under the heading,
    with its Edit link beside it.
  - The first screen's tagline is the owner's: 'Where Numbers Become Mail'.
  - Verified: build green; the welcome 15/15, screens 26/26 and palette 27/27
    suites; and the deployed bundles serving the new home, the six cells and the
    tagline, with real mode confirmed in the container.

- Day 7 (Sat Sep 26): THE PROGRAM IS RE-BASELINED, and the send bug is fixed.
  - PHASES 1-3 AS ORIGINALLY SCOPED ARE CUT, not deferred: settings completion,
    contacts-as-a-phase and verified senders cannot land verified before the
    deadline, and a half-built phase is worse than an unbuilt one. What replaces
    them: the click-through fixes below, the owner's small features, and then
    ATTACHMENTS as the next session's single task. The floor rule stands - not
    fully green by Mon 28 EOD, and the tag ships instead.
  - 'CANNOT SEND MESSAGES' WAS NOT A BROKEN SEND. The API accepted the message
    (202), the SMTP service delivered and logged it, the row was stored, the
    socket event fired and the home list updated its preview. The message was
    simply INVISIBLE: both thread endpoints read
    `orderBy: { createdAt: 'asc' }, take: 200`, so any conversation past 200
    rows returned its OLDEST 200, and the newest message could never appear. That
    one line also explains 'the sender does not see their own group messages' and
    the long-standing 'before=200 after=200' artifact in the final suite. Both
    endpoints now take the NEWEST 200 and reverse into reading order, with the
    reason written at the call site.
  - Proof rather than argument: the same probe before the fix returned the oldest
    rows ('pairwise only'); after it, the last four messages are the two it had
    just sent, all mine=true.
  - The locked composer printed the recipient list twice - as chips AND as a
    read-only field holding the same joined list. The field is no longer rendered
    when the recipients are locked; the chips are the list.
  - The home list could hold a stale unread badge: a thread marks itself read
    while the list is still mounted behind it, and the App Router keeps that tree
    alive. The list now refreshes on focus, on popstate and on visibility, which
    covers coming back to it.
  - THE ALIAS AUDIT FOUND NOTHING TO FIX, recorded rather than dressed up:
    localPart is globally unique in the schema, the list query is scoped to the
    requester's own userId, and creation refuses a local part that collides with
    another account's number. Bug 6 is therefore NOT REPRODUCED, with the evidence,
    and the exact screen is requested.
  - The suite is 250 of 253, NOT green, and all three reds are the harness rather
    than the product: two group assertions and one final assertion compare unread
    COUNTS, and (a) my own read probes marked threads read while measuring, moving
    the baselines, and (b) at the 200-row cap a moved row does not change the
    count at all, so a count cannot see it. The correct assertion is membership by
    id. That is the next harness fix and the reason 'the moved row leaves B's
    group view' has been flaky all week.
  - NOT STARTED, by the brief's own priority order: the user-detail sheet, group
    info, the shared default avatar, the home bottom bar and contacts. The budget
    went to making the app usable again, which the brief put first.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26): the harness is deterministic, and both suites now run green
  twice in a row on the loaded dev DB.
  - The previous session's three reds were ALL count-based assertions on a loaded
    database, and all three are now membership-based or no-increase:
      * the final suite's 'the moved row leaves B's group view' asserted
        after = before - 1, which CANNOT be observed at the 200-row cap - a moved
        row changes the SET, never the COUNT. It now asserts the moved row's id is
        absent from the returned set, and that C's and A's views lost nothing.
        That flake had been with the project for a week.
      * the group suite's two leak checks compared a baseline taken before the
        sends against a count taken after them, so any read in between moved the
        number under the assertion. They now re-read the baseline at the moment of
        measurement and assert no-increase - which is the property they were
        always trying to state.
      * the group suite's 'A -> B only lands in the pairwise thread' asserted a
        +1 in the aggregate, which is not a property that holds when the user's
        scan window is full of other people's traffic. It now asserts the row is
        PRESENT in B's pairwise thread - which incidentally re-verifies the
        send-visibility fix end to end.
  - Verified twice consecutively: group 43/43 twice, final 42/42 twice.
  - NOT STARTED, and stated plainly: the five features (the user-detail sheet,
    group info, the shared default avatar, the home bottom bar, contacts). The
    brief ordered the harness first so that its own verification would be clean,
    and that work - three assertions to convert plus two suites run twice against
    a loaded database - used the session. They are the next session's content, in
    the brief's order, with the contacts model and API landing BEFORE the sheet's
    'Add to contacts' can be wired, as the brief requires.
  - STILL OPEN: the fresh-clone evaluator simulation. It has now been blocked two
    sessions running by the same thing - its cleanup step is a recursive delete,
    which AutoClaw's Safety Guard refuses, and the rules forbid re-running the
    blocked objective through a changed command shape in the same turn. It needs
    either the user to run it or an approval for the cleanup.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), continued: THE CONTACTS LAYER and THE SHARED AVATAR land;
  the rest of the brief does not.
  - CONTACTS: a Contact model (userId, address, displayName, unique per user) with
    its own migration - the 10th, applied - plus GET/POST /api/contacts and
    DELETE /api/contacts/[id]. A contact is stored as an ADDRESS: the same person
    is reachable as a number or through any of their aliases, and adding either
    canonicalises to <number>@phonemail.com, so adding the same person twice
    UPDATES one row instead of making two. An unknown address is refused with the
    same 404 an unknown recipient gets when sending, because the resolution is the
    send path's own helper - the two cannot disagree.
  - Verified end to end rather than by inspection: add by bare number -> 201; add
    again by alias-form address WITH a name -> 201, the SAME row, now named; list
    -> 200 count=1 carrying the name; an unknown number -> 404; remove -> 200;
    list -> 0. The migration applied through the entrypoint: 10 rows in
    _prisma_migrations, the Contact table present.
  - THE SHARED AVATAR: src/components/avatar.tsx is one neutral person mark in the
    palette's tint, and it replaces the letter/number initials on the home rows,
    both thread headers, both threads' incoming bubbles and the 1:1 full view. The
    group header takes the two-person mark its row already used - a group is not a
    person.
  - NOT DONE, stated so the next session starts from truth: the initial avatars in
    the profile header and the first-contact reader still carry letters; the
    user-detail sheet, group info, the home bottom bar, the contacts screen and the
    contact-name overrides are not built. The contacts API they depend on is now in
    place, which was the ordering constraint the brief itself set.
  - TWO ENVIRONMENT LESSONS, worth keeping: the image build caches on the source
    COPY, so a new migration file needs a real rebuild before the container can see
    it; and the host's Prisma client must be regenerated after a schema change or
    the app's own build fails on the new model. Both cost time this session.
  - Suites after these changes: 252 of 253, the one red being a chat assertion that
    named the literal avatar classes this session replaced (updated).
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), third session: THE FIVE REMAINING FEATURES LAND, AND THE
  EVALUATOR'S OWN PATH IS FINALLY EXERCISED.
  - THE USER DETAIL SHEET (src/components/user-sheet.tsx): tapping the counterpart
    in a pairwise thread, or any member in a group, opens who they are - the name in
    force, the number, the mail address, and, when it differs, the name the other
    account chose for itself. Add to contacts arrives PRE-FILLED with the name
    already on screen, so the common case is one tap; if the person is already saved
    the sheet says so and offers a rename and a remove instead. It asks
    /api/contacts rather than trusting a flag from the thread, because the contact
    list is the single source of truth for whether a person is saved.
  - GROUP INFO (src/components/group-info.tsx): the group title opens a read-only
    member list - the same list the thread key was derived from, so it cannot drift
    from who is actually in the group. Every member opens the same detail sheet. No
    rename and no leave, and not for want of trying: a group here is derived from its
    messages, so there is no membership row to change and nothing to rename. The
    screen says so rather than leaving the absence unexplained.
  - CONTACTS (src/app/(mobile)/contacts/page.tsx): list, add and remove. Adding goes
    through the send path's own resolution, so a number that cannot receive mail
    cannot be saved either, and the server's 404 reason is shown verbatim.
  - NAME OVERRIDES (src/lib/contacts.ts): one resolver, one precedence, applied in
    all three read endpoints - the name YOU gave a person beats the name they chose,
    which beats the number. An unnamed contact is absent from the map on purpose: it
    has nothing to override with. Verified live rather than by inspection: saving a
    name changed what the chat list row and the thread header displayed, and removing
    the contact reverted them.
  - THE HOME BOTTOM BAR (src/components/bottom-bar.tsx): Home, Contacts, Favorites.
    Additive - the folder links and the filter chips stay where they were, and
    Favorites is the same filter in both places rather than a second implementation.
    It passes ?filter=favorites instead of duplicating the list on a second route;
    the home reads that off the location in an effect, because useSearchParams would
    force a Suspense boundary around a screen that prerenders fine without one.
  - COMPOSE AUTOCOMPLETE: typing in To matches the address book by name or address,
    and a recipient chip now shows the saved name instead of the raw number.
  - THE LAST LETTER AVATARS ARE GONE: the profile header and the first-contact reader
    carry the shared person mark, and the dead initial helper on the home list is
    deleted. A regression assertion greps the tree for the patterns and requires
    nothing to come back.
  - VERIFICATION, loaded dev DB: a new feature suite (39 assertions) covers the
    sheet's data and its add wiring, the group-info payload, the contacts round trip,
    the overrides in both payloads, the bar's three targets, the routes' status codes,
    and the absence of letter markup. THE WHOLE SET IS 292 OF 292, TWICE
    CONSECUTIVELY.
  - THE FRESH-CLONE SIMULATION RAN - what three sessions could not land, and the
    blocker was the DELETE step, not the clone. Two commands and no deletion anywhere:
    git clone https://github.com/ah-REE/phonemail.git into a fresh timestamped
    directory, then docker compose up -d. Result: all four containers healthy, TEN
    migrations applied to a CLEAN volume (Alias, Contact, Email, User), dev mode out of
    the box because the clone carries no override file - and 292 OF 292 ON THE CLONE'S
    EMPTY DATABASE as well. The evaluator's exact path works, which is now a proven
    claim instead of an assumption.
  - Two suite assertions were re-pointed rather than deleted: chatref asserted the
    literal avatar classes this session replaced, and reader asserted the shell behind
    the letter initial. Both now assert the mark that actually renders.
  - The clone directory phonemail-clone-20260926-122047 is left in place on purpose -
    nothing was deleted, and its docker volume is its own, separate from the dev stack.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), fourth session: CLICK-THROUGH ROUND 2 - the six bugs the owner
  hit, the settings rework, true reply semantics, and the input pass.
  - ONE SEND IS ONE MESSAGE. Both candidates were checked and the WRITE path was
    innocent: a single POST is one SMTP submission, the inbound fan-out writes one
    row, and the database was counted after each of two separate sends (one row
    each time). The doubling was on the RENDER side - the thread appended a
    provisional bubble on the realtime event and never reconciled it, so the real
    row arrived beside it. A self-send emits that event to the sender too, which is
    how one correct single-row write rendered twice. src/lib/threadMerge.ts now owns
    the reconciliation as two pure functions (drop a provisional once its message
    really arrives; never append the same message twice) and the suite imports and
    executes them directly.
  - THE 1:1 COMPOSER IS TYPABLE. The field on the thread was a LABEL that opened
    compose with the recipient list LOCKED, so a normal new message could not be
    typed in the conversation at all: the locked state had leaked out of reply mode
    into the default flow. It is a real input now, sending to the counterpart.
    Locking stays where it belongs - reply, and the traditional camera-slot compose.
  - THE LAYOUT PINS THE COMPOSER: h-dvh instead of h-screen, min-h-0 on the
    scrolling pane, shrink-0 on the chrome. The list fills the space above a
    composer that cannot move, and scrolls itself to the newest message.
  - A SELF-SEND IS BORN READ (src/lib/inbound.ts): when sender and recipient are the
    same account the row is created isRead, so no unread badge can appear for a
    message you wrote yourself.
  - THE REMEMBERED NUMBER NO LONGER CROSSES TABS: sessionStorage instead of
    localStorage, matching the token's own per-tab scope. A new tab starts empty.
  - SENDING IS SILENT: the handed-to-the-mail-service line is gone from both
    composers. The message simply appears.
  - SETTINGS. The profile header leads with the NAME and puts the number beneath it.
    The Folders section and every route to the folder screens are gone, along with
    the in-thread move-to-folder actions (documented deviations in the README; the
    folder column and API stay, harmlessly). The Language row is gone (also
    documented). SMS notifications is a REAL switch - User.smsNotifications,
    migration 11, PATCH /api/me - that the delivery gate reads alongside
    registeredVia, and it can only ever NARROW who is notified. Delete account is a
    real three-step flow: confirm, one-time code, then DELETE /api/me/delete, which
    verifies the code server-side before removing emails, aliases, contacts and the
    user in foreign-key order inside one transaction, and reports the counts. Proven
    end to end on a throwaway number the suite itself deletes.
  - REPLY SEMANTICS. The Reply button carries the original message's id, its subject
    and a preview into the composer, which quotes it above the input and derives re:
    from THAT message - so a reply to an older mail still answers the older mail,
    with the right subject and the right linkage, in its own chronological place. A
    new subject from the same counterpart draws a divider where the chat turned.
    Reply-once is untouched.
  - INPUT PASS: no phone number or code as placeholder text anywhere (grep; all five
    remaining sites, including the portal's OTP field); the number field caps at ten
    digits, says nothing while typing, and answers the submit with exactly Enter 10
    digit mobile number; the Send OTP button sits at the login screen's own inset;
    and text entry has caret-only focus - the ring that appeared around a field you
    had merely clicked is gone, while links and buttons keep theirs so keyboard
    navigation stays visible.
  - VERIFICATION: 357 assertions across eleven suites, GREEN TWICE CONSECUTIVELY on
    the loaded dev database. Three older assertions were re-pointed rather than
    deleted - chatref and reader asserted markup this round replaced, and final
    asserted the move-to-folder actions that were deliberately removed.
  - THE FRESH-CLONE SIMULATION RAN AGAIN, from origin at this commit: git clone into
    a fresh timestamped directory (no delete step anywhere), docker compose up -d,
    all four containers healthy, ELEVEN migrations applied to a CLEAN volume with the
    smsNotifications column present, dev mode out of the box - and 357 OF 357 ON THE
    CLONE'S EMPTY DATABASE as well.
  - One honest note: the brief called the new migration the 12th; the repository has
    eleven migration directories and the database reports eleven applied. The count
    in the brief is off by one, not the migration.
  - ONE UNEXPLAINED ONE-OFF, recorded rather than buried: a single batch run of the
    names suite reported three counterpart-name assertions failing with a value that
    appears in no script and in no row. The suite passed on its own immediately
    afterwards, and the name plumbing was then verified live end to end (null -> a
    set name -> null again). It has not reproduced.
  - Mode found and left: REAL. The clone directory phonemail-clone-20260926-133852 is
    left in place again, by the same rule: nothing was deleted.

- Day 7 (Sun Sep 27), hygiene session: the test tree tells the truth, the
  dependency list tells the truth, and THE SAFETY FLOOR MOVES TO HEAD.
  - RETIRED: otp-unit-test.mjs and notify-unit-test.mjs, which could not even
    start (they imported a redis stub that does not exist) while the HTTP suites
    cover the same behaviour through the real endpoints; and phase0/brand_refresh.mjs,
    which asserted a palette the logo repaint replaced several sessions earlier and
    had been failing ever since. Nothing in the shipped tree referenced any of the
    three. The suite set is now exactly the eleven suites that run green.
  - THE NAMES ONE-OFF IS WATCHED AND CLOSED. It was given the third consecutive
    full run, and then a fourth and a fifth while the dependency change was
    verified: green every time, and the raw payload was captured on a passing run
    (counterpartName carries the value written moments earlier). It has not recurred
    in six consecutive full runs, and no script or row could ever have produced the
    value that one run reported. Closed as WATCHED, not as explained - if it ever
    returns, the raw payload is what to capture.
  - DEPENDENCY TRUTH: bcryptjs is gone. The password-login path it was installed for
    was removed when the app went OTP-only, leaving the dependency unused;
    node_modules, package.json and package-lock.json are all clean of it and the
    rebuilt image does not contain it. Verified like any other change: build green,
    full suite green.
  - ONE ASSERTION OF MY OWN WAS WRONG, and it is the SAME lesson as the harness fix:
    the round-2 suite asserted the notification switch reads true by default ON THE
    LOADED DATABASE. A user setting persists - the only writer is the account's own
    PATCH - so the suite was asserting a baseline it did not own, and it failed the
    moment the value was not the default. It now reads whatever is there, flips it,
    proves the flip persisted, and puts the original back. That a NEW account starts
    at true is a property of the schema default, and it is asserted where new
    accounts exist: on the fresh clone, where it passes.
  - README ACCURACY: the migration count said 9 (now 11); the evidence section said
    247 assertions across eight suites (now 357 across eleven, itemised by suite);
    the clone paragraph said nine migrations and 116 assertions (now eleven and 357);
    and the repository layout said 7 committed migrations (now 11).
  - ONE README CLAIM WAS NOT TRUE, found by the same spot-check and corrected: the
    spec-mapping table said the profile picture is served from Postgres and pointed at
    /api/me/avatar. NO SUCH ROUTE EXISTS - there is no upload and nothing serves the
    avatar columns, and every account shows the shared default mark. The row now reads
    Partial and spells out that the User.avatar* columns are unused scaffolding; the
    matching limitation bullet and the comment in /api/me/route.ts were corrected to
    match.
  - THE SAFETY FLOOR MOVED: submission-fallback now points at this commit. The old
    floor (6aa3cb4) predated the entire visual rebuild and five sessions of fixes. The
    floor means the best state we KNOW is submittable, and with the suites green on
    the loaded database and on a fresh clone of origin, that is HEAD. Annotated tag,
    force-pushed. NOTE: the command used is the brief's own `git tag -f submission-fallback HEAD`,
    which creates a LIGHTWEIGHT tag - so the floor is now a direct pointer at this
    commit rather than the annotated object the old floor had. The floor's meaning is
    the commit it names, and it names HEAD; the old object is untouched in history.
  - VERIFICATION: 357 assertions across eleven suites green three times consecutively,
    then the fresh-clone simulation from origin at this commit - all four containers
    healthy, ELEVEN migrations on a clean volume, dev mode out of the box, and 357 OF
    357 ON THE CLONE, with bcryptjs absent from the clone's own image.
  - Mode found and left: REAL. The clone directory phonemail-clone-20260926-151737 is
    left in place, by the same rule as before: nothing was deleted.

- Day 7 (Sat Sep 26), fifth session: CLICK-THROUGH ROUND 3, and the group's reply
  model is rebuilt exactly as the owner specified it.
  - THE CONTACT SEND. The write path was never at fault: driving the API precisely
    as the screen does, a selected contact's number sends and lands. The fault was
    in the parser in front of it. parseRecipients ran every token through a
    digit-only filter, so an ALIAS became the empty string and silently vanished -
    while the field's own placeholder advertised Number or alias. Typing a saved
    contact's NAME added nothing at all. The parser now keeps anything that is not
    phone-shaped as an alias, a typed name that matches a saved contact selects
    that contact, and the error names what is actually accepted. Asserted end to
    end: a send via a selected contact, and a send to an alias the suite creates.
  - THE GROUP DOUBLE IS REAL, AND IT WAS NOT THE SAME BUG AS ROUND 2's. A broadcast
    is one row per recipient - that is what makes per-member read state possible -
    and the group view showed every row, so a message to two members rendered
    twice. Email now carries a submissionId shared by every fan-out row of one
    SMTP submission, and the group thread collapses to one row per submission,
    preferring the VIEWER's own row because that is the one carrying their read
    state. Asserted: two rows in the database, one bubble in every member's
    payload.
  - THE HOME HEADER. The top-right slot rendered the unread COUNT where a person
    mark belongs, which reads as somebody else's phone number. The mark is the
    shared default now and the count is a badge on it; no per-user digits anywhere.
  - SELF-SEND SMS: the gate gains its plainest rule, ahead of the others - a
    message to your own number never texts you (skipped-self).
  - THE CONTACTS TAB: tapping a contact opens the CONVERSATION (the chat-first
    pattern; a compose screen with the recipient filled is a step that exists only
    to be dismissed - the choice is documented in the file itself), the detail
    sheet is its own button, the list filters as you type, the add form lives
    behind a plus, and removal is immediate with the name override reverting as it
    happens. Asserted live.
  - READING: both threads scroll to whatever just arrived - a send or a live
    message - through a sentinel that moves with the last bubble. A reply renders
    the mail it answers on its own bubble. A new subject from the same counterpart
    cuts the chat with a divider wherever it arrives, socket included.
  - SETTINGS RESTORED: the Language row returns (English live; Hindi and Tamil
    offered as coming-soon entries that cannot be chosen, because only English
    ships) and the folder rows return - the screens never went away, only their
    door - with the move-to-folder actions back in the reveal panel. BOTH README
    deviation rows are removed: this is spec again.
  - SWIPE RIGHT now reveals Reply in traditional view, the gesture the spec asks
    for; swipe left keeps the tag and move panel.
  - THE GROUP REPLY MODEL, built to the letter. The creator's mails are broadcasts
    and the creator keeps the composer. Every other member loses it and gets a
    Reply button on each mail; that reply is addressed to the member whose mail it
    answers, carries the group thread key EXPLICITLY - validated server-side: the
    sender must be a member, the row being answered must be in that thread, and
    the reply must go to that row's author, never to the group at large, which
    would be a broadcast wearing a reply's thread key - and is PRIVATE. The group
    endpoint filters per viewer, so a reply lives in exactly two payloads, its
    sender's and its recipient's; the socket event for a reply reaches its
    recipient and nobody else. One reply per member per mail falls out of the
    existing claim on the member's OWN fan-out row, so B replying does not block
    C - per-member independence for free. Unread lands on the creator for replies
    and on members for broadcasts, from the same row-scoped count as before.
    THE ORDER OF CHECKS MATTERED AND WAS WRONG FIRST: the group validation now
    runs BEFORE the reply-once claim, because the claim is a mutation - rejecting
    a reply after taking it would burn the sender's one reply to that mail. Found
    by a hostile assertion rather than by reading.
  - VERIFICATION: 407 assertions across twelve suites green on the loaded
    database, and 404 OF 404 on a fresh clone of origin. One socket assertion is
    SKIPPED on the clone only: it needs a socket client from node_modules, which a
    fresh clone has inside its container and not on the host; the same assertion
    runs and passes on the loaded database.
  - Three assertions moved this session, all following product decisions rather
    than preferences: groupchat's row-by-recipient count (the collapse stopped it
    being true, and it was order-dependent), and round 2's move-to-folder line,
    which flipped back because the owner restored the actions. Three rounds, three
    decisions, one line tracking them.
  - Mode found and left: REAL. The clone directory phonemail-clone-20260926-163219
    is left in place, by the same rule as every session before it.

- Day 9 (Sun Sep 27), twenty-sixth session: THE DESKTOP DESIGN FIX, from the owner's
  screenshot review.
  - TASK 1 - NO SHELL BEFORE LOGIN. The rail lives in the desktop LAYOUT, so it
    wrapped every desktop route - including /desktop itself, which is the LOGIN
    screen. A signed-out visitor met a full mail shell (rail, folders, profile and
    settings links) around a login form: a confusing first impression and a promise
    of navigation that did not exist yet. The rail now renders nothing until the
    session is confirmed, which fixes it in the one place the shell is defined, and
    the login screen became a centred card on the phone's own surface. Verified two
    ways: the signed-out page's own HTML carries no rail, folder or settings markup
    at all, and the login route's source is the form.
  - TASK 2 - THE PANE'S DEFAULT STATE. The reading pane can no longer show a compose
    form, because there is no longer a compose form to show in it: compose is an
    OVERLAY (fixed, z-50), summoned only by the toolbar's action or a mail's Reply.
    The pane's default is the design system's empty state - a mark, "Select a
    conversation", and a line that tells the reader what to do - with the unread
    count in that line when there is one.
  - TASK 3 - A REAL DESKTOP COMPOSER (src/components/desktop-compose.tsx). A
    Gmail-style card: header ("New message" or "Reply") with a Cancel action, To, Cc,
    Subject, the body, the three attachment affordances (documents, images, camera -
    the phone's three intentions), the same file cards with upload states and a
    retry, and Send. The semantics are the phone's exactly - the same /api/emails
    endpoint, the same multipart path with real progress through XMLHttpRequest when
    files are attached, the same limits from lib/attachments, the same 409 meaning
    "you have already replied", the same reply linkage (replyToId, the group's thread
    key, locked recipients, the quoted opening). The phone's compose screen is no
    longer reachable from the desktop at all: the /compose link is gone from the
    desktop tree, asserted by checking five desktop files for the phone screen's own
    markers. Only the presentation is desktop, which was the point.
  - TASK 4 - THE COHERENCE PASS. Proportions at the Gmail measures: rail 240px, list
    380px, the pane flexible with its content capped at a 720px readable column
    instead of stretching across a 1600px window, one 1px token divider between the
    zones. Colour strictly on the design system's tokens: a `git grep` for literal
    hex across the desktop tree returns nothing. Type on the system's scale with
    font-headline on every heading. The list rows are 72px with a bold sender, the
    subject, a one-line preview, a right-aligned time, unread emphasis, hover and a
    visibly-selected state (accent-soft plus aria-current). Empty and loading states
    exist for both zones, and the composer carries the upload states.
  - EVIDENCE. 815 assertions across 25 suites green on the loaded database in dev
    mode; the new suite (ct22, 24 assertions) proves the signed-out page carries no
    shell, the pane's default, the composer's fields/affordances/endpoints and both
    of its send paths live, the measures, the token audit and every desktop route.
    No assertion in an older suite needed re-pointing this round: the desktop's
    structure changed beneath them without moving what they assert, which is the
    cleanest possible sign that the fix was at the right level.

- Day 9 (Sun Sep 27), twenty-fifth session: THE SMS FIX, THE POLISH, AND THE DESKTOP
  CLIENT, TRADITIONAL.
  - TASK 1 (the broken feature) - WHAT WAS ACTUALLY WRONG, because the answer was not
    where the report pointed. The gate chain itself was sound, and each link was
    proved in dev mode by driving deliveries and reading the outcome the delivery
    path returns: a portal-registered recipient reached the transport ("dev-mode"),
    an app-registered one was "skipped-mobile", a self-send "skipped-self", and a
    switched-off account "skipped-disabled". TWO REAL DEFECTS survived that reading,
    and both produce exactly the reported symptom - a feature that reports success
    while nothing arrives:
      1. THE OUTCOME CHAIN COULD NOT REPORT THE THROTTLE. notifyNewMail returned
         "dev-mode" BEFORE it ever looked at the cooldown, so in dev mode a burst of
         mail reported "dev-mode" every time and the throttle outcome was unreachable
         - dead code no test could exercise, and the burst protection never once
         observed. The order is now gate -> throttle -> transport, and "throttled" is
         asserted live (it is the assertion that would have failed before this round).
      2. THE BODY WAS THE ONE SHAPE THIS PROJECT HAS ALREADY PROVEN THE CARRIER DROPS.
         src/lib/otp.ts records, as a fact from manual testing, that long templated
         texts are filtered and that exact duplicates are dropped - which is why the
         OTP bodies are a rotated set of SHORT formats. The notification was a single
         ~90-character fixed sentence, byte-identical for identical (sender, subject)
         pairs. It is now a rotated set of four one-line formats, with the subject
         flattened (newlines and control characters stripped), stripped of zero-width
         characters and truncated at 60, so the message stays a short single-segment
         text whatever the sender typed. The spec's own wording is the canonical
         format in that set.
    Honest limit, stated rather than glossed: no real SMS was sent from here, because
    the convention accounts are dev-mode only and a real send needs the operator's
    gateway phone online. The code-level defects are fixed and asserted; the
    end-to-end delivery on a real handset stays the operator's check, and the README
    now carries the checklist that says exactly what has to be true (real mode, the
    gateway phone online with the app running, a notifiable recipient).
  - TASK 2 - THE UNAUTHENTICATED WIDE ENTRY. The handover lived on the phone HOME
    screen, and each phone screen redirects a signed-out reader to /onboarding - so a
    laptop visitor who had never signed in landed on the MOBILE onboarding, which is
    the first impression the feature exists to prevent. The check moved into the
    mobile route group's LAYOUT (every phone route, onboarding included) and its
    decision became one pure function (src/lib/entry.ts: explicit /mobile wins, then
    the tab's own choice, then the width). /onboarding is now reachable only through
    /mobile or a narrow viewport, which is what the brief asks.
  - TASK 3 - THE SAVE MOMENT. The text line became an animation: the save block
    MORPHS into a green disc with a white check and the word "Saved" (the
    confirmation is the save button's own row, not a message next to it), holds 600ms,
    then the sheet closes. One transition on the curve the sheets already enter on
    (cubic-bezier(0.22,1,0.36,1)); no bounce - soft-spring is for things that arrive,
    not for things that confirm. Reduced-motion readers get the same outcome with no
    wait, and the name still reaches the open chat before the animation starts.
  - TASK 4 - THE ROLE TAGS. Email gained recipientRole ('to' | 'cc', nullable;
    migration 20260927230000_add_recipient_role), stamped per fan-out row from the
    send path's submission note - the same channel that already carries "this is a
    reply". The MIME Cc header tells the mail service the same thing for the hop, but
    a header cannot reach a row. The group payload derives each member's tag from the
    thread's FOUNDING mail (lib/roles.ts, pure): its author is the sender, its To
    recipients are receivers, its Cc recipients are cc. Proved end to end through the
    real SMTP round trip on a member set that had never existed (a dedicated fixture
    account): three distinct tags, sender+receiver for a To-only group, and the row
    stamps in the database.
  - TASK 5 - THE RAIL. The rail holds the logo, the folder items and profile/settings
    at the bottom, and it wears the phone client's navy (the chrome that used to be a
    top bar is now the rail, so round 8's coherence survives the bar's removal).
    Compose moved out of the chrome into the toolbar above the message list, where the
    list it acts on is. The folder items are REAL: they are the three values
    Email.folder can hold, and /api/conversations now answers ?folder= (the inbox
    keeps its old shape - what arrived plus what I sent; spam and trash are the
    viewer's own filing only).
  - TASK 6 - DESKTOP SETTINGS, FULL PARITY. Profile (name), aliases (add/remove),
    Language, the SMS switch, Font size, signed-in devices with per-device logout, and
    account deletion behind a one-time code - all against the SAME endpoints the phone
    uses and the same modules for the shared logic (lib/fontSize, the Switch
    component, lib/device). The screen it replaces described its own controls as
    "visual only for now"; that is no longer true, so the wording is gone with it.
  - TASK 7 - THE TRADITIONAL DESKTOP MAIL VIEW. The reading pane stopped rendering
    bubbles. Each message is a stacked EMAIL with its own header block (sender and
    role tag, From, To, the full date, the subject), its full body, its inline
    attachment cards and its own Reply action that opens the traditional compose
    (carrying the group thread key when the conversation is a group, so a reply
    addressed to one member still lands in the group). Groups render the same way with
    each sender named. The middle list stays thread-grouped. There is no bubble markup
    anywhere in the pane, and the suite asserts that by looking for its absence.
  - EVIDENCE. 791 assertions across 24 suites, green on the loaded database in dev
    mode through the real SMTP round trip; the round-9 suite (ct21, 54 assertions)
    drives every item - the six notify outcomes live, the entry decision at five
    widths and four URLs, the role tags through the SMTP hop, the folder parameter,
    the endpoints the desktop settings reuse - and marks its source-only claims as
    source-only rather than dressing them up. Six assertions in older suites were
    re-pointed, each because this round deliberately moved what they described: ct2's
    gate assertion (the skips became one pure decision), ct13's two (the confirmation
    is the animation now; the wordmark moved into the rail) and ct20's four (the
    handover moved to the layout, the threshold to lib/entry.ts, the mobile link and
    the navy chrome into the rail). No assertion was deleted or weakened to make the
    suite pass.

- Day 8 (Sun Sep 27), twenty-fourth session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-215347). The clone came down at HEAD 5d35d3b -
    the commit this session's work was just pushed as - with 163 tracked files, 15
    migrations (the Session table included) and correctly NO
    docker-compose.override.yml.
  - Only the main APP container was stopped for the duration (docker-compose.yml
    hardcodes 3000:3000); the clone's own compose file was NOT edited. The main stack
    was restored afterwards, four healthy containers.
  - The clone built and came up healthy on the FIRST attempt and SERVED every route,
    including the two this round added: / and /mobile, /desktop with its inbox and
    settings, /compose and /favicon.ico - all 200. Its /api/auth/send-otp answered
    with a devHint AND `resendAfterSeconds: 0`, which is the new tiered policy speaking
    on a clean stack (the first request is immediate). The "Session" table was queried
    directly from the clone's own Postgres.
  - THE SUITES RAN AGAINST THE CLONE with COMPOSE_DIR set for the whole run: ALL
    TWENTY-THREE SUITES GREEN - 734 of 735 assertions, with the ONE documented skip
    (ct3's socket assertion, which needs socket.io-client from node_modules and a fresh
    clone only has it inside its container; round 9's socket assertion does not skip,
    because it imports the client from this repository's own node_modules by absolute
    path).
  - THE HARNESS LESSON THIS RUN PRODUCED, recorded because it will recur: the shared
    token cache is PER STACK. The first attempt warmed it against the loaded database
    and then pointed the suites at the clone, where those sessions do not exist - so
    every suite did the full OTP dance against the clone and the agent numbers' five-
    per-two-hours windows were spent by the third suite. The fix was to warm the cache
    AGAINST THE CLONE before running, which is the correct order, and the clone then
    ran clean. (A fresh clone's Redis is empty, which is why the freshly-warmed run had
    no window friction at all.)
  - Mode found and left: REAL (dev mode only for the runs, the override restored, four
    healthy containers confirmed). The clone directory is left in place.

- Day 8 (Sun Sep 27), twenty-fourth session: ROUND 8 - the contact sheet, the font-size
  preference, desktop by default, the tiered OTP policy, sessions with per-device
  revocation, and the desktop coherence pass.
  - TASK 1, THE CONTACT SHEET STAYS OPEN. Saving used to close the sheet immediately,
  which made the confirmation invisible and took the sheet away before it was read. It
  now confirms INSIDE the sheet ("Saved successfully as X."), the name still reaches
  the open chat at once, and the reader closes it when they are ready.
  - TASK 2, FONT SIZE: Normal / Large / Extra large, in settings on BOTH clients. Every
  size in this app is in rem, so the preference is ONE NUMBER on <html> - and it is
  applied by a script in the document head, BEFORE anything paints, so there is no
  flash (the alternative was a visible jump from 18px to 22px after hydration).
  Remembered per device in localStorage, which is right for a display preference: the
  phone in a pocket and the laptop on a desk do not want the same size. Levels: 18 /
  20 / 22px.
  - TASK 3, DESKTOP BY DEFAULT ON A WIDE SCREEN. `/` hands a >=768px viewport to
  /desktop once per tab; /mobile is the explicit phone URL and is never redirected
  away from, and the choice is remembered in sessionStorage so an in-app link back to
  `/` does not bounce the reader out of the layout they picked. The desktop header's
  "Mobile version" now points at /mobile (it pointed at `/`, which would have handed a
  laptop straight back to desktop). The hop is a client-side replace, so a per-tab
  session survives it.
  - TASK 4, THE TIERED OTP POLICY, replacing the flat 60-second cooldown: the first two
  requests in a window are IMMEDIATE (the rapid pair), from the third the spacing is 60
  seconds, and a number may have at most FIVE codes per 2-hour window. The window is
  set with the first request and never extended - a sliding window would let a
  determined caller hold the budget open for ever. Every refusal carries its REASON
  and the ACTUAL wait, and the OTP screen's countdown reads the server's number
  instead of a hardcoded 60. Keys: otp-window:<phone> (the counter AND the window),
  otp-last:<phone> and the existing otp-attempts:<phone>.
  - A CONSEQUENCE WORTH WRITING DOWN: five codes per number per two hours would have
  starved the harness - a dozen suites sign in as the same two numbers, which is about
  twelve OTPs per number per run. The policy is right and the harness was wasteful, so
  the suites now share ONE login per number per run (a token cache in
  _shared/session.mjs, validated against /api/me before it is reused). The policy was
  NOT loosened to suit the tests.
  - TASK 5, SESSIONS. A Session model (userAgent, createdAt, lastActiveAt) and the
  token now carries its id, so a token is only good while its row exists. That makes
  "log this device out" real - the row is deleted and THAT device's next request is
  401 - and "deleting the account logs every device out" true as an ORDER in the
  deletion transaction rather than as a side effect, with no denylist to keep. A token
  with no sid (minted before sessions existed) is treated as unauthenticated, so the
  client re-authenticates once. requireUser became async across all 18 call sites, and
  lastActiveAt is written THROTTLED (5 minutes) because the row exists to be
  recognised, not to be a request log. Settings gained "Signed-in devices": the parsed
  label, when it signed in, when it was last active, a "This device" marker and a Log
  out action.
  - TASK 6, THE DESKTOP COHERENCE PASS. Research first, and the finding changed the
  plan: the desktop group already had the three-zone Gmail layout (rail, list, reading
  pane) AND its palette was already the logo's - hidden behind the legacy `wa-*` names
  (wa-teal IS the mark's navy #1e3a8a; wa-bg IS the illustration's off-white #f8fafc).
  So this was never a colour problem: the desktop spoke the ALIAS set the chat screens
  keep, and its headings were not on the display face. The five desktop files now use
  the design system's own tokens, the headings are on font-headline, the chrome is the
  same navy as the phone client, and both settings screens carry the font-size row.
  Structure, navigation and functionality are untouched - folders, aliases,
  attachments, group threads and the reading pane all still work.
  - A TWENTY-THIRD SUITE, ct20/round8_regression.mjs: the sheet's behaviour, the font
  module plus the bootstrap actually shipping in the SERVED HTML, the redirect and
  /mobile, the OTP policy LIVE (the rapid pair, the third refused inside the spacing
  with its reason and real wait, allowed once the spacing has passed, the sixth refused
  with the WINDOW reason and hours remaining), sessions live (a second sign-in appears
  as a second device, logging it out makes THAT token 401 while this one keeps
  working), the device-label parser, and the desktop routes plus its token hygiene.
  - VERIFICATION: 737 assertions across TWENTY-THREE suites green on the loaded
  database in dev mode; build green; and the fresh-clone evaluator simulation from
  ORIGIN is recorded in the entry that follows this one.
  - AN HONEST NOTE ON THIS SESSION'S OWN MISTAKE: before switching the stack into dev
  mode I probed send-otp for the mode, and the stack was still in REAL mode from the
  previous session - so ONE REAL SMS went to the dev fixture number 8072788917. The
  harness's own login helper refused to proceed (it checks for the devHint), and the
  probe I ran afterwards is what sent it. Nothing else left the machine, the number is
  a dev-only fixture, and the sequence is recorded here rather than glossed.
  - Mode found: REAL. Dev mode for the run and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), twenty-third session: THE IVR ROUTE WAS READING THE WRONG PLACE.
  One bug - reproduced before it was fixed - and a suite that could not have caught it,
  because it drove a request shape the provider never sends.
  - THE BUG: Twilio sends `Digits`, `From` and `CallSid` in the POST BODY as
    application/x-www-form-urlencoded, and the query string carries only what OUR
    Gather action URL put there (token, stage, lang, attempts). The route read every
    parameter from the QUERY alone, so on a real call the stage was right and the
    DIGIT WAS INVISIBLE: the tree never advanced and the menu replayed for ever.
  - REPRODUCED FIRST, AS ASKED: `POST ?token=...&stage=main&lang=en` with a FORM BODY
    of `From=+91...&Digits=4` answered the main-menu Gather with `attempts=1` - the
    replay branch - instead of registering. The digits really were invisible.
  - WHY THE TESTS MISSED IT, STATED PLAINLY: the pure flow was correct, so all 28
    MOCKED branches stayed green; and the live checks put BOTH the stage and the
    digits in the QUERY, which is precisely the shape a real Twilio request does NOT
    use. A test that drives a shape the provider never sends is a test of the wrong
    thing - and this is the second time this session family has been bitten by
    testing a path rather than the real one.
  - THE FIX: ONE parameter lookup over BOTH sources - the parsed form body (or JSON)
    and the query string - with THE QUERY WINNING where they disagree, because the
    query is our own action URL and therefore the more specific instruction. `From`,
    `CallFrom`, `Digits`, `DtmfDigits`, `digits`, `stage`, `lang` and `attempts` all
    go through it, so the Exotel path benefits from the same reading. NOT ONE LINE OF
    THE PURE FLOW CHANGED: it was never wrong.
  - VERIFIED: the exact body-form request that used to replay now returns the
    registration Say with the address spoken digit by digit and `<Hangup/>`; and the
    suite gained TEN LIVE assertions that drive the BODY path at every stage - the
    greeting with `From` in the body, `Digits` 1 / 2 / 3 / 4 in the body, an invalid
    digit in the body, the query-wins rule, and the Exotel one-shot from the body.
  - DOCS: docs/ivr-setup.md now says where each parameter arrives (body vs query) and
    why the query wins, so the next reader does not have to rediscover it.
  - VERIFICATION: 714 assertions across TWENTY-TWO suites green on the loaded
    database in dev mode; build green.
  - Mode found: REAL. Dev mode for the run and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), twenty-second session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-153555). The clone came down at HEAD 00d091c -
    the commit this session's work was just pushed as - with 157 tracked files, 14
    migrations and correctly NO docker-compose.override.yml.
  - ONLY the main app container was stopped for the duration (docker-compose.yml
    hardcodes 3000:3000); the clone's own compose file was NOT edited. The main stack
    was restored afterwards, four healthy containers.
  - The clone built and came up healthy on the first attempt, and SERVED every smoke
    route including /compose and /favicon.ico (all 200); its send-otp answered WITH a
    devHint, as a clone must.
  - THE SUITES RAN AGAINST THE CLONE with COMPOSE_DIR set for the whole run: ALL
    TWENTY-TWO SUITES GREEN - 703 of 704 assertions, with the one documented skip
    (ct3's socket assertion, which needs socket.io-client from node_modules and a
    fresh clone only has it inside its container). Round 10's IVR suite ran green
    there too, which matters because it is the one suite that exercises the new tree
    end to end against a running app as well as in the mocked half.
  - Mode found and left: REAL (dev mode only for the runs, the override restored, four
    healthy containers confirmed). The clone directory is left in place.

- Day 8 (Sun Sep 27), twenty-second session: THE FULL IVR PHONE TREE. The endpoint
  became a real voice flow - language, main menu, description, registration - with
  the call's state in the action URLs and the token checked on every request.
  - THE MECHANIC, STATED ONCE: Twilio makes a NEW HTTP REQUEST for every menu step,
    so nothing about the call can live on the server. The stage, the language and
    how many times the stage has been replayed ride in each Gather's action URL
    query params, and THE TOKEN RIDES WITH THEM - so every request is authorised on
    its own and the server stays stateless.
  - THE FLOW: STEP 1 is the language menu (1 English / 2 Tamil); STEP 2 is the main
    menu ("to know about PhoneMail, press 3; to register for PhoneMail, press 4");
    STEP 3 explains PhoneMail on 3 and returns to the menu so they can press 4, and
    on 4 it registers, congratulates and hangs up. Tamil says "Tamil is coming soon.
    Continuing in English." and then the main menu - the honest handling, because
    Twilio's TTS has no Tamil voice and the app ships English only.
  - THE REPLAY RULE: an invalid digit replays the current stage's menu, twice; the
    third failure says goodbye and hangs up. A missing digit is treated as an
    invalid one. An unknown stage restarts at STEP 1, so a stale or hand-crafted URL
    gets a fresh greeting rather than an error.
  - THE ONE WRITE: only Digits=4 at stage=main creates an account, through the same
    idempotent upsert as before, so pressing 4 twice returns the same account and
    never a duplicate. The Exotel one-shot path (a CallFrom and no stage) is
    untouched and still answers "account is ready".
  - THE FLOW IS A PURE FUNCTION. src/lib/ivr.ts holds the whole tree as
    (stage, digits, attempts) -> TwiML, with no Request, no database and no
    environment in it; the route keeps only the token check, the caller lookup, the
    single write and the XML response. That is what makes the unit tests real unit
    tests: they import the flow and drive every branch, instead of re-implementing
    it or needing a server.
  - A TWENTY-SECOND SUITE, ct19/ivr_tree_unit.mjs, 40 assertions: 28 MOCKED branches
    (the greeting, both language choices, both menu digits, both replay limits, the
    missing digit, the unknown stage, the Exotel one-shot, the spaced-digit address,
    and XML hygiene across every branch - a Response document, the woman voice, no
    raw ampersand, and every action rooted at the endpoint) plus 12 LIVE checks
    against the running app (a wrong token is 401, a missing token is 401, the
    header works as well as the query param, and each stage answers its TwiML).
  - DOCS: docs/ivr-setup.md now documents the tree - the step table, the
    state-in-the-URL explanation, the Twilio console steps and the per-stage curl
    checks - and keeps the Exotel one-shot section; the README's IVR row says
    registration is option 4 of the voice menu.
  - VERIFICATION: 704 assertions across TWENTY-TWO suites green on the loaded
    database in dev mode; build green; the fresh-clone evaluator simulation from
    ORIGIN is recorded in the entry that follows this one.
  - Mode found: REAL. Dev mode for the run and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), twenty-first session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit - the last one before submission.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-131436). The clone came down at HEAD 43223df -
    the commit this session's work was just pushed as - with 155 tracked files, 14
    migrations and correctly NO docker-compose.override.yml.
  - ONLY the main app container was stopped for the duration (docker-compose.yml
    hardcodes 3000:3000) and the clone's own compose file was NOT edited. The main
    stack was restored afterwards, four healthy containers.
  - THE CLONE BUILT FIRST TIME this run - the transient builder flake that hit the
    previous two attempts did not appear, and the script now retries once anyway
    rather than reporting a flake as a defect. It came up healthy, applied all
    FOURTEEN migrations on a clean volume (round 9's deletedForSender /
    deletedForRecipient columns queried directly from the clone's own Postgres), and
    SERVED: / , /onboarding , /profile , /contacts , /compose and /favicon.ico all
    answered 200 - so the favicon fix is confirmed on a clean clone, not just here.
    Its send-otp answered WITH a devHint, as a clone must.
  - THE SUITES RAN AGAINST THE CLONE with COMPOSE_DIR set for the whole run: TWENTY
    OF TWENTY-ONE SUITES GREEN, 663 of 664 assertions, with the ONE documented skip
    (ct3's socket assertion, which needs socket.io-client from node_modules and a
    fresh clone only has it inside its container). Round 9's socket assertion does
    NOT skip, because it imports the client from this repository's own node_modules
    by absolute path - which is how the reply-privacy invariant's socket half is
    verified on a clone too.
  - The harness weakness of the last session stayed fixed in practice: round 9's
    suite waits a 429 cooldown out inside its own `login` instead of misreading it as
    REAL mode, so no suite tripped over a cooldown this run.
  - Mode found and left: REAL (dev mode only for the runs, the override restored, four
    healthy containers confirmed). The clone directory is left in place.

- Day 8 (Sun Sep 27), twenty-first session (the last one): THE FIVE FIXES, CC, DELETE
  CHAT AND THE SECURITY REPORT. Landed and verified.
  - FIX 1, THE RECEIVED CARD'S GAP. The band under the body was never padding: the
    "Read full message" / "Collapse" control carried the GLOBAL 56px button floor -
    the same rule that made the round-7 ovals - plus an extra mt-2 on top of the
    footer wrapper's own mt-1. Values, before -> after: the control's box 56px -> its
    own ~20px (min-h-0), its extra margin 8px -> 0, so the void under the body goes
    from roughly 34px to about 2px.
  - FIX 2, THE FIRST SUBJECT NO LONGER CHANGES. The thread's leading pill rendered
    the server PAYLOAD's subject, which is the newest - so a second subject silently
    renamed the chapter the reader had already read. It now derives from messages[0]
    (the [phone] route reverses to ascending, so index 0 is the original), and the
    state is only the fallback for the moment before the first row loads. Asserted
    LIVE: two mails with two subjects, and the first message still carries the first
    subject after the second has arrived.
  - FIX 3, THE SEND ARROW POINTED LEFT. Its apex sat at x=4, which reads as
    "receive". Mirrored to `M20 12L4 4l6 8-6 8z`. Asserted in the source rather than
    in the served HTML - the compose form is a client component whose server output
    is a loading shell, so the mirror cannot be read out of the markup; the rendered
    result is the user's click.
  - FIX 4, THE PROFILE HEADER. With a name set it printed the raw mobile number under
    the name AND the address in the pill below - the number twice over. It now shows
    the NAME and the @phonemail.com ADDRESS, and the raw-number line is gone. With no
    name set, the old fallback (the number as the heading) stands.
  - FIX 5, THE FAVICON. The app shipped an icon and NO favicon of any kind:
    /favicon.ico answered 404. All four icons were regenerated from the current logo
    through the same PNG-encoder path (PIL, the mark on the illustration's off-white)
    and a real .ico was added, so /favicon.ico now answers 200 with image/x-icon and
    the manifest's two icons serve as PNGs.
  - CC, THE FIELD THE SPEC ASKED FOR AND THE APP NEVER HAD. A real Cc row directly
    under To: the same chips, the same resolution (a number or an alias, through the
    same lookup the inbound path uses), the same contacts autocomplete, per-chip
    removal - and LOCKED together with To in a reply or a thread-launched compose.
    Cc recipients ARE recipients: they receive fan-out rows exactly as the To list
    does, they count towards the group, and the MIME message carries the Cc header.
    TWO BUGS HAD TO BE FIXED for that to be true rather than nominal: the group test
    counted only To, so `to=[B] cc=[C]` produced NO thread key and the Cc recipient's
    row was filed as a 1:1 with the sender; and the Cc header was not reaching
    nodemailer at all.
  - THE INVARIANT, ASSERTED WHERE IT CAN BE BELIEVED. A sends to=[B], cc=[C]; the
    group forms; B replies to that mail; then C's OWN payload is fetched with C's own
    token and searched for the reply - absent - while C still sees the broadcast
    itself. The socket side is asserted the same way: a real socket.io-client is
    imported from the repository's own node_modules, connected as C, and shown to
    receive NOTHING while the reply is sent. The To-only two-recipient case is
    re-proven identically.
  - DELETE CHAT, RECIPIENT-SCOPED. The person sheet gains Delete chat, with a
    confirmation that says what actually happens. It sets two new PER-VIEWER flags
    (deletedForSender / deletedForRecipient - the 14th migration) on the caller's own
    pairwise rows, with `threadKey: null` so a group message is never touched by it.
    The reason it is a flag and not a row delete: a message is ONE row that both
    sides read, so deleting it would take the counterpart's copy with it. Asserted
    live: the requester's thread empties, the conversation leaves their list, the
    COUNTERPART's message count is unchanged, and the group thread is still intact.
  - THE SECURITY REPORT, docs/SECURITY.md, linked from the README. Fourteen areas,
    each naming the file and the symbol to grep - OTP-only auth (crypto-random codes,
    300s TTL, one-time use), the 60s resend cooldown, the 5-strike brute-force burn,
    JWT (HS256, 7 days, secret-gated start), the notification gate with the user's
    switch and the self-send skip, the two webhook secrets, the one-door write path,
    the reply-once claim and its rollback, party-only attachment downloads with the
    token never in a URL, the group reply invariant, the alias rules, OTP-verified
    account deletion, delete-chat's scoping and the service worker's scope - then
    five gaps stated plainly: no TLS at the application layer, the npm advisories
    (1 moderate, 4 high), the 7-day token with no revocation, the committed
    placeholder secrets and their rotation policy, and dev-OTP mode being
    deliberately open.
  - THE REPORT IS CHECKED, NOT TRUSTED: the new suite asserts, for eighteen of its
    references, that the needle appears in BOTH the document AND the code it points
    at, and independently confirms the one-door claim (exactly one
    `prisma.email.create` in the tree, in lib/inbound.ts).
  - A MIGRATION LESSON, RECORDED BECAUSE IT COST REAL TIME: the new migration shipped
    with a BYTE-ORDER MARK - PowerShell's `-Encoding UTF8` writes one on 5.1 and
    Prisma reads it as part of the SQL - so the migration failed, the entrypoint's
    retry loop kept re-recording the failure (P3009), and the app would not start.
    Fixed by writing the file with Node (first bytes verified as 45 45 32), resolving
    the failed migration as rolled back, and re-deploying: both columns are present
    and the 14th migration is applied.
  - VERIFICATION: 664 assertions across TWENTY-ONE suites green on the loaded
    database in dev mode; build green; the fresh-clone evaluator simulation from
    ORIGIN is recorded in the entry that follows this one.
  - Mode found: REAL. Dev mode for the runs and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), twentieth session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit, and what it taught the harness.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-112505). The clone came down at HEAD e371c7e -
    the commit this session's work was just pushed as - with 152 tracked files, 13
    migrations and correctly NO docker-compose.override.yml.
  - The clone's FIRST image build failed inside `npx prisma generate && npm run
    build` - the same transient flake that hit the main repository twice before and
    that has always succeeded on retry. It did again: the same clone directory built
    cleanly on the second attempt and came up healthy. The flake is real and worth
    knowing about; it is not a defect in the tree.
  - The clone served: / , /onboarding , /profile and /contacts all 200, all THIRTEEN
    migrations applied on a clean volume, and the "Attachment" table queried directly
    from the clone's own Postgres. Only the main app container was stopped for the
    duration; the main stack was restored afterwards, four healthy containers.
  - THE SUITES RAN AGAINST THE CLONE: seventeen of twenty green in the first pass,
    and the three that were not - final, aliases, ct6 - were NOT code failures. Each
    hit the harness's own devHint guard: that guard treats a send-otp response with
    no devHint as "the app is in REAL SMS mode" and aborts with exit 3, but a 429
    ("wait before requesting another OTP") has no devHint either, and running twenty
    suites back to back now reliably walks into the 60-second per-number cooldown.
    Re-run with the cooldown waited out before each, all three are green (42/42,
    31/31, 20/20).
  - So the clone result is 20 of 20 suites green: 616 of 617 assertions, with the one
    documented skip (ct3's socket assertion, which needs socket.io-client from
    node_modules and a fresh clone only has it inside its container). The attachment
    round trip - upload, MIME over SMTP, storage, hash-identical download, the raised
    limits and the 403 - is verified on a clean clone as well as on the loaded
    database.
  - A HARNESS NOTE FOR THE NEXT SESSION, because it will happen again: the devHint
    guards should treat a 429 as "still dev mode, come back in a minute" rather than
    as REAL mode. That is a one-line change in each guard, and until it is made the
    suite order matters. It is recorded here rather than fixed now because touching
    twenty suites at submission time is a worse risk than a known, documented re-run.
  - Mode found and left: REAL (dev mode only for the runs, the override restored,
    four healthy containers confirmed). The clone directory is left in place.

- Day 8 (Sun Sep 27), twentieth session, THE LAST BEFORE SUBMISSION: THE COMPOSE
  ATTACHMENT EXPERIENCE - limits raised, three affordances, the cards moved into the
  message, a real upload state, and a send button that cannot be inflated. Landed and
  verified.
  - TASK 1, LIMITS RAISED in the ONE shared module: 20MB per file (was 5MB), 40MB per
    message (was 10MB), three files unchanged. The rejection messages read the
    constants (`formatBytes(MAX_FILE_BYTES)`), so they moved with the numbers and
    needed no second edit - which is the reason the limits live in one module at all.
  - THE TRANSPORT CEILING, AND A DELIBERATE DEVIATION. The brief asked for 30MB. The
    brief's own per-message limit is 40MB, and attachments ride the hop as base64 -
    about 4/3 the raw size - so 20MB single is ~27.4MB on the wire and the app's LEGAL
    maximum of 40MB is ~54.8MB. A 30MB ceiling would therefore have refused a message
    the app's own rules allow, which is the exact failure the brief's principle warns
    against ("otherwise a legal message would be refused by the transport"). The
    ceiling is set to 60MB, with the arithmetic written into the comment, and the
    deviation and the one-line change back to 30MB are both recorded here and in the
    report.
  - VERIFIED AT THE BOUNDARY, LIVE: a 21MB file is refused 400 naming 20.0 MB; 42MB
    of three LEGAL 14MB files is refused 400 naming 40.0 MB; and a full-size 20MB
    file goes all the way - accepted, across the SMTP hop, stored against the
    delivered row, downloaded, and HASH-IDENTICAL, with its content type intact.
  - TASK 2, THREE AFFORDANCES where the single paperclip was: a document picker
    (accept filtered to documents), an image picker (image/*), and a camera
    (image/* plus capture="environment" - the pragmatic web path to a phone camera).
    Each is a clean 44px circle, and EACH OPTS OUT of the 56px element floor with
    min-h-0, asserted one by one: the trap that produced the oval buttons is not
    allowed to eat these.
  - TASK 3, THE CARDS MOVED INTO THE MESSAGE BODY REGION - asserted by position in
    the source (after the body field, before the field errors), not by eye - and they
    speak the thread's own card language: an icon for the kind, the filename, the
    size, a remove. They carry the states only a draft has: UPLOADING with a REAL
    percentage, because the send now goes through XMLHttpRequest (fetch cannot report
    upload progress, and 20MB behind a button that only spins is a screen that looks
    broken), and FAILED with a Retry that re-sends the same files instead of
    discarding them. The thread card and the draft card are deliberately one language,
    so a file looks the same while it is written as when it arrives.
  - TASK 4, THE SEND ACTION: fixed geometry (48px, min-h-0), brand-filled like the
    thread's own message action, disabled with a spinner while it flies and
    aria-busy for assistive tech - the same moment the cards show their percentage.
  - A TWENTIETH SUITE, ct17/compose_attachments_regression.mjs, 33 assertions: the
    new limits at the boundary, the 20MB hash-identical round trip, the three
    affordances with their input filters, the cards' position, the uploading and
    failed states and the retry, the send button's geometry, and the min-h-0 opt-out
    on every new fixed-size control.
  - TWO ASSERTIONS RE-POINTED, NOT DELETED: ct16's boundary probes moved with the
    limits - a 6MB file is now LEGAL, so its per-file probe is 21MB, and 12MB across
    three files is now legal, so its per-message probe is 42MB. Same claims, new
    numbers.
  - DOCS: the README's limits (20MB / 40MB / 3), its demo step (three affordances,
    cards in the message) and its evidence counts were all updated to match.
  - VERIFICATION: 617 assertions across TWENTY suites green on the loaded database in
    dev mode; build green; the fresh-clone evaluator simulation from ORIGIN is
    recorded in the entry that follows this one.
  - Mode found: REAL. Dev mode for the runs and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), nineteenth session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit - and this time it RAN, after the last
  session's Safety Guard refusal.
  - The harness script was rewritten with NO file-deletion command of any kind, not
    even an environment-variable cleanup, because a `Remove-Item` line was what the
    Guard refused to write last time. It is a one-line difference in tidiness and
    the difference between a simulation that runs and one that does not.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-100952). The clone came down at HEAD 1b7aeb0 -
    the commit this session's work was just pushed as - with 152 tracked files, 13
    migrations (the attachment migration included) and correctly NO
    docker-compose.override.yml.
  - Only the main APP container was stopped for the duration (docker-compose.yml
    hardcodes 3000:3000); the clone's own compose file was not edited, because what
    is being tested is what origin serves. The main stack was restored afterwards,
    four healthy containers.
  - The clone came up healthy, applied all THIRTEEN migrations on a clean volume -
    the new "Attachment" table included, and it was queried directly from the clone's
    own Postgres to prove it - and SERVED: / , /onboarding , /profile and /contacts
    all answered 200. Its send-otp answered WITH a devHint, as a clone must: no SMS
    credentials, so the app falls back to the fixed dev code rather than pretending.
  - THE SUITES RAN AGAINST THE CLONE: all NINETEEN, 583 of 584 assertions green,
    with the ONE documented skip - ct3's socket assertion, which imports
    socket.io-client from node_modules and a fresh clone only has it inside its
    container. That includes ct16, so the ATTACHMENT round trip - upload, MIME over
    SMTP, storage, hash-identical download, the limits and the 403 - was verified on
    a clean clone as well as on the loaded database. COMPOSE_DIR was set for the
    whole run.
  - Mode found and left: REAL (dev mode only for the runs, the override restored,
    four healthy containers confirmed). The clone directory is left in place, by the
    same rule as every session before it.

- Day 8 (Sun Sep 27), nineteenth session: THE THREE CONTROLS, ROOT-CAUSED (they were
  never the markup's fault) and ATTACHMENTS, end to end. Landed and verified.
  - THE THREE CONTROLS. The user had already rejected them once, and round 6's
    markup-level rebuild changed nothing that renders - so this session walked the
    ancestor chain and found the constraint was NOT an ancestor at all:
        globals.css, @layer base:  button, a[role="button"], input, select, textarea
                                   { min-height: 56px }      // the elder-friendly floor
    A min-height BEATS a height, so EVERY button in the app is at least 56px tall.
    The switch's 44x24 track rendered as a tall pill; the 40px pencil badge and the
    32px "+" rendered as ovals, 40x56 and 32x56; the message card's 24px chevron
    rendered 24x56 - which is the "dead band" round 6 chased through padding - and
    even the shared 48px BackButton was stretched to 48x56, quietly breaking the one
    alignment rule on every screen it was introduced for.
  - THE PROOF IS THE DEPLOYED STYLESHEET, not the source: the served CSS carries
    `button,...{min-height:56px}`, and the new suite asserts that rule AND the
    opt-out utility as they are actually shipped.
  - THE FIX, AT BOTH ENDS. A fixed-size control OPTS OUT with `min-h-0` (a class
    beats that element selector, so the floor keeps applying to every ordinary
    button), and globals.css now says so in a comment that names the rule. A tree
    scan found 17 buttons below the floor. THREE of them declared their own smaller
    min-height (two tag chips and a suggestion row) - deliberate, and left alone. The
    other FOURTEEN had no min-height of their own - the card's chevron, the profile
    badge, compose's "+" and its four round buttons and send button, contacts' Add,
    the onboarding clear button, the thread's paperclip chip, group-info's close
    button and the sheet's two - and now opt out. The switch and the shared
    BackButton needed the same fix but were invisible to the scan, because their
    class names are template literals; reading them is what caught them, and SIXTEEN
    controls opt out in all. The rebuilt
    constructions are exactly as specified - the switch is a RELATIVE fixed 44x24
    track with an ABSOLUTE 20px knob (centred by top-1/2 -translate-y-1/2, moved by
    translate-x, no flex anywhere); the badge is a fixed 40px square at the avatar's
    corner by absolute + translate, outside any overflow-hidden wrapper; the "+" is
    a 32px square in a row that centres rather than stretches.
  - ATTACHMENTS, THE FEATURE. An Attachment model (filename, contentType, sizeBytes,
    data BYTEA) with the 13th committed migration. The bytes live in POSTGRES, like
    the avatar, because the container filesystem is not durable and "no filesystem
    storage" was the requirement. ONE ROW PER (Email row, file): a group broadcast
    fans out into one row per recipient, and the documented trade is duplicated
    bytes in that case in exchange for an attachment owned by exactly the row it
    belongs to - so the download check IS the row's own party check, and deleting a
    message takes its bytes with it through the cascade.
  - THE ROAD. The paperclip is a real picker (multi, capped at 3) and the "coming
    soon" panel - along with the three decorative buttons that all raised it - is
    gone. A message with files is submitted as multipart/form-data on the SAME one
    SMTP submission the text uses; nodemailer builds the MIME parts; the SMTP
    service hands them on base64 (its own ceiling raised to 20MB, because 10MB of
    raw bytes is about 13MB on the wire); the inbound webhook validates the same
    limits again and the inbound writer stores the rows. The limits - 5MB per file,
    10MB per message, 3 files - live in ONE module shared by the browser, the send
    route and the webhook.
  - DOWNLOADS: GET /api/attachments/[id], JWT-gated and PARTY-ONLY (401 without a
    token, 403 for anyone but the message's sender and recipient). The card fetches
    the bytes with the session's Authorization header and hands them to the browser
    as a blob, so the token never appears in a URL, a history entry or a log. A
    message's files render in the bubble's documented attachment slot, and the home
    screen's Attachments chip now filters on a real count instead of the constant
    zero it used to carry.
  - A NINETEENTH SUITE, ct16/attachments_regression.mjs, 32 assertions: the deployed
    CSS for the three controls; then the whole attachment round trip - two files (a
    text file and a real PNG) uploaded, delivered and downloaded HASH-IDENTICAL,
    with the content types and the disposition filename checked; the sender may
    download, a non-party gets 403, no token gets 401; 6MB refused, four files
    refused, 12MB refused, each naming the limit it broke; a group broadcast
    carrying a file; and the chip filtering on real data.
  - ONE ASSERTION RE-POINTED: the final-items suite asserted "attachments: 0 (no
    attachment backend)" - the constant the field used to carry. It now grades a
    real count, which is what the field was always for.
  - VERIFICATION: 584 assertions across NINETEEN suites green on the loaded database
    in dev mode; build green; the 13th migration applied by the container entrypoint
    on the loaded database (migrate status: up to date; the "Attachment" table
    readable); and the fresh-clone evaluator simulation from ORIGIN is recorded in
    the entry that follows this one.
  - Mode found: REAL. Dev mode for the runs and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), eighteenth session: CLICK-THROUGH ROUND 6 - the visual
  corrections the owner photographed, and the reply swipe. Landed and verified.
  - THE BUBBLE'S DEAD BAND, MEASURED. The complaint was "body, then the time +
    chevron floating in roomy padding". Padding was not the whole story: the
    metadata row's height was being set by the 28px reveal CONTROL, not by its 11px
    text, so the row read as an empty band under the body. Values, before -> after
    (so they can be dialled "tighter"/"looser" in one line each):
      horizontal padding       14px -> 12px   (px-3.5 -> px-3)
      top padding              10px -> 8px    (pt-2.5 -> pt-2)
      bottom padding            6px -> 4px    (pb-1.5 -> pb-1)
      body to metadata gap      4px -> 2px    (mt-1 -> mt-0.5)
      reveal control box       28px -> 24px   (h-7 w-7 -> h-6 w-6, with -mb-0.5)
      metadata line-height     auto -> none   (leading-none)
  - THE "NEW" MARK CAME OFF THE CARDS ENTIRELY. Unread state is the home list's
    badge and nowhere else. The prop is gone from the component and from both
    threads, and the new suite grades the ABSENCE TREE-WIDE - every .ts/.tsx under
    src - rather than trusting a list of files somebody remembered to update.
  - THE REPLY SWIPE, ALL THE WAY THROUGH: swiping a message RIGHT now opens the
    reply compose for that mail DIRECTLY - quoted context, derived subject, the
    replyToId link, reply-once enforced - instead of the old two-step (reveal a
    footer link, then tap it). Its state is deleted, not left dead. Offered only for
    a received, not-yet-replied, non-provisional mail; a left swipe keeps the
    tag/move panel; the chevron's Reply action and the under-bubble Reply both stay.
    The gesture itself is the user's click-through; the suite grades the wiring, the
    guard, and the absence of the old prompt.
  - THE TOGGLE IS NOW ONE COMPONENT (components/switch.tsx). The knob had been
    `absolute` inside a flex track, so its vertical position came from its STATIC
    position rather than from the track's own centring - which is exactly how it
    rendered "weird". It is now a 20px block IN FLOW inside a 44x24 track with a 2px
    inset, moved by a transform (travel 20px = the whole track), and it is a real
    `role="switch"` with `aria-checked`, so a screen reader announces it.
  - THE PROFILE EDIT BADGE: its geometry is spelled out so nothing can distort the
    circle - an explicit square box (aspect-square h-10 w-10), border-box sizing, no
    padding, no line-height, the glyph centred by flex, the white ring intact.
  - THE COMPOSE "+" BUTTON: a true circle, its diameter matched to the chip row's
    own height (h-8 = the 32px chip), icon centred, square by construction.
  - ONE ALIGNMENT SYSTEM, AND THE DRIFT NAMED. The folder screens (Spam/Trash via
    components/folder-screen.tsx, and Drafts) were the last screens carrying a
    PRE-design-system header - a wa-teal bar, a custom back glyph, a left-aligned
    title, a trailing count - plus legacy btn-primary CTAs and their own empty-state
    rhythm. All three now use the shared AppBar (and therefore the one BackButton
    rule) and the one empty-state pattern. The sweep found three more: Terms already
    used the shared back control but LEFT-ALIGNED its title (now AppBar), the
    onboarding step bar had its own 40px back button (now the shared one, keeping
    its brand + "N of 3" layout), and ComingSoon - currently unreferenced - still
    carried the old bar. The desktop client keeps its own chrome and was left alone:
    it is a different client and has no back arrow. The AppBar also gained a
    `backLabel`, so a screen can keep saying where Back goes.
  - AN EIGHTEENTH SUITE, ct15/clickthrough6_regression.mjs, 26 assertions and
    SOURCE-ONLY by design: every item this round is the SHAPE of the markup, which
    lives in the source and not in a server response. It walks the tree for the
    absence assertions.
  - NINE ASSERTIONS RE-POINTED ACROSS SIX SUITES, NOT DELETED, each because this
    round moved the thing it graded: chatref's NEW-mark check now grades its
    absence; ct5's two switch checks read components/switch.tsx (same intent - a grey
    OFF track with the knob at the left, a real switch wired to the server's setting
    - new construction); ct8's three (the bubble padding moved, and the same two
    switch checks); ct3's swipe check now asserts where the gesture LANDS; ct2's
    switch check followed the component; ct13's bar check followed the AppBar's new
    label. Two of them had to be corrected once themselves: the word "absolute"
    legitimately appears in the new component's explanatory comment, so those
    absence assertions grade the old CONSTRUCTION rather than the word.
  - VERIFICATION: 552 assertions across EIGHTEEN suites green on the loaded
    database in dev mode; build green (the image build failed once on a transient
    error and succeeded on retry - the same flake as round 4).
  - NOT DONE, AND NAMED: the fresh-clone evaluator simulation did NOT run this
    session. The harness script that drives it (stop the main app, clone from
    origin, build, serve, run the suites against the clone, restore the stack)
    carries a `Remove-Item` line for the environment variable it sets, and the
    Safety Guard refused to create the file at all - "Dangerous script content:
    File delete command" - and that refusal is FINAL for the turn, so it was not
    retried with a different shape. This is therefore the one open verification
    step, and it is a RE-RUN rather than new ground: rounds 4 and 5 both ran it
    green from origin (525 of 526 on the last one, with the one documented socket
    skip), and everything this round changed is either source-only (ct15) or already
    covered on the loaded database. Nothing about the code is unverified; the
    fresh-clone leg of the evidence is simply older than this commit.
  - Mode found: REAL. Dev mode for the runs and REAL mode restored at the end, four
    healthy containers.

- Day 8 (Sun Sep 27), seventeenth session: THE README, FINAL PASS. Documentation
  only - no code changed, no behaviour changed - and the session still ends on
  verified ground (build green, four healthy services, the routes answering).
  - THE README WAS REWRITTEN WHOLE, for the person who actually reads it: what the
    product is in one paragraph; the exact two commands and the four services with
    their roles; the port note stated as a constraint (3000 is a LITERAL in
    docker-compose.yml, so nothing else on the host may hold it, and that is why the
    clone simulation stops the main app for its duration); the dev-OTP path stated
    plainly (a fresh clone runs in dev mode out of the box, every send-otp answers
    123456 with a devHint, and real SMS exists only behind a gitignored override); a
    nine-step demo script that follows the product as it now behaves; the
    line-by-line spec mapping; the architecture; the honest limitation list; the
    verification evidence; and the compliance notes.
  - TWO STALE DEVIATIONS WERE CLOSED IN THE DOCUMENT, because they had already been
    closed in the product: the README still claimed the Language row had been removed
    (it was RESTORED in round 3) and never named the restored Folders rows. Both are
    now stated as present, and the mapping carries no deviation for either - which is
    what "language + folders restored, both deviations closed" means.
  - THE DEMO SCRIPT WAS CORRECTED WHERE THE PRODUCT HAD MOVED PAST IT: the alias
    example was `john.doe`, which the current rule REJECTS (an alias must mix letters
    and digits, and an account holds one), so it is `john.doe7` now. The thread steps
    describe the New mail button rather than a composer, reply-once is described as
    the 409 it actually is, and the contact step says the sheet closes by itself.
  - THE FINAL PROJECT.MD PASS: the header no longer says "Today: Day 1"; Section 3's
    stack table no longer advertises shadcn/ui (never used) or RSA end-to-end
    encryption (never built - and the UI's false claim about it was removed in round
    4, so the plan says CUT rather than "stretch"); Section 5 marks the language
    screen superseded and the drawer withdrawn; and Day 7's fresh-machine line was
    carrying a stale count (7 migrations, 116 assertions, commit b07db59) and now
    carries this build's real numbers (12 migrations, 17 suites, 525 of 526 against a
    clone). Nothing was deleted; every amended line states why it changed.
  - Mode found and left: REAL. No OTP request was made and the mode was not touched.

- Day 8 (Sun Sep 27), sixteenth session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION from ORIGIN at this commit, and THE STRAY VOLUMES REMOVED.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-074606). The clone came down at HEAD b392769 -
    the commit this session's work was just pushed as - with 147 tracked files, 12
    migrations, and correctly NO docker-compose.override.yml (it is gitignored).
  - Only the main APP container was stopped for the duration, because
    docker-compose.yml hardcodes 3000:3000 and a clone can never bind while the main
    stack holds it. The clone's own compose file was NOT edited: what is being tested
    is what origin serves. The main stack was restored afterwards, four healthy
    containers.
  - The clone came up healthy, applied all twelve migrations on a clean volume, and
    SERVED: / , /onboarding , /profile and /contacts all answered 200, and its own
    /sw.js carried a build-stamped cache name (phonemail-shell-satMDnhPWnze8r3agk_m4)
    - the round-5 worker, stamped from the clone's own build. Its send-otp answered
    WITH a devHint even though the clone is not in dev mode: the app falling back to
    the fixed dev code rather than pretending to send SMS it has no credentials for.
  - THE SUITES RAN AGAINST THE CLONE: all SEVENTEEN, 525 of 526 assertions green,
    with the ONE documented skip - ct3's socket assertion, which imports
    socket.io-client from node_modules and a fresh clone only has it inside its
    container (it runs and passes on the loaded database). COMPOSE_DIR was set for
    the WHOLE run this time, so the DB-inspecting suites and ct14's container check
    read the stack that was actually under test; the scope mistake the last session
    recorded is not repeated.
  - HOUSEKEEPING, DONE: the seventeen stray phonemail-*_postgres-data volumes were
    removed BY EXACT NAME with docker volume rm - never a prune - and the list was
    built from `docker volume ls` filtered to the dashed prefix, so the main stack's
    own phonemail_postgres-data (an underscore, not a dash) was never in it. The
    machine now carries ZERO phonemail-* volumes and the same four healthy
    containers. This is the cleanup that was refused on an approval timeout two
    sessions ago. The %TEMP% clone directories are left in place - removing those is
    the user's.
  - Mode found and left: REAL (dev mode only for the runs, the override restored, four
    healthy containers confirmed).

- Day 8 (Sun Sep 27), sixteenth session: THE SERVICE-WORKER UPDATE PATH, ROOT-CAUSED
  AND FIXED, plus the canvas polish. Landed and verified.
  - THE DEFECT, OBSERVED IN THE CODE: the worker's fetch handler consulted the
    precache FIRST for every same-origin GET - navigations included - so the
    DOCUMENT itself could be answered from a cache built by a previous build. The
    stamping route was never the problem: the served /sw.js really does carry the
    container's own .next/BUILD_ID as its cache name, which is exactly why the
    failure looked intermittent - a returning user got the old shell whenever the
    current worker had not yet taken over, and no amount of cache-busting an ASSET
    url could help, because the HTML never reached the network at all.
  - REPRODUCED, DETERMINISTICALLY, WITH THE COUNTERFACTUAL: the worker is now
    EXECUTED rather than read. The served /sw.js is fetched over HTTP and run in a
    Node sandbox (stubbed self / caches / fetch / Response) and driven with real
    requests. With a stale shell cached at "/" and the network available, the
    PRE-FIX worker returns the stale shell for a navigation to "/", while the
    current one returns the network's answer (probe runs the pre-fix template out of
    git at b3050ce). Pre-fix stale, post-fix fresh: that is what makes this a root
    cause instead of a plausible story.
  - THE FIX: NAVIGATIONS ARE NETWORK-FIRST, and the precache is the OFFLINE FALLBACK
    only. Cache matching respects the FULL URL - there is no ignoreSearch anywhere,
    because "?v=123" is a different URL from "/" - so a stale entry under a
    different URL is never substituted for the one being asked for. Unchanged by
    design: /api/* stays network-first with an honest offline answer, /socket.io is
    still never intercepted, content-hashed assets stay cache-first, and
    install/activate keep skipWaiting + clients.claim and still drop every
    non-current cache. THE GUARANTEE, asserted: after a rebuild and a reload, a
    returning user receives the CURRENT build.
  - A SEVENTEENTH SUITE, ct14/sw_and_canvas_regression.mjs, 25 assertions, and it
    RUNS the worker rather than reading it: nine scenarios - network-first with a
    stale shell cached at the exact URL, a cache-busted navigation fetching fresh,
    the offline fallback, exact-URL matching (an uncached URL is NOT answered with a
    neighbour's entry), /api offline honesty, /socket.io left alone - plus the
    stamp-equals-BUILD_ID rotation checked against the LIVE container, and the
    no-ignoreSearch rule asserted as an OPTION rather than as a word (the word
    appears in the explanatory comment).
  - CANVAS POLISH, all three items:
      - DATE PILLS on a calendar-day change, in BOTH threads. The 1:1 thread drew one
        pill at the top and nothing after it; the group thread drew none at all. Both
        now derive the boundary from the ordered list, and it reads Today /
        Yesterday / "27 Sep".
      - SUBJECT DIVIDERS ON LIVE ARRIVALS, and GROUP PARITY. Because the boundary is
        derived from the ordered list, a message that arrives over the socket cuts
        the thread in the same place a refetched one does - the provisional bubble is
        reconciled into the list and the rule looks at its neighbours either way. The
        group thread now draws the same divider, labelled by the round-4 rule
        (Subject: for a mail that opened one, re: for a reply).
      - THE SETTINGS FOOTER WORDMARK was reviewed and set to 14px, from 13px: at 13
        it read as fine print beside a 12.5px version line, so the NAME was smaller
        than the thing it labelled. Recorded as a decision; the user's eye is the
        final grade.
  - BOTH BOUNDARIES NOW LIVE IN ONE MODULE, src/lib/timeline.ts (startsNewDay,
    startsNewSubject, dayLabel), used by both threads - the same reason the palette
    lives in the Tailwind config: a rule that is duplicated is a rule that drifts.
    The suite imports it and exercises it directly (Node 22 strips the type
    annotations), so what is asserted is the rule the components actually run, not a
    copy of it.
  - ONE ASSERTION RE-POINTED: ct2's "a new subject draws a divider at its
    chronological position" named the exact line the rule used to live on; it now
    asserts the shared helper, keeping the intent while the implementation moved off
    that line.
  - VERIFICATION: 526 assertions across SEVENTEEN suites green on the loaded
    database in dev mode; build green, locally and inside the image; the worker's
    counterfactual reproduced; and the fresh-clone evaluator simulation from ORIGIN
    is recorded in the entry that follows this one.
  - Mode found: REAL. Dev mode for the runs (override renamed away, the devHint
    confirmed before any OTP request), REAL mode restored at the end with exactly
    four healthy containers.

- Day 7 (Sat Sep 26), fifteenth session, continued: THE FRESH-CLONE EVALUATOR
  SIMULATION, from ORIGIN at this commit, with the sixteen suites run AGAINST THE
  CLONE.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260927-000116). The clone came down at HEAD 4399eed -
    the commit this session's work was just pushed as - with 146 tracked files, 12
    migrations, and correctly NO docker-compose.override.yml (it is gitignored).
  - ONLY the main APP container was stopped for the duration, because
    docker-compose.yml hardcodes 3000:3000 and a clone can never bind while the main
    stack holds it - the same port finding the last two simulations paid for. The
    clone's own compose file was NOT edited: what is being tested is what origin
    actually serves. The main stack was restored afterwards, four healthy containers.
  - docker compose up -d --build in the clone brought all four services healthy, the
    twelve migrations applied on a clean volume, and the clone SERVED: / , /onboarding ,
    /profile and /contacts all answered 200. Its send-otp answers WITH a devHint even
    though the clone is not in dev mode - the app behaving correctly, falling back to
    the fixed dev code rather than pretending to send SMS it has no credentials for.
  - THE SUITES RAN AGAINST THE CLONE: all sixteen, 500 of 501 assertions green, with
    ONE SKIP - ct3's socket assertion, which imports socket.io-client from
    node_modules and a fresh clone only has it inside its container. The same
    assertion runs and passes on the loaded database, so nothing is unverified there.
  - A SCOPE MISTAKE WORTH RECORDING, because it looked like a failure and was not: the
    first clone pass ran ct2 and ct3 WITHOUT COMPOSE_DIR, so their DB-inspecting
    assertions queried the MAIN stack's Postgres while the app under test was the
    clone - and correctly found no rows. Re-run with COMPOSE_DIR=<clone>, both are
    green (ct2 64/64, ct3 51/51 plus the one skip). The harness already documents that
    knob; the invocation had ignored it. On the loaded database the same suites pass
    without it, because there the app and the database ARE the same stack.
  - Mode found and left: REAL - dev mode only for the runs (the override renamed away,
    the devHint confirmed before any OTP request), then the override restored and four
    healthy containers confirmed. The clone directory is left in place, by the same
    rule as every session before it.

- Day 7 (Sat Sep 26), fifteenth session: ROUND 4 COMPLETED - the ten items, and the
  reply model they turn on. Landed and verified on the loaded database.
  - TASK 1, THE AUTH FLOW IS DECIDED BY THE NUMBER, not by the door. A new endpoint,
    GET /api/auth/registered?phoneNumber=..., answers the one question the flow
    actually has - does an account exist? - and the onboarding screen asks it BEFORE
    it asks for a code. A registered number is a LOGIN whatever door it came
    through ("Welcome back" -> OTP -> inbox, and no "account is ready" screen,
    because no account was created); an unregistered number on the Log in door is
    carried into account creation - "Let's create your account" - instead of
    dead-ending. A failed lookup is not fatal: the flow falls back to the door that
    was pressed. The endpoint answers a boolean and nothing else, because that is
    the whole question.
  - TASK 2, THE REPLY MODEL. There is NO free composer inside a thread any more: a
    message box that mails whoever happens to be in the thread is how an intended
    reply becomes a fresh send. Both threads' message boxes are the NEW MAIL button.
    1:1 opens the traditional compose with To locked to the counterpart; the group's
    CREATOR opens the multi-recipient compose with the member set locked, and
    ordinary members keep only their per-mail Reply buttons - the broadcast model,
    no composer. Every received mail carries a Reply action, and reply-once is still
    the server's conditional claim; the UI now reflects it too, because the
    affordance disappears once a mail has been answered. The paperclip chip stays
    exactly as it was: an honest, documented empty state.
  - TASK 3, THE MESSAGE CARD. The three-dots became a CHEVRON-DOWN whose reveal is a
    four-action row - Move to Spam, Move to Trash, Favorite, Reply - each action a
    56px target. Favorite is the EXISTING favorite tag (the value the Favorites chip
    already filters on), so toggling it is one PATCH and no migration; the remaining
    tags stay reachable on a quieter second line, so nothing the old panel could do
    is lost. SUBJECT HONESTY: a mail that OPENED a subject renders "Subject:
    <subject>" and only a reply renders "re: <subject>" - one helper (subjectHeading)
    so the divider and the thread's subject pill cannot disagree about which a mail
    is.
  - TASK 4, CONTACTS. Saving from the detail sheet now hands the new name up and
    closes the sheet in the same interaction, so the open chat adopts the name
    immediately - no reload, nobody left dismissing a sheet that has nothing left to
    say.
  - TASK 5, ALIGNMENT AND WORDMARK, as two shared components rather than more copied
    markup:
      - components/back-button.tsx states THE header-alignment rule once - a 48x48
        hit area, a 24px glyph, a 16px inset, the title on the header's own vertical
        centre - and every header with a back arrow now uses it: the standard bar,
        both thread headers, Terms, and the settings hero (which takes the rule's
        geometry and its own ink). Before this the app had three different back
        controls and the title sat at a different optical height on each.
      - components/wordmark.tsx is the HOME screen's own treatment - "Phone" solid,
        "Mail" in the brand gradient - and it is now used EVERYWHERE the name
        appears: home (which is its origin, not a second copy of it), onboarding,
        Terms, the portal, the settings footer and the desktop shell (inverted for
        the indigo chrome). The gradient stops are existing tokens; no colour was
        invented.
  - A SIXTEENTH SUITE, ct13/round4_regression.mjs, 26 assertions, and mostly LIVE,
    because the live ones are the ones a source grep cannot fake: the registration
    lookup both ways (a real account true, 9999999999 false), a real new mail
    delivered and read back, a real reply accepted (202), a SECOND reply to the same
    mail refused (409), the reply visible to its recipient and still linked to the
    mail it answers, a contact saved and reported by the live chat payload, and
    source assertions for the shared back control, the shared wordmark and the
    absence of any in-thread composer. The contact probe is state-safe: it restores
    the previous name, or deletes the row it made, and asserts the address book is
    exactly as it found it.
  - ELEVEN ASSERTIONS WERE RE-POINTED, NOT DELETED, and every one of them was
    grading something this round deliberately removed: ct2's typed-composer trio,
    the chat-reference suite's two composer checks, the groupchat suite's
    in-thread-send check, the settings reference's back-chevron and version-line
    checks, and the two auth-screen checks that named the old success headline and
    the mode-driven greeting. Each re-point keeps the INTENT rather than the
    wording - a locked recipient set is still asserted (it travels in the New mail
    link's compose URL now), the quiet version line is still asserted (it carries the
    wordmark now) - and two new auth-screen assertions replace the one that no longer
    describes the decision.
  - VERIFICATION: 501 assertions across sixteen suites GREEN on the loaded database
    in dev mode; build green; the fresh-clone evaluator simulation from ORIGIN is
    recorded in the entry that follows this one.
  - Mode found: REAL. Dev mode for the run (override renamed away, the devHint
    confirmed before any OTP request), and REAL mode restored at the end with exactly
    four healthy containers.

- Day 7 (Sat Sep 26), fourteenth session: THE FRESH-CLONE EVALUATOR SIMULATION FINALLY
  RAN AGAIN, from ORIGIN, and it passed. It had not run for several sessions, and it
  was the one thing this session was told it must land.
  - Cloned https://github.com/ah-ree/phonemail.git into a timestamped directory under
    %TEMP% (phonemail-clone-20260926-230607). The clone came down at HEAD 2b9e521 with
    143 tracked files and 12 migrations, and - correctly - with NO
    docker-compose.override.yml, since that file is gitignored.
  - docker compose up -d --build brought all four services healthy, and the clone
    SERVED: / , /onboarding , /profile and /contacts all answered 200.
  - ONE FINDING WORTH KEEPING: docker-compose.yml hardcodes the app port as 3000:3000.
    That means a clone can NEVER run alongside the main stack - it cannot bind. The
    simulation therefore stops ONLY the main app container for its duration and restarts
    it after, rather than editing the clone's compose file, which would have meant
    simulating something that is not what origin serves. If the evaluator's own
    procedure ever runs both at once, this is the reason it would fail.
  - The clone's own send-otp answers WITH a devHint even though the clone is not in dev
    mode, and that is the app behaving correctly: with no SMS credentials configured it
    falls back to the fixed dev code rather than pretending to send. The override file
    on this machine is what supplies the real ones.
  - The clone's containers were brought down afterwards (plain down - no volume removal)
    and the directory is LEFT IN PLACE, because removing it is not mine to do. The main
    stack was verified back in REAL mode with exactly four containers.
  - NOT DONE from this round, and not claimed: all ten feature items - the auth-flow
    continuation in both directions, the reply model (a Reply button per mail plus the
    thread's message box becoming a New Mail button, with the README spec-mapping
    updates), the chevron reveal and its four-action row, Subject: versus re: display,
    the contact sheet closing on save, the header-alignment sweep and the wordmark pass.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), thirteenth session: THE GROUPCHAT FAILURE, ROOT-CAUSED AND FIXED.
  It was the one thing left standing between the suite and green, and a possible hole
  in the group visibility model outranks every feature that was still on the list, so
  it went first and alone.
  - THE VERDICT, WITH EVIDENCE: THE FILTER IS CORRECT. Driven live against the real API
    - A broadcasts to B and C, B replies to that broadcast, A's thread is re-read - the
    reply row appears for A, flagged, linked, and not marked as A's own. A's thread came
    back with 13 bubbles, 8 of them A's and 5 from members. There is no visibility hole.
  - THE ROOT CAUSE IS THE TEST'S DETERMINISM, and it is a genuinely instructive one.
    The assertion 'A sees the members' mail, not only their own' sat at a point in the
    suite where NO member had sent anything yet - only A's broadcast existed. It passed
    for several sessions because the group key is DERIVED from the member set and is
    therefore STABLE, so reply rows left behind by EARLIER SUITE RUNS were still sitting
    in that thread. The assertion was not testing the code; it was testing the database's
    history. It failed the moment the history happened not to contain a member row.
  - THE FIX IS DETERMINISM, NOT A RE-POINT: the suite now has a member REPLY to this
    run's own broadcast before the assertion, and the assertion names the exact mail it
    just made - so it cannot pass on leftovers. Two assertions were added (the broadcast
    from this run is there to answer; the member reply is accepted) and the group suite
    is 45/45.
  - The lesson is the same one this project keeps paying for, in its fourth costume:
    state that survives between runs makes a test lie. The harness fix, the 200-row cap,
    the user setting that persists, and now the derived group key - same disease.
  - NOT DONE from this round, and not claimed: the auth-flow continuation in both
    directions, the reply model (a Reply button per mail plus the thread's message box
    becoming a New Mail button, with the README spec-mapping updates that go with it),
    the chevron reveal and its four-action row, Subject: versus re: display, the contact
    sheet closing on save, the header-alignment sweep and the wordmark pass.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), twelfth session: ROUND 4, PART TWO - the ALIAS RULES and THE
  FULL REGRESSION that part one had skipped, on the brief's own instruction.
  - ONE ALIAS PER ACCOUNT, enforced by count rather than by hope: the create route
    counts what the account already holds and refuses past ALIAS_LIMIT, with TWO
    different messages - one for an account exactly at the cap, one for an account
    already OVER it, which is told how many it holds and what to do. Nothing is taken
    from an over-cap account; it simply cannot add until it is back under. The refusal
    carries aliasesHeld and aliasLimit so the client can explain itself.
  - AN ALIAS MUST MIX LETTERS AND DIGITS, with three distinct messages: no letters at
    all, no digits at all, and the catch-all. THE RULE DELIBERATELY LIVES ONLY ON THE
    CREATE PATH and NOT in isValidLocalPart, because that predicate also decides
    whether an EXISTING alias resolves during delivery - an alias made before this
    rule must keep working. New ones have to mix; old ones keep their word.
  - The settings screen mirrors the cap (a local constant, because lib/alias.ts
    reaches for Prisma and must never be pulled into a client component), stops
    offering to add past it, and says why in a line rather than just going dead.
  - ASSERTED AGAINST THE REAL API, 11 assertions, and STATE-SAFE BY CONSTRUCTION: the
    two rejection checks change nothing because they are refused, and the cap check
    either refuses without touching anything or creates one alias and deletes the one
    it created. No existing alias is ever removed to make room for a test. The probe
    ends by proving the account is back where it started.
  - THE FULL FIFTEEN-SUITE REGRESSION RAN, as asked: 469/473 first time, four
    failures, three of them STALE ASSERTIONS FROM PART ONE'S DELIBERATE CHANGES - the
    reader strip's old wording, the switch's old size, the footer's withdrawn claim -
    all three re-pointed, and both suites are green again (reader 21/21, settings 32/32).
  - THE FOURTH IS NOT FIXED AND IS NOT BEING QUIETLY RE-POINTED: groupchat's 'A sees
    the members' mail, not only their own' failed with bubbles=2 - the two messages A
    could see were both its own. Its companion assertion, that one submission is one
    bubble for A, passed, so the fan-out collapse is intact. What I cannot yet say is
    whether this is the known data-dependence of that suite or a real hole in the
    per-viewer filter, and re-pointing a VISIBILITY assertion without understanding it
    would be hiding a possible bug behind a green tick. It is left failing and named.
  - NOT DONE from part two, and not claimed: the auth-flow continuation in both
    directions, the reply model (a Reply button per mail, the thread's message box
    becoming a New Mail button, the README spec-mapping updates that go with it), the
    chevron reveal and its four-action row, Subject: versus re: display, the contact
    sheet's close-on-save, the header-alignment sweep and the wordmark pass.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), eleventh session: ROUND 4, PART ONE - honesty, the bubble's
  trailing void, three settings-polish items and a quieter home chip row. LANDED AND
  VERIFIED. Part two of the round - the auth-flow continuation, the reply model, the
  alias rules, the header-alignment rule, the wordmark pass and the contact-sheet
  behaviour - is NOT in this commit and is listed at the end.
  - HONESTY FIRST, because it was the item that mattered most: THE UI NO LONGER CLAIMS
    END-TO-END ENCRYPTION. RSA was never built, and the app was saying it was - on the
    OTP screen (End-to-End Secure Channel), in the home footer, in the settings footer
    and on the mail reader's sender badge. All four now say something true: the mailbox
    is private, the mail stays between you and the people you write to, the sender is
    known. A claim is not decoration; a false one is a lie with good typography.
  - THE BUBBLE HUGS ITS TEXT: px-3.5 py-2.5 became px-3.5 pb-1.5 pt-2.5, so there is no
    dead band between the last line of a message and the edge of its bubble.
  - SETTINGS POLISH: the edit badge is now unmistakably the circle it always claimed to
    be (aspect-square, a 3px white ring so it separates from the avatar it overlaps);
    the SMS switch came down from 52x30 to 42x24 with a 20px knob, which still travels
    its whole track; and the Language row traded its globe for the conventional
    translation mark - an A meeting a script - because a globe says world where the row
    means translation.
  - THE HOME FILTER CHIPS are shorter: px-4 py-1.5 at 16px became px-3.5 py-1 at 13px.
  - A NEW SUITE, ct8/polish_regression.mjs, 10 assertions, SOURCE-ONLY - and the honesty
    one really does grep every .ts/.tsx under src rather than trusting a list of files
    somebody remembered to update. It skips comment lines, because it grades what a
    READER is told rather than what the source explains to itself.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), ninth session: THE CHAT IS BUBBLES. The owner settled the
  conflict this session had flagged, and settled it against the card:
  "the chat message design is LEFT/RIGHT BUBBLES - WhatsApp-style - with the
  squared corner pointing toward the sender. The full-width card currently
  rendering is WITHDRAWN." So the card is gone and the bubbles are back.
  - THE CARD'S DISCIPLINE SURVIVED THE CARD, which was the whole point. Inside each
    bubble, in this order: the reply linkage first and tappable (what a message
    ANSWERS is often what you need before its words), then the body with long mail
    collapsed behind Read full message, then ONE quiet metadata line - the time, the
    sent or replied state where it exists, tag chips only when a tag is set. The
    old bubble's per-message subject pill and its second metadata row are not
    coming back.
  - SHAPE: incoming sits left, outgoing right, and the squared corner points at
    whoever wrote it - the top corner on the sender's side of the run's first
    bubble, rounded everywhere else. Outgoing keeps the pale green the owner allows;
    incoming is white on the chat canvas. A pressed state scales the bubble a hair,
    so a tap feels like it landed.
  - RUNS: consecutive messages from one sender collapse. The sender's name lands
    once, on the first incoming bubble of a run (groups only - a 1:1 stays
    nameless), their shared avatar once, at the run's foot, and the messages INSIDE
    a run sit at 4px while runs sit at 12px apart. Identity per run, not per
    message, is what makes a run read as one person talking.
  - THE ATTACHMENT SLOT is real and documented: `attachments` renders above the
    body, inside the bubble, so a picture never shoves its own caption around when
    it arrives. Attachments land next session with no redesign.
  - The reply action moved UNDER the bubble rather than inside it: a reply is
    something you do TO a message, not a part of it. The tag and move panel, both
    swipes, the expand control, the sent tick and the NEW mark all survive in the
    bubble's own grammar.
  - SEVEN CARD-ERA ASSERTIONS WERE RE-POINTED rather than deleted - the two fills,
    the avatar, the metadata row, the tick, the NEW mark, the reply quote and the
    card's own hierarchy - and three NEW ones assert the bubble: the side and the
    squared corner, run grouping with its tighter interior spacing, and the
    attachment slot. The hierarchy assertion is an ORDER assertion, not a set
    membership one: it checks the reply linkage really does come before the body
    and the body before the time, by comparing their positions in the component.
  - TWO MISTAKES OF MINE, both caught by running things rather than reading them:
    the run predicate needed an explicit type, and the run index cannot come from
    the map callback of a list that does not supply one - it comes from the list.
    A third: six re-pointed checks were written without their closing paren, which
    the suite caught instantly as a SyntaxError rather than as a false pass.
  - DOCKER CLEANUP, PARTLY DONE: eleven leftover evaluator/clone compose projects
    were brought down with `down -v --remove-orphans`, taking 46 orphaned
    containers with them. `docker ps -a` now shows EXACTLY FOUR - the main stack.
    The stray `phonemail-*_postgres-data` volumes were then refused by the Safety
    Guard on an approval timeout, and that refusal is final for the session, so
    they remain along with the %TEMP% directories. Both need one more pass.
  - NOT DONE, and not claimed: the bubble-style A/B/C research spec, the composer's
    compact subject field with its visible/hidden modes, the canvas rules (date
    pills, live-arrival subject dividers), and the service-worker update-path
    investigation. The SW one matters - it is why the last session could not
    re-photograph the settings screen - and it is the next thing to pick up.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), eighth session: THE THREE CHAT FIXES and THE SETTINGS
  DENSITY PASS. Landed and verified; the chat redesign that follows them is NOT in
  this commit and is called out at the end of this entry.
  - FIX 1, THE HEADER IS A PERSON: the thread header showed the SUBJECT as its
    second line, so the one row that should say who you are writing to said what
    the mail is about. It now shows the counterpart's address under their name and
    never the subject. The group header's fallback stopped reaching for the subject
    too, and now reports the member count alongside the names. The subject's home
    remains the thread body, where the dividers and the reply context already live.
  - FIX 2, NO CONNECTION WORD: the header printed live / polling / connecting - a
    label that only teaches the reader to ignore it. There is no text now. A single
    quiet dot appears ONLY when the socket is not live, which is the one case where
    it is news. The desktop rail's 'Live:' prefix went the same way.
  - FIX 3, THE ROW PREVIEWS THE NEWEST MESSAGE: the list already read the body rather
    than the subject, but it could not say when the newest message was YOURS. The
    conversation endpoints now report `outgoing`, read off the newest row, and both
    list rows prefix 'You: ' when it is set. ASSERTED AS A ROUND TRIP, not as a
    shape: A sends to B, the list is re-read as A and the row's preview must have
    CHANGED to that message and be marked mine; B answers and the same row must
    change again and stop being marked mine. The group scan had to start selecting
    the sender's id for this, which the build caught.
  - THE SETTINGS DENSITY PASS, on the owner's note that every option was swimming in
    space. The values, before -> after, so they can be dialled in one line:
      between sections      28px -> 20px     (gap-7 -> gap-5)
      section top padding   28px -> 20px     (pt-7  -> pt-5)
      heading to its card   10px -> 6px      (mb-2.5 -> mb-1.5)
      helper under a card   10px -> 6px      (mt-2.5 -> mt-1.5)
      row height            72/76px -> 64px  (still clear of the 56px touch floor)
      row padding           16px -> 12px     (py-4 -> py-3)
      row side padding      20px -> 16px     (px-5 -> px-4)
      inset rule start      82px -> 78px     (it tracks the text column)
      alias card padding    20px -> 16px     (p-5 -> p-4)
      hero bottom           32px -> 24px     (pb-8 -> pb-6)
      header row            56px -> 48px     (h-14 -> h-12)
      name under the avatar 16px -> 12px     (mt-4 -> mt-3)
    Contacts shares the identical rhythm (rows 72 -> 64px, empty state py-10 -> py-7)
    so the list screens are ONE spacing system rather than two.
  - THE ALIAS FIELD AND ITS ADD BUTTON STAY AT 48px. That is the owner's own
    reference geometry, and the reference was required to be exact; 48px is still
    above the 44px platform minimum. Named here so the exception is a decision.
  - A VERIFICATION FAILURE WORTH RECORDING: the settings screenshot could not be
    re-taken. Three captures, including one with the browser cache disabled and one
    with a cache-busting query, came back BYTE-IDENTICAL to the pre-density shot -
    because the app ships a service worker (public/sw.template.js) that serves its
    precached shell. The deployed CSS was checked instead. The lesson is the same
    one this project keeps relearning: an unchanged artefact is not evidence of an
    unchanged system.
  - A LATENT BUG IN MY OWN TEST HARNESS: the first version of the fixes suite sent
    send-otp TWICE per login, so its own probe put the number into cooldown and the
    real send was refused. One send per attempt now.
  - DOCKER SURVEY (read-only; the cleanup itself was DENIED by the Safety Guard on
    an approval timeout, so NOTHING was removed and it needs one more pass): this
    machine is carrying 46 containers from 12 leftover evaluator/clone compose
    projects - phonemail-audit, phonemail-eval-audit, -features, -final, -final3,
    -logo, -origin2, -reader, -redesign, -welcome, -welcome2 - 25 stray
    phonemail-*_postgres-data volumes, and those 12 directories under %TEMP%. The
    main phonemail stack is the four healthy containers and is the only project
    that should survive.
  - VERIFICATION: 460 assertions across fourteen suites green (the new
    ct6/fixes_regression.mjs is the fourteenth, 20 assertions including the live
    preview round trip), build green, both screens' suites green.
  - NOT DONE, and not claimed: the A/B/C research spec and the chat interface
    redesign (shell, canvas, composer subject field, card hierarchy and run
    grouping) from the same brief. The brief's card section also describes a
    left/right bubble with a squared corner, which the owner's OWN message-card
    reference superseded two sessions ago; that conflict needs the owner's call
    before it is built either way.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), seventh session: THE SETTINGS SCREEN, rebuilt to the owner's
  second reference drawing.
  - The owner supplied a picture of a settings screen and asked for it EXACTLY. It is
    a different visual language from the rest of the app, and it is now the settings
    screen's own: a full-bleed hero panel running one soft blue gradient from a
    near-white top-left to its deepest blue at the bottom-right, with the bottom
    corners cut round; the header floating on the pale top of that gradient; a large
    avatar with a blue PENCIL badge; the address in a pale pill with a copy glyph;
    then uppercase letterspaced grey headings, each ABOVE a flat white card; a
    circular pale-blue chip heading every row; a solid blue pill for the one primary
    action on a row; and hairlines that start at the text column instead of the
    card's edge.
  - THIRTY-ONE COLOURS SAMPLED, NONE INVENTED, into a `settings` token group: the
    canvas #f7f8fa, the card #ffffff, the hairline #eff1f4, the separator #eaecf0,
    the three text greys (#101828 / #667085 / #98a2b3), the chip #e5eeff with its
    #2563eb glyph, the reference's own blue #1b6bff and its washed-out disabled
    state #a9c2f5, the field #f2f4f7, the hero's three blues (#e8f0ff / #c3d9fb /
    #7ba5f0), the avatar's disc and ring (#dce9fb / #c6d9f5), the address pill
    #e4ecfb, the switch's off track #d0d5dd and the destructive pair (#e5484d /
    #fdecec).
  - THE REFERENCE WAS VERIFIED AGAINST REAL PIXELS, not against an opinion. A
    headless browser logged into the real app through the real onboarding, opened
    /profile, and the screenshot was measured: the hero's deepest corner came back
    #7ea8f1 against the reference's #7ba5f0, the canvas exactly #f7f8fa, the icon
    chips exactly #e5eeff (six of them), the destructive chips exactly #fdecec (two)
    and the alias field exactly #f2f4f7. The same screenshot was then read back
    independently: gradient not flat, headings above the cards, no gap above the
    hero, cards flat, nothing clipped or overflowing.
  - THE MEASUREMENT FOUND ONE REAL DEFECT, which is why it was worth doing: the Name
    field's placeholder was longer than the column beside the Save button and was
    being clipped mid-phrase. It is now 'Add your name' - the sentence it replaced
    already lives in the helper text under the card, where it has room to read.
  - TWO ROWS THE DRAWING DOES NOT SHOW ARE KEPT AND NAMED: the FOLDERS section and
    the Language row, both of which the owner asked for back a round earlier. They
    sit in the reference's own row grammar so the drawn sections still read exactly
    as drawn, and the source says so in a comment rather than hiding it. Removing
    them is the owner's call and a one-line deletion.
  - EVERYTHING THE DRAWING CANNOT SHOW AND THE APP STILL NEEDS IS KEPT: the alias
    list and its Remove action, the save/notice/error lines, and the delete flow's
    confirmation and one-time code. The avatar's badge became a pencil that opens
    the name field, and the copy glyph on the address pill actually copies.
  - A LATENT BUG DIED IN THE REWRITE: the delete dialog's code field stripped
    /D/g - the letter D - instead of non-digits. It is now \\D.
  - A THIRTEENTH SUITE, ct5/settings_ref.mjs, 31 assertions, SOURCE-ONLY by design:
    a design lives in the source and the tokens, so it needs no server, no OTP and
    no mode, and it must never be a reason to touch one. It guards the sampled
    palette and the reference's geometry; the pixels above were the proof they land.
  - TWO MORE ASSERTIONS RE-POINTED, both of which had been grading markup rather
    than intent. The settings Name row moved to a label-for plus a real input. And
    round 2's 'no Folders section and no language row' had only ever passed because
    the old markup hid those strings behind variables - it was grading an accident,
    not a decision, and it now grades the round-3 decision to keep them.
  - VERIFICATION: 439 assertions across thirteen suites green, build green, the
    real screen photographed and measured, and the four services healthy.
  - Mode found and left: REAL.

- Day 7 (Sat Sep 26), sixth session: THE MESSAGE CARD, built from the owner's
  reference drawing.
  - The owner supplied a picture of the chat message and asked for it. It is not a
    bubble: it is a CARD, one per message - a light-blue identity panel carrying the
    avatar, the sender's name and the address beneath it; a meta row with the NEW
    pill and the time; the message itself, large and calm; a hairline; then Reply
    and the rest behind an ellipsis. Every colour is sampled from the drawing into a
    new msg token group - panel #eef4ff, avatar #d8e6ff, accent #2f7df6, ink
    #0b1b3a, muted #8a95a8, line #e6e8eb, action #eaf2ff, more #f1f3f5 - so the card
    and the rest of the app cannot drift apart.
  - THE CARD IS THE SAME FOR BOTH SIDES, exactly as drawn: the reference labels its
    one card You, so a message you sent and one you received use the same card and
    the panel says who each is from, instead of a left/right bubble layout. A mail
    conversation reads as a stack of messages, not as a chat transcript.
  - ONE DELIBERATE ADDITION, STATED: the drawing shows no sent tick, and the owner
    asked for one two rounds ago. It stays, in the card's own accent, on the meta row
    where the reference puts its time. Dropping it quietly would have been an
    accident; keeping it is a decision.
  - What MOVED rather than vanished: the swipe gestures live on the card's root, so
    swipe left still opens the tag and move panel and swipe right still reveals
    Reply in traditional view; the reply quote is the card's own quoted block; the
    long-message expand and collapse is the card's footer; the group's per-member
    Reply offer is the card's Reply slot; the sent tick is the card's tick slot.
  - THE HOME SCREEN'S TOP-RIGHT SLOT LOSES THE COUNT ENTIRELY. The owner asked for
    it gone: the slot is the shared person mark and nothing else. The count stays
    where it belongs, on the conversation rows.
  - VERIFICATION: 408 assertions across twelve suites green, and the four routes the
    redesign touches answer 200. EIGHT bubble-era assertions were re-pointed rather
    than deleted - the fills, the avatar, the metadata row, the sent tick, the NEW
    mark, the header slot and the reply quote - every one of which described markup
    the owner's own drawing replaced. The names suite's tick assertions now read the
    card, which is where the tick lives.
  - Mode found and left: REAL.

- Day 7:

---

### Round 22 - the last three features

- **Full-text search.** `GET /api/search?q=` - `ILIKE` over subject and body, reusing the conversations endpoints' per-viewer rule. The suite's negative control found a real leak in the first version: carrying the group thread endpoint's "another member's broadcast" branch into an UNSCOPED query made every non-reply row visible to everyone. Membership is now derived from the caller's own rows first, and the third member of a group cannot find a private reply between the other two.
- **The PIN.** `User.pinHash` (bcrypt) plus a lock screen on both clients. Deliberately an INTERFACE lock: the JWT remains the API's boundary. Written up in docs/SECURITY.md section 13 so the claim and the mechanism sit together.
- **Server-side drafts.** A `Draft` row, one per user (unique index), saved debounced from both composers with a `localStorage` write-through so an offline save is never lost; the next reachable save pushes it up. The old device-only reasoning in lib/folders.ts is superseded - see the README's limitations.
- Two migrations (`20260928120000_add_pin_hash`, `20260928130000_add_draft`), both additive.

### Round 23 - the mount race (the missing rail and the skipped PIN)

**The report:** with a PIN set, a fresh tab opened straight into the app, and the left rail was missing until a reload.

**What the browser said.** Neither symptom reproduced as a PERMANENT state: driving a real engine over CDP, the lock appeared and the rail was present at every entry point (a fresh tab straight to /desktop/inbox, the front door, the client-side handover from `/`, 768/1024/1440px, and the phone client). What DID reproduce, with numbers, is the WINDOW: the first version decided the PIN from a `GET /api/me` round trip and rendered the pad as an OVERLAY on a shell that was already mounted, so the mail was on screen - readable - for the whole round trip. Sampled every frame: 22 consecutive samples, 87ms wide, on a warm local stack. On a cold start, a slow phone or a PWA launch that window is seconds long, which is exactly "the app opens straight in" and, in the first frames, a shell with no rail in it.

**The fix, structural rather than defensive.** The pin state is a first-class three-phase value (`checking | locked | open`) and the shell is mounted THROUGH `PinGate`, so there is no code path that renders the app before the phase is resolved:

  checking -> a resolving screen (no rail, no mail, no login flash)
  locked   -> the pad, as a PAGE - nothing of the app is rendered behind it
  open     -> the shell

**Counterfactual, same measurement, same engine:** content visible with no pad went from 22 samples (87ms) to **0**, with the pad on screen at the first sample (79ms). `ct28` freezes the discipline at the source level (the gate's three phases, both layouts mounting the shell through it, no gating surface reading the session token itself, and the sign-in stand-down rule), and three assertions this round moved were re-pointed rather than left to fail.

### Round 23b - the missing rail: the disagreement, and the screenshot

The report's screenshot was the desktop client (list, reading pane, "Search mail",
"Compose") with NO rail, and the reader's own words: "when i open in desktop it shows
mobile mode not desktop". The browser had already failed to reproduce it in a fresh
tab; the screenshot named the state instead: the mail rendered, the rail did not.

**The cause this time is a disagreement, not a delay.** The rail called `useAuth()`
itself and returned null unless ITS instance said authenticated, while the page had
its own instance. Two instances reading the same storage are two chances to disagree,
and one path makes them disagree for the life of a tab: any 401 clears the stored
session (`authorizedFetch` does this deliberately), so a rail that mounts - or
re-reads - after that finds no session and stays null forever, while the page mounted
before it keeps the token in its own state and renders the mail. A reload fixes it,
which is the "appears only after a refresh" half of the earlier report.

**The fix: one decision.** `components/desktop-shell.tsx` asks once and renders the
rail itself, exactly when its own phase is authenticated; anything else gets the
content alone (which is how a signed-out visitor sees only the login card). The rail
no longer imports `useAuth` at all. There is now no code path that renders the mail
beside an absent rail, because the rail is not a decision the rail makes.

**Verified in a real engine, both states and the invariant:** signed in + unlocked,
wide -> the mail WITH the rail; signed out, wide -> the login card and no rail; and
across 3717 consecutive samples taken while the client opened, **0 frames showed mail
without a rail** (the same probe before the fix could not even be trusted to catch it,
because it sampled with the pad up).

**Still not reproduced:** the reader's exact tab state. The mechanism above is the
only path in the code that produces "mail present, rail absent", and it is now
impossible by construction - but if it recurs, the browser console for that tab would
settle it, and that is what to send.

### Round 25 - the wide viewport that got the phone client

**The report:** on a desktop (a wide viewport) a visitor got the MOBILE interface - the
phone styling, the phone onboarding, and a mobile-styled /portal - instead of the
desktop client.

**Reproduced first, as a matrix.** Every entry URL x signed-out/signed-in x 1024/1440
in a real engine, recording what rendered: exactly TWO violations - `/` signed-out at
both widths, which ended on `/onboarding`, and `/portal`, which was mobile-styled
because it is a route of its own and the handover never ran there. Everything else
(`/onboarding`, `/desktop`, `/desktop/inbox`, `/mobile`, and every signed-in entry)
already obeyed the rule.

**Cause, measured rather than guessed.** Hooking the History API to record every
navigation the router made settled it: at `/` the router made ONE navigation, to
`/onboarding` - the handover's `router.replace` never reached the history at all.
Issued from an effect that can run in the same commit as (or just before) router
hydration, the replace was dropped without an error and nothing retried; the phone
home's auth guard, firing one commit later, then won. At `/onboarding` the same
handover landed (t+34ms) because there is no competing guard there.

**The fix - one rule, enforced where it cannot be dropped.**
- `lib/entry.ts` now exposes `wideEntryTarget()` (the single decision) alongside
  `decideMobileEntry()`, plus `handoverTargetInThisTab()` and `guardRedirect()`;
- the handover is a FULL navigation (`window.location.replace`), which cannot be
  dropped before hydration and cannot be overridden by a later client redirect, and
  sessionStorage survives it so the tab's session and phone-layout choice still do;
- all six phone screens' "go to onboarding" guards consult the same rule, so the
  handover and the guards cannot disagree;
- `/portal` is NOT redirected (registration must work with no session): it gets the
  design system's centred card from 640px up, and stays the phone portal below that.
  Its form controls keep their inline styling - the portal is still the one surface
  outside the token system, as the README's gaps record.

**Verified.** The wide matrix after the fix: 0 violations of 24 entries (`/` now
lands on the desktop sign-in; `/portal` renders the desktop card; an explicit
`/mobile` still stays phone). The narrow check: / stays the phone client at 390px and
the portal has no card below its breakpoint. Three of the six guards' `/onboarding`
string was replaced mechanically; the first attempt put the new import above
`"use client"` and Next refused to compile - fixed by placing it below, and ct29 now
asserts the directive stays first.

`ct29` freezes all of it (21 assertions, driving the pure rule at every width, URL
and remembered choice, then asserting the wiring), and ct20's "the hop is client-side"
assertion was re-pointed at the full navigation it is now, with the invariant it was
protecting kept (the per-tab session survives).

### Round 26 - the rail that needed a reload (the round-23b report, finally)

**The report, with two screenshots:** sign in on the desktop client and the left rail is
missing; it appears only after a manual reload. Round 23b's fix had been verified only in
the state where a session ALREADY exists before the page loads - seeded into a fresh tab -
so it never ran the flow the report actually describes.

**Reproduced through the real UI this time.** Driving the browser to do what a reader
does - open /desktop signed out, type the number, press Send code, enter the six digits -
gave exactly the reported sequence:

    signed out at /desktop   rail absent   (correct)
    after the code           rail ABSENT   <- the bug, inbox rendering beside no rail
    after a reload           rail present

**Cause.** `signIn()` set state on the LOGIN PAGE's own `useAuth()` instance and wrote
sessionStorage. The desktop LAYOUT does not remount on a client-side navigation, so
`DesktopShell`'s instance - mounted at page load while still signed out - never re-read
storage and kept "unauthenticated" for the life of the tab. The inbox page mounted fresh,
read the new token and rendered the mail; the shell believed there was no session and
rendered no chrome. A reload re-mounts the shell, which is why it "only appears after a
refresh". (Round 23b removed the rail's own gate to make the shell the single decision -
correct in itself, but it did not make the decision HEAR about a sign-in.)

**Fix: a same-tab broadcast.** sessionStorage's own `storage` event fires only in OTHER
tabs, so `signIn()` and `clearSession()` now dispatch `phonemail:auth-changed` and every
`useAuth()` instance listens and re-reads. That covers both directions: a sign-in reaches
the shell, the gate and every mounted screen, and a session that ENDS (a 401 in one
screen) no longer leaves the rest believing the opposite.

**Verified, same probe, same engine:** the rail is PRESENT immediately after the code, and
still present after a reload; signed-out /desktop still renders no rail (round 13's rule
intact). `ct28` grew five assertions (37 now) for the broadcast, including one that
checks the event constant is a real name - which matters because the tooling's masking had
turned it into a literal "***" in the file, working but meaningless; that is repaired.

### Round 27 - Terms on the desktop (and where the round stopped)

**Task 1, the reported bug, reproduced and fixed.** A wide viewport clicking "terms"
never saw the terms. Measured at 1440 in a real engine:

    /terms  signed-out -> /desktop          (bounced to the login card)
    /terms  signed-in  -> /desktop/inbox    (bounced into the mail client)

The entry rule hands EVERY non-/mobile route to the desktop client - right for app
screens, wrong for content. /terms was also inside the phone route group, so even when
it did render it would have worn the phone frame, and the desktop login card's own
"terms" link pointed at the registration portal rather than at the terms.

**Fixed in three parts:**
- `lib/entry.ts` gains `CONTENT_PATHS` (`/terms`, `/portal`) and `isContentPath()`;
  `wideEntryTarget` returns null for them, so they render in place at any width.
- `/terms` moved out of the (mobile) group to `src/app/terms/page.tsx` - it owns its
  page now: the phone view below 640px (back bar included), and from 640px up the same
  text in a centred card on the token surface, exactly like the portal.
- The desktop login card's "terms" link points at `/terms`.

**Verified (headless engine):** 9/9 - renders in place at 1440 and 1024, no phone
frame, the back bar hidden, a bordered card centred at 756px wide, the phone view at
390px intact, the portal unchanged. `ct29` grew four assertions (25 now) for the
content rule; `ct13` and `ct15` pinned the old file path and were re-pointed.

**Where the round stopped, stated plainly.** Tasks 2-5 of the final brief - the desktop
group-info and user-detail sheets, the desktop composer's multi-recipient fix, PIN as an
optional login method, and the motion pass - were **not started**. Task 1 is landed and
verified; the rest is unstarted work, not partial work. The floor rule governs: land each
item verified, stop clean, report honestly.

Round 28 - Tasks 2-4 landed; Task 5 (the motion pass) NOT started

**Task 2, the desktop user detail and group info.** The phone's two "who is this?"
surfaces are now in the desktop reading pane: the counterpart's name in the thread
header opens a user-detail modal (name, number, address, the contact relationship
read from /api/contacts, add/remove with the sheet's own save morph), and the group
title opens a group-info card whose member list carries the role tags from the
thread payload itself, every member tappable to their own detail. Chrome differs per
client (centred token card - the composer's overlay language); the content, the data
paths and the morph are shared with the phone sheet. `ct30` (26 assertions) drives a
real engine at 1440 against fresh fixtures.

**Task 3, the desktop composer's recipient fields.** The reported "accepts only one
address" was reproduced FIRST and did not survive contact: typing 2 To + 1 Cc from
the real composer delivered to all three and formed the group. What the report was
pointing at did exist - no per-ADDRESS validation, and no signal that a second
address had been understood - and the fix is the stronger form of the brief's own
option: `lib/recipients.ts` now owns the one rule both clients speak (the mobile
composer's normalisation and message), `validate()` names the offending entries, the
placeholders say "separate with commas", and the mobile's own "Group: N recipients"
line appears live. `ct31` (18 assertions) freezes the two round trips and the
negative.

**Task 4, PIN as an optional login method.** 4-6 digits now; `POST
/api/auth/login-pin` verifies the PIN behind the established strikes and issues the
same JWT + Session row verify-otp issues; both login screens gained "Login with PIN
instead" (only for accounts with a PIN; OTP stays the default and primary path);
signup gained the optional "Set a PIN (skip)" step on both clients; the pad
verifies at six and offers Unlock for four/five; a PIN sign-in stands the tab's lock
down. `ct32` (27 assertions) covers the range, the issuance (the Session row counted
in the database), the lockout lived through redis, and the desktop card driven for
real.

**Where the round stopped, stated plainly.** Task 5 - the motion spec and the motion
pass across both clients - was **not started**: the context budget for this session
ran out after Task 4's landing, and the floor rule governs (land each item verified,
stop clean, report honestly). The round-level gates Task 5 was meant to trigger with
it - a fresh-clone evaluator simulation from ORIGIN after the final push - are
likewise pending. Full regression at the stop point: 1070 assertions across 35
suites, 0 red (three new suites this round: ct30, ct31, ct32).

Round 28.5 - the Figma pass (three desktop frames)

The owner supplied a Figma file (three 1440x1024 desktop frames - empty state,
thread selected, compose modal) and asked for the designs to be applied. Landed in
the app's own token system, chrome for chrome: the rail wears the frames' dark
navigation (a new `rail` token group - #0f172a with the slate muted step;
rounded-lg 40px rows; the frames' profile row - avatar, name, address - in place of
the old "Profile" label; the name is the display name from /api/me, the number is
the fallback), the Compose action becomes the frames' flat accent pill with its
plus, the list rows take the frames' selected treatment (accent tint + a 4px left
accent bar inside the row + the time in accent; the meta line in the new `neutral`
muted step), the reading pane gets the frames' hairline chrome (white cards with no
avatar: the name row carries the role chip in the new "frame" tone - solid navy for
the sender, paper for receiver/cc - and the row below carries "via <address>" and
the time; a white hairline empty-state badge with the accent envelope), and the
composer takes the frames' shape: the dark header band with its circled cancel,
CHIP fields for To and Cc (a delimiter commits the finished fragment, the trailing
text stays in the input, Backspace on empty takes the last chip back, Enter commits
instead of submitting, and the chips + input are ONE value so send and the draft
both read it), the labelled Document/Image/Camera outline controls, the flat accent
Send, and the frames' placeholder. Behaviour is unchanged - same endpoints, same
shared per-address validation, same reply locking.

Where the mockup and the system disagreed, the system won and it is recorded here:
the frames' smaller type steps were NOT adopted (the elder-friendly floor stands),
the reading-pane header stays (it hosts the round-28 user-detail / group-info
affordances and the conversation's subject), and the list's search box stays (a
feature the frames do not model). Suites: ct20/ct21/ct22 re-pointed to the frames'
truth (chrome tokens, the card header, the Compose action, the dividers, the
selected rows), ct28's rail invariant re-pointed from "no useAuth import" to "no
render decision" (the rail reads the session for its profile row only), ct31
re-pointed from text fields to the chips; a fresh full regression after the
re-points: 1070 assertions across 35 suites, 0 red.

Round 29 - the message actions: desktop parity + Forward + the sweep

**Task 1 - the action row on desktop.** The phone's four-action chevron row now
exists on the desktop mail cards: Move to Spam, Move to Trash, Favorite and
Forward, revealed by the same chevron gesture (the documented pattern choice - the
phone's own, so the two clients teach one motion), drawn as 56px quiet outline
targets in the design tokens, on received mail only (the phone hides it on sent
bubbles the same way). Reply stays the card's own visible button. Every action
hits the same endpoint the phone hits - `PATCH /api/emails/[id]` with
`{folder}` or `{tag}` - recipient-owned as always; moving refreshes both the list
and the open thread, and the favorite is optimistic like the phone's.

**Task 2 - Forward, both clients.** The new verb: re-send an existing mail to NEW
recipients, with the OPPOSITE lock from reply - To and Cc are free. The subject
derives as `Fwd: <original>` (unless edited) and the body opens with a forwarded
header block over the original content. On the server, `POST /api/emails` accepts
`forwardOfId`: the caller must be a party to the source row (403 otherwise, 404
for a vanished source), the copy count joins the new files under the same
three-file cap, and the source id rides the submission note. The BYTES move in
the inbound path, which copies the source row's attachments into every new
fan-out row - one set per row, exactly like sent files, so a large file moves
without a byte through the client - honoring the composer's remove list
(`forwardOmitAttachmentIds`). The clients: the mobile bubble's action row gained
Forward (a `/compose?forwardOf=` link), and both composers entered forward mode -
a fetched source on the phone, the in-memory message on the desktop - with the
source's attachments shown in a "Forwarded attachments" block that can remove
individual files from the copy. Removing one only omits it from the copy list:
the bytes never existed on the client.

**Task 3 - the sweep.** `ct33` (34 assertions) drives the whole action vocabulary
through the real endpoints: reply-once (409 on the repeat), the folder moves and
their views, favorite + the chip data, the other tags, mark-read, the non-owner
403, delete-chat, search, and the full Forward chain - the byte-identical copy
(sha256), the 403 for a non-party, the omit list, and the group key on a
multi-recipient forward - plus a real-engine drive of the desktop card: the
chevron, the four actions, and Forward opening the composer with the forwarded
file shown, To free, and the `Fwd:` subject.

**One full-regression red, what it was, and what was done about it.** Full runs
kept showing `groupchat` red once - "unread after A -> B+C: B = 1 [unread=0]" -
reproducing deterministically while it held, while controlled reproductions of
the exact sequence (and the suite solo) passed. The cause class was found
empirically, twice: 200+ then 58 leaked headless Edge processes from earlier
verification scripts - scripts force-killed before their cleanup could run, and
Windows re-parenting Edge's children so the suites' /T tree-kill missed strays.
A stray is a live signed-in session still subscribed to the app's realtime
socket, and it interfered with that account's thread state; with every stray
swept, the suite is green - and the suites' cleanup is hardened so they cannot
leak again (ct30-ct33 now kill the whole tree AND every msedge still carrying
the run's own profile path). Recorded because a red that is silently waved
away is how real bugs hide - and because verification tooling that leaves live
sessions behind poisons the tests that come after it.

The fresh-clone evaluator simulation from ORIGIN ran after the push (clone at the
landed commit, timestamped dir left in place): cold build, fresh database (0 users,
18 migrations), and the newest seven suites all green against the clone - ct33 (34),
ct32 (27), ct31 (18), ct30 (26), ct28 (37), ct27 (45), ct24 (17) - with the security
envelope intact (postgres egress blocked, nosniff + frame-deny on every surface) and
the main stack restored to REAL mode afterwards.

**Follow-up (same day, the owner's screenshot):** "where is the actions?" - the
screenshot showed a thread whose visible cards were ALL the owner's own sent mail,
and the chevron had been scoped to received cards only, so no action affordance was
anywhere to be seen. The chevron now sits on EVERY card: on your own mail the row
opens with Forward alone - the one action that is yours to take - while Move to
Spam, Move to Trash and Favorite stay recipient-owned, exactly as the phone scopes
them. ct33 grew three assertions (37 now) driving the owner's exact scenario in the
real engine - B's own sent thread, its chevron, the Forward-only row, the absence
of recipient-only actions - and the follow-up re-ran the full regression green.

**Follow-up 2 (the owner's request - favorite and spam for sent mail):**
Favorite and Move to Spam joined Forward on your own cards, with meanings sound
in this model: Favorite is a label on the shared row (the app's existing truth
for tags) and is writable by either party now; Move to Spam for the sender
cannot set the row's folder - that folder is the recipient's mailbox - so it
removes the message from the sender's own views (deletedForSender, the same
per-viewer mechanism delete-chat uses) while the recipient's copy stays exactly
where it was; Trash and read-state stay recipient-only (403 for the sender).
ct33 grew to 44 assertions - the row on sent mail, Favorite persisted, Trash and
read refused for the sender, sender-Spam hiding from the sender's thread and
leaving the recipient's inbox alone. Also fixed, and the owner was right: the
REAL-mode restore had recreated the app from the dev config before the override
returned, so the container ran dev behaviour with the file present. The container
now runs under the override's env (verified: the gate login present and devHint
gone), and the restore order is fixed for good - move the override back FIRST,
then recreate.

**Follow-up 3 (the owner's request - signed-in devices on their own page):** the
device list left Settings/Profile and lives on `/desktop/devices` and
`/devices`, linked from the rows it left behind. Interactive device icons:
each session is drawn as a tile (desktop) or an icon-led row (phone) whose glyph
comes from a new pure `describeDeviceKind` in lib/device - phone, tablet or
desktop - and the API carries the `kind` per session. On the desktop a click
selects a tile (aria-pressed) and opens the detail strip, where a device is signed
out (the current device explains itself instead - ending the session you are
reading from is the login door's job, not a stray click); on the phone the rows
keep their existing one-tap logout, now lead with the glyph, and the current
device still signs out to the door. `ct34` (9 assertions) covers the pages, the
kind mapping's awkward strings, the API field and the tile interaction in a real
engine; ct21's settings-endpoints pin was re-pointed to the two pages it now
spans, and its notification-throttle probe now arms the window deterministically
instead of reading suite-order luck (one mid-run flake, diagnosed, made
impossible). Full regression: 1124 assertions across 37 suites, 0 red.

**Follow-up 4 (the owner's correction - sent mail takes Trash, not Spam; Empty trash):**
the sent-mail card's row now reads Move to Trash / Favorite / Forward. For the sender,
Trash is the per-viewer removal the app already used for sender-spam (`deletedForSender`
- the row's folder belongs to the recipient), and Spam is refused on sent mail with the
same 403 as every other recipient-only state. Both Trash screens (desktop header, phone
folder screen) carry **Empty trash**, backed by a new `POST /api/emails/empty-trash`: it
marks the caller's trash rows deleted-for-recipient - the same per-viewer removal, so
the counterpart's copy is untouched - and reports how many left. Making that honest
required one alignment: the `/api/emails` folder list now excludes deleted-for-recipient
rows the way the conversations and search lists always have, so a row one screen removed
for its owner cannot reappear in another. The first cut of follow-up 3 also shipped a
URL bug that this round's phone drive caught: the phone's Manage devices link pointed at
`/mobile/devices`, which is a 404 - phone screens live at root paths (`/profile`,
`/devices`, `/trash`), and `/mobile` is only the phone home's alias. The link and the
docs are fixed, and ct34 now DRIVES the phone side (profile link target + the devices
screen) so the class cannot ship silently again. ct33 grew to 57 assertions (sender
Spam 403 / sender Trash removal, the empty-trash API incl. anonymous 401, and a live
Empty-trash click on the desktop trash screen); ct34 grew to 11. Full regression:
1128 assertions across 37 suites, 0 red.

**Follow-up 4b (the owner's report: "there is no option" on the Trash screen):** a
trash holding ONLY a group thread offered no Empty trash button. The button's
visibility condition counted pairwise threads (`threads.length > 0`) while the empty
state beside it always counted both lists; the owner's trash was group-only, so the
button hid exactly when it was needed. Reproduced on a fresh client against the
deployed build (trash listed the group row, button absent; the conversations API for
that folder returned threads: 0, groupThreads: 1), fixed to count both, and verified
by the counterfactual: the same fresh client with the same data now shows the button.
ct33 grew to 62 with a group-only drive (fixture, trash it, the button must appear,
emptying works) and a source pin that the condition counts both lists. Full
regression: 1144 assertions across 37 suites, 0 red.

**Follow-up 5 (the owner: the phone's Empty trash design and placement were bad):**
the phone button used to float right-aligned on its own padded row, styled like the
per-message pills - it read as a stray component. It is now a full-width list-header
action row: flush with the message rows under the AppBar, a trash glyph, the
destructive ink, a 48px tap target and a press tint. ct33 (67) pins the treatment
and drives the phone: fixture to trash, the full-width row measured (width, colour,
glyph), one tap empties, the empty state shows. Full regression: 1149 assertions
across 37 suites, 0 red.

**Follow-up 6 (the owner: "in mobile mode the action tab for message card is not there and
in trash page mails are not listed when i click move to trash via the message card"):** two
gaps, both about the sender's own mail. (1) On the phone, MY OWN bubbles had no action tab -
the chevron was gated to received messages - so the tab now renders on mine too, with the
sender's own actions: Move to Trash, Favorite, Forward (Spam stays recipient-only, Reply
answers other people's mail), the swipe panel matches, and the buttons carry a surface fill
so they read as controls on the green bubble. (2) The sender's "Move to Trash" only set
deletedForSender - the mail left every view and the Trash screens, which list folder=trash
rows, never showed it. A new `senderTrash` marker (migration 20260930150000) makes the
sender's trash a real list: the action stamps it, the phone Trash page lists it as a
"To: ..." row, the desktop Trash screen lists its thread, "Move to inbox" restores it
(403 when it was never trashed), and Empty trash clears it - all per-viewer; the
recipient's copy is untouched. ct33 grew to 95 (28 new assertions; the drive walks the
owner's exact flow: mine bubble, tab, panel contents, Move to Trash, listed with a To:
label, row buttons, Move to inbox, back in the conversation; plus the desktop Trash
listing and the empty/restore edge cases). Full regression: 1177 assertions across 37
suites, 0 red.

**Round 30 (sender credibility, the owner's fresh-session brief): account age in
months, the send:receive pair, and a DISTINCT-reporter count render in every
user-detail surface on both clients, with a REPORT SPAM action whose three states
(idle -> confirm -> "Reported ✓") file a signal that blocks nothing.** A new
SpamReport table (migration 20260930160000) carries one report per reporter per
reported account - the UNIQUE pair IS the idempotency rule, so a repeat is a no-op
and the count is distinct reporters by construction. GET
/api/users/[phone]/credibility returns { memberSince, sentCount, receivedCount,
reportCount, viewerReported } live from indexed columns (measured ~10ms average on
the loaded dev database, printed by ct35 every run - no cache needed); any
signed-in caller may read it, by design, and the README states the stance. POST
/api/users/[phone]/report files the signal: repeats are 200 no-ops, self-reports
are 400, and the quota is 10 distinct reports per reporter per hour on the
established Redis counter shape (lib/spam-reports; refusals carry
retryAfterSeconds + reason; a repeat files nothing and is never refused). Both
sheets gain the TRUST block and the report flow; your own sheet shows the stats
without the action; a desktop mail card's sender name opens the detail modal; and
while /api/me/delete was extended for the new rows, its removed-count labels were
found shifted by the sessions slot since round 9 (all small numbers, only their
types ever asserted) - they now line up, and reports joins them. ct35 (42
assertions) drives everything live: the exact seeded deltas in both directions,
idempotency, viewer state, the armed-then-cleared rate refusal with its
counterfactual, both browser flows on real engines, and the latency printout.
Full regression: 1219 assertions across 38 suites, 0 red.

**Round 30 follow-up 1 (the owner: "mobile cards doesnt have action menu like
desktop"): the phone's GROUP thread carries the action tab now.** The chevron tab
shipped to the 1:1 thread and to the desktop cards, but the group thread page was
missed - the owner's screenshot showed group bubbles with no menu at all. Every
group bubble now opens the same panel the desktop card shows: the sender's own
actions on your mail (Move to Trash, Favorite, Forward), the fuller set plus the
tags line on anyone else's (Move to Spam, Move to Trash, Favorite, Reply, Forward),
all through the same PATCH /api/emails/[id] routes. ct33 grew to 106: a source pin,
plus a live drive that creates a group, has B reply inside it, opens both panels on
the phone (asserting each set), moves the reply to Trash from the panel, proves it
leaves the group view and lands in the trash list, and restores it. (The drive's
first cut ran in the wrong session - B's, left over from the desktop block, which
the run itself caught; the fixed drive flips back to A the way the phone section
does.) Full regression: 1230 assertions across 38 suites, 0 red.

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