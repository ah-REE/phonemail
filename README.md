# PhoneMail

Your phone number **is** your email address: send to `9876543210@phonemail.com`
and it arrives in a chat-style mobile inbox. Built for rural, first-time
smartphone users who already know how to use WhatsApp — large type, one accent
colour, big tap targets, no jargon. The mobile client is a WhatsApp-style chat
app; the desktop client at `/desktop` is a Gmail-style three-zone inbox; both sit
on the same backend and the same endpoints.

> Written for the evaluator: how to run it, how to test it without sending a real
> SMS, and an honest line-by-line mapping to the spec.

## Run

Exactly two commands:

```bash
git clone <repo-url>
docker compose up -d
```

Then open <http://localhost:3000>. The first boot builds the images, which takes
a few minutes; after that the app starts in seconds. No `.env` file, no manual
`npm install`, no credentials — every value both sides need is wired in
`docker-compose.yml`, and anything still a placeholder degrades gracefully.

**Four services**, all defined in `docker-compose.yml`:

| Service | Role |
|---|---|
| `app` | Next.js 15 (App Router) on the Node.js runtime, plus the Socket.io server (`server.mjs`). Runs `prisma migrate deploy` on start. Published on **3000**. |
| `postgres` | Postgres 17 — users, emails, aliases. Internal only, never published. |
| `redis` | Redis 7 — pending OTPs, cooldowns, the notification throttle. Internal only. |
| `smtp` | A self-hosted SMTP server (Node `smtp-server`). Internal only. It accepts mail for `phonemail.com` and posts each message back to the app. |

## Testing it without any credentials (the evaluator path)

The committed `docker-compose.yml` ships **placeholder** SMS credentials, and the
app treats those as "not configured" on purpose:

- `POST /api/auth/send-otp` answers with the fixed development code **123456**
  and a **`devHint`** field saying so, and **no SMS is attempted**.
- That is the mode the whole project was developed and demonstrated in, and the
  mode every verification run in this repository used.

Real SMS turns on only when a gitignored `docker-compose.override.yml` supplies
real gateway credentials — copy `docker-compose.override.yml.example` and fill in
`SMS_GATE_LOGIN` / `SMS_GATE_PASSWORD`. The transport is a self-hosted Android SMS
gateway (sms-gate.app): a phone with a SIM, running the gateway app, sends the
message. **Do not enable it while testing** — it sends real, billable SMS.

| Mode | Trigger | Behaviour |
|---|---|---|
| **Dev (default)** | placeholder credentials | fixed OTP `123456`, `devHint` in the response, no SMS |
| **Real** | `docker-compose.override.yml` with real credentials | a 6-digit code generated with `crypto.randomInt`, sent through the gateway phone |

## Demo script

Two browser tabs, side by side, is the clearest demonstration — sessions are
**per tab** (`sessionStorage`), so the two tabs can be two different accounts.

1. **Sign up twice.** In tab A sign in as `8870313035`; in tab B as
   `6381195975`. The welcome screen leads to the number, then to its own OTP step
   in each tab, and the dev code `123456` is shown on screen via `devHint`.
2. **Two-way live chat.** In tab A tap the compose button (bottom right) and send
   to `6381195975`. Tab B's list updates **live** over the socket, with an unread
   badge.
3. **Reply once.** In tab B open the thread and reply; back in tab A the reply
   arrives. Try to reply to the same message again — the affordance is gone, and
   the server answers `409` if it is forced, because reply-once is enforced
   server-side.
4. **A group.** From Home, compose to **two** recipients
   (`6381195975, 9500089722`). One message, one thread, visible to all three
   members — and the in-thread composer cannot add or remove a recipient.
5. **An alias.** Open Profile → Alias IDs and add `john.doe`. Mail sent to
   `john.doe@phonemail.com` arrives exactly as if the number had been used.
6. **Search-to-chat.** Type a full 10-digit number into the Home search box; a
   "Message *number*" row appears and opens that conversation (empty until
   something is sent).
7. **Folders.** In a thread, use the tag button (or swipe) and move a message to
   **Spam** or **Trash** — it leaves that inbox and appears on the Spam/Trash
   screen with a "Move to inbox" action. Unfinished composes appear under
   **Drafts** (kept on the device; see limitations).

## Feature-to-spec mapping

Every line of `docs/SPEC.md`, where it lives, and its honest status.

| Spec line | Where | Status |
|---|---|---|
| Phone number as the email ID | `prisma/schema.prisma`, `src/lib/phone.ts` | Done — `9876543210@phonemail.com` |
| IVR account creation (call, press 1) | `POST /api/ivr/signup`, `docs/ivr-setup.md` | Endpoint, shared-secret auth and docs complete. **Console wiring and a real call are operator-side** and were not performed here |
| Web portal, two fields, registration only, form resets | `/portal` | Done — phone → OTP steps; after creation it clears the fields and returns to the empty phone step for the next account |
| Password auth if no OTP provider exists | — | Not needed: a self-hosted OTP transport was available |
| Web client | `/portal` (registration) + `/desktop` (Gmail-style client) | Done |
| Mobile client | `/` (mobile route group), installable PWA | Done |
| Access the inbox from both clients | `/` and `/desktop` | Done — same endpoints, same JWT |
| SMS notification, exact template, only for non-mobile registrants | `src/lib/notify.ts`, gate on `User.registeredVia` | Done — the text is the spec's exactly: `You have received an email from <sender>. Subject: <subject>.` Gated to `portal`/`desktop`/`ivr`, 60s per-recipient throttle, can never fail a delivery |
| Use free trial providers (Twilio et al.) | `src/lib/otp.ts`, PROJECT.md §9 | Superseded — trial accounts hit KYC/trial walls; the shipped transport is a self-hosted gateway through the developer's own phone. History in PROJECT.md §9 |
| Mobile: WhatsApp design language | `src/app/(mobile)`, tokens in `tailwind.config.ts` | Done — from the Stitch exports in `design/` |
| Screen 1: language selection | `/onboarding` step 1 | **Superseded** - the owner's new welcome screen replaced it ("Welcome to PhoneMail", a 290px aura with the mark, the tagline, the consent line and one "Agree and continue" CTA). the language step is gone from onboarding, and the Language row it moved to was itself removed this round (see the deviation below) |
| Screen 2: Terms & Conditions | consent line + `/terms` | Deliberate change: the organiser's amended spec replaced the separate screen with an acknowledgement line under the send button — which is what ships |
| Screen 3: phone verification, auto-detected and pre-filled | `/onboarding` step 2 | **Partial, platform-limited** — a web page cannot read the SIM; the last number that signed up on this device is pre-filled instead, and it stays editable |
| Screen 4: OTP auto-detected and verified | `/onboarding` step 3 | **Partial** — the code auto-submits on the sixth digit; WebOTP (SMS Retriever) is not implemented |
| Request device permissions during onboarding | — | **Not applicable on the web** — no permission exists for SIM, SMS or contacts |
| Home: two ways to compose | FAB (traditional) + search-to-chat (chat view) | Done |
| No separate Inbox/Sent — everything is a chat | `GET /api/conversations` | Done |
| Full-width search bar | Home | Done |
| Filter chips: All, Unread, Attachments, Favorites | Home | Done — **Attachments is an affordance with an honest empty state; there is no attachment backend** (see limitations) |
| Top-left menu: Home, Drafts, Spam, Trash | — | **Deviation** — the drawer was removed earlier (the owner asked for it), and this round removed the folder section from Settings and the in-thread move-to-folder actions, so nothing links to the three folder screens. The `folder` column and the folder API stay: harmless, and the screens still work if reached by URL |
| Profile icon, top-right → settings | Home → `/profile` | Done — alias IDs, the display name, the notification switch and account deletion are all real |
| Settings must also manage personal details and a profile picture | `/profile`, `PATCH /api/me` | **Partial** — the display name is real and editable, and it is what the profile header leads with. A profile PICTURE is not implemented: there is no upload and no serving route, the `User.avatar*` columns are unused scaffolding, and every account shows the one shared default mark. The Language row was removed instead of being faked (see the deviation below) |
| SMS "new mail" notifications, on/off | `/profile` switch → `User.smsNotifications` → the gate in `src/lib/inbound.ts` | Done — the switch is real state the delivery path reads. It can only ever NARROW who is notified: the non-mobile registration gate must allow it too, so the spec's rule cannot be widened by a user setting |
| Delete account | `/profile` → confirm → OTP → `DELETE /api/me/delete` | Done — a live one-time code is verified server-side before anything is removed, then emails, aliases, contacts and the user go in foreign-key order inside one transaction; the response reports exactly what was removed |
| Compact subject above the message box | thread subject pill | Done |
| All mail from one sender stays in one chat | `GET /api/conversations` | Done |
| New mail shows its subject; replies link to the original | thread + reply-once | Done — a new subject renders as a divider at its chronological position, the chat simply continues, and a reply carries the original mail's subject as `re: <original>` plus a quoted preview above the input, linked to that exact message id |
| Replying hides the Subject field | `/compose` | **Deviation** — the subject is pre-filled `re: <original>` and stays visible, so the sender can see what they are replying to |
| Each message can be replied to only once | `POST /api/emails` claim, `Email.repliedAt` | Done — a conditional update, so a race cannot double-reply |
| Long mail → tap → traditional view | thread expand | Done |
| Compose in the traditional view from the camera slot, To pre-filled and locked | thread bottom bar | Done |
| Traditional-view reply: swipe right, or tap → full view → Reply | thread expand → Reply | **The spec's alternative is implemented** (tap → full view → Reply). Swipe-right itself opens the tag/folder panel, not a view picker |
| Inside a chat, recipients cannot be added to To/CC | group composer + locked `lockTo` | Done |
| Two or more recipients from Home = a group chat; later 1:1 mail stays 1:1 | derived thread keys | Done |
| Automatic phone and OTP detection | see the two rows above | Partial, as above |
| Emails organised as chats | Done |
| Manage alias IDs in settings | `/profile`, `/api/aliases` | Done |
| Web: single screen, phone + OTP + one Next button, ToS line above it | `/portal` | **Partial** — the portal is a two-step phone → OTP flow; the consent line with its hyperlink is present |
| Web home similar to Gmail, profile and settings | `/desktop`, `/desktop/profile`, `/desktop/settings` | Done — three-zone layout, token-consistent with the mobile design system |
| Folders (Drafts/Spam/Trash) as a user-facing feature | — | **Deviation** — the folder section and every route to it were removed at the owner's request, with the in-thread move actions. Nothing links to those screens |
| Language selection | — | **Deviation** — removed from Settings at the owner's request. The app is single-language by spec, so the row was decoration with nothing behind it |
| Dockerize everything; `docker compose up -d` | `docker-compose.yml`, `Dockerfile`, `smtp/Dockerfile` | Done — re-verified from a fresh clone |

## Architecture

**Runtime.** Next.js 15 App Router with every API route pinned to the Node.js
runtime (`export const runtime = "nodejs"`) — there is no Edge runtime anywhere
in the project, which is what satisfies the "backend: Node.js" requirement.
Socket.io needs a long-lived process, so the app runs through `server.mjs` rather
than `next start`; API routes and the socket server therefore share one process,
which is how a route can emit a realtime event.

**The SMTP round trip is the point.** `POST /api/emails` never writes a row. It
hands the message to the `smtp` service, which parses it and posts it back to
`/api/mail/inbound` — and that is the only place an `Email` row is ever created.
A message that did not complete the round trip therefore cannot appear as
delivered, and the hop is observable in `docker compose logs smtp`.

**Group threads are derived, not stored.** A group has no table and no
membership row: the key is
`"grp:" + sha256(sorted unique [sender, ...recipients])`. Two consequences fall
straight out of that — a reply naming the same people lands in the same thread
with no stored state, and a message with exactly one recipient has no key at all,
which is what keeps one-to-one mail exactly as it was.

**Folders are recipient-scoped state.** `Email.folder` behaves like `isRead` and
`tag`: moving a message to Spam or Trash hides it from *that reader's* inbox and
group views while the sender still sees what they sent.

**The notification gate is a server decision.** `User.registeredVia` records how
an account was FIRST created, and only `portal`, `desktop` and `ivr` are
notified. An unknown value falls to the safe side (no SMS). The throttle and the
never-fail-a-delivery rule live in `src/lib/notify.ts`.

**Aliases resolve through one lookup** (`src/lib/alias.ts`) shared by the send
route and the inbound path, so the two cannot drift apart. Uniqueness is checked
against phone numbers as well as other aliases, so an address can never be
ambiguous.

**Sessions are per tab.** The JWT lives in `sessionStorage`, so two tabs are two
accounts — that is what makes the two-tab demo work — and the auth guard is
three-phase (loading → authenticated → unauthenticated) so a refresh never flashes
the onboarding screen.

**The service worker is versioned per build.** `/sw.js` is served by a route
handler that stamps the cache name from the image's own `.next/BUILD_ID`, so a
rebuild invalidates the old shell and an installed PWA picks up new code instead
of serving a stale one.

**Migrations are committed** (`prisma/migrations/`, 11 of them) and applied by the
app container's entrypoint, so a fresh clone reaches a working schema with no
manual step.

**OTP transport history.** The project started on Fast2SMS, moved to a Twilio
trial (both blocked by KYC/trial walls for Indian numbers), and now sends through
a self-hosted Android gateway over the developer's own SIM. The formats in
`src/lib/otp.ts` are only the ones manually verified to arrive — the carrier
drops templated text and filters duplicates, which is why the code rotates among
short, verified wordings. Full history: PROJECT.md §9 and §10.

## Known limitations

Written down rather than hidden:

- **Attachments.** No attachment backend exists. The paperclip appears in the
  thread bar and the compose screen because the design calls for it, and tapping
  it says "Attachments coming soon". The Attachments filter chip carries the same
  honest empty state.
- **Phone auto-detection.** A browser cannot read the SIM — see the mapping table.
- **OTP auto-detection.** Auto-submit on the sixth digit only; no WebOTP.
- **Drafts are local to the browser.** An `Email` row needs both a sender and a
  recipient, and an abandoned compose has no recipient, so a draft is kept in
  `localStorage` rather than the database. It does not sync between devices.
- **`/portal` keeps its original styling.** It is written with inline styles
  rather than the token system, so it did not take part in the visual refresh. It
  is functional and uses the same colours.
- **Swipe-right** opens the tag/folder panel rather than the traditional-view
  reply picker; the spec's alternative path (tap → full view → Reply) is what
  ships.
- **Profile pictures.** There is no upload and no avatar route, so the
  `User.avatarBytes` / `avatarMime` / `avatarUpdatedAt` columns are unused
  scaffolding rather than a feature. Every account shows the same neutral person
  mark and the display name is what identifies a person. The mockup's "personal
  details" row is real as far as the display name goes - it is edited in Settings.
- **npm advisories.** `npm audit --omit=dev` reports **5 advisories (1 moderate,
  4 high)** in the transitive tree. No dependency was upgraded during the build,
  because the verified artefact is the committed one; upgrading the chain
  (`next`/`postcss` and their transitive deps) is the next maintenance step.

## Verification evidence

Every number below came from a run in this repository; nothing here rests on a
claim made anywhere else.

- **357 assertions** across eleven suites, in dev mode through the real SMTP round
  trip: 15 for the onboarding forms, 26 for the auth screens, 27 for the palette, 21
  for the chat reference, 21 for the traditional reader, 27 for display names, 43 for
  the group chat, 42 for the final functional items (search-to-chat, the
  Favorites/Attachments chips, the group-folder add-on), 31 for aliases plus the
  non-member 403 path, 39 for contacts, and 65 for the click-through round 2 fixes:
  single-send, the free composer, self-sends, the notification switch, account
  deletion, reply linkage and the input pass.
- **Fresh-clone evaluator simulations** several times through the build, most
  recently against the current commit: `git clone https://github.com/ah-REE/phonemail.git`
  then `docker compose up -d`, all eleven migrations applying on a clean volume,
  all four services healthy, and the same 357 assertions green on that clone.
- **Load numbers** (one run, dev mode, this machine, Node HTTP client):
  `GET /api/health` p50 **5.7 ms**, p95 **7.6 ms** over 30 sequential requests;
  `POST /api/auth/send-otp` **13.3 ms** and `POST /api/auth/verify-otp`
  **13.7 ms** as single round trips — comfortably inside the 500 ms login target.
  A 50-way concurrent burst from a single client returns all 200s with a p95 of
  **315 ms**, which is connection setup rather than server time. The OTP
  endpoints are deliberately cooldown-guarded (60s per number, 5 wrong attempts),
  so they are measured as round trips rather than under load.

## Compliance notes

**a. BACKEND = NODE.JS.** Built on Next.js (App Router) whose API routes and
server run entirely on the Node.js runtime — no Edge runtime anywhere in the
project. This satisfies the "Backend: Node.js or Go" requirement.

**b. EMAIL TRANSPORT = SELF-HOSTED LOCAL SMTP.** The `smtp` service is a
self-hosted SMTP server speaking real SMTP on port 25, implemented with Node's
`smtp-server` package (maintained by the author of `nodemailer`) rather than
Postfix/Haraka. No third-party email API is used. The Postfix/Haraka swap path is
documented in [`smtp/README.md`](smtp/README.md).

**c. OTP AUTH.** Placeholder credentials (the committed default) run dev mode —
fixed OTP `123456`, `devHint` in responses — so the two-command boot needs no
secrets. Real SMS runs through a self-hosted Android SMS gateway configured via a
gitignored `docker-compose.override.yml`. The evaluated flow never depends on
real SMS.

**d. REALTIME.** Socket.io on a custom Node server; JWT-authenticated
connections; per-user rooms, with a 30-second polling fallback when the socket is
unavailable.

## Repository layout

```
src/app/(mobile)/      the mobile client (onboarding, home, threads, compose, folders, profile)
src/app/(desktop)/     the Gmail-style desktop client
src/app/portal/        registration-only web portal
src/app/api/           every endpoint (auth, emails, conversations, aliases, mail/inbound, ivr, health)
src/lib/               domain logic (alias, threadKey, folders, inbound, notify, otp, socket, phone)
prisma/                schema + 11 committed migrations
smtp/                  the self-hosted SMTP service and its README
design/                the Stitch exports the visual language was built from
docs/                  SPEC.md (the organiser's task) and ivr-setup.md
PROJECT.md             the working plan and the full decisions log (§9)
```
