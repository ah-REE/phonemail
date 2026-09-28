# PhoneMail

Your phone number **is** your email address: send to `9876543210@phonemail.com`
and it arrives in a chat-style mobile inbox. Built for rural, first-time
smartphone users who already know WhatsApp — large type, one accent colour, big
tap targets, no jargon.

> Written for the evaluator: how to run it, how to test it without sending a real
> SMS, the demo script, and an honest line-by-line mapping to `docs/SPEC.md`.

## 1. What it is

A phone number *is* the mail address: the account identity is the number, and the
address is `<number>@phonemail.com`. There is no username, no password and no
separate inbox/sent split — every exchange with one person is a single chat, the
way a messaging app works, so a first-time smartphone user already knows how to
use it. Three surfaces share one backend and one set of endpoints: a
**WhatsApp-style mobile client** at `/` (also an installable PWA), a
**Gmail-style desktop client** at `/desktop`, and a **registration-only web
portal** at `/portal`. Accounts are created and accessed with a phone number and
a one-time code; mail is delivered through a real SMTP hop rather than an email
API.

## 2. Run it

Exactly two commands:

```bash
git clone <repo-url>
docker compose up -d
```

Then open <http://localhost:3000>.

**On a laptop you land on the desktop client.** The root `/` hands a viewport of
768px or wider to `/desktop` once per tab; the phone layout answers `/mobile`
explicitly, and choosing it keeps you there (the choice lives in the tab's
sessionStorage, so the in-app links back to `/` do not bounce you out). On a narrow
viewport - a real phone, or dev-tools mobile - `/` is the phone client as it always
was.

The first boot builds the images, which takes a few minutes; after that the app
starts in seconds. No `.env` file, no manual `npm install`, no credentials —
every value both sides need is wired into `docker-compose.yml`, and anything
still a placeholder degrades gracefully.

**Four services**, all defined in `docker-compose.yml`:

| Service | Role |
|---|---|
| `app` | Next.js 15 (App Router) on the Node.js runtime, plus the Socket.io server (`server.mjs`). Runs `prisma migrate deploy` on start. Published on **3000**. |
| `postgres` | Postgres 17 — users, emails, aliases, contacts. Internal only, never published. |
| `redis` | Redis 7 — pending OTPs, cooldowns, the notification throttle. Internal only. |
| `smtp` | A self-hosted SMTP server (Node `smtp-server`). Internal only. It accepts mail for `phonemail.com` and posts each message back to the app. |

**The port is hardcoded, and that is worth knowing before you run this.**
`docker-compose.yml` publishes `3000:3000` as a literal, not from an environment
variable, so **nothing else on the host may hold port 3000** — a second PhoneMail
stack cannot bind while the first is up. (During this build the fresh-clone
evaluator simulation therefore stopped only the main `app` container for its
duration and restarted it afterwards, rather than editing the clone's compose
file and testing something other than what the repository serves.) If you need
two stacks at once, change the host side of that one line.

## 3. Testing it without any credentials (the evaluator path)

**A fresh clone runs in dev-OTP mode out of the box.** The committed
`docker-compose.yml` ships *placeholder* SMS credentials, and the app treats
those as "not configured" on purpose:

- **The OTP request policy is tiered.** The first **two** requests for a number are
  immediate (the rapid pair - somebody who mistyped wants the code now), from the
  third the spacing is **60 seconds**, and a number may have at most **five** codes per
  **2-hour** window. The window is set with the first request and does not slide, so the
  budget refills on a predictable clock. Every refusal says which rule it hit and how
  long the actual wait is.
- `POST /api/auth/send-otp` answers with the fixed development code **123456**
  and a **`devHint`** field saying so, and **no SMS is attempted**.
- Every verification run recorded in this repository was made in that mode, and
  the whole flow is reachable without a single secret.

| Mode | Trigger | Behaviour |
|---|---|---|
| **Dev (default)** | the committed placeholder credentials | fixed OTP `123456`, `devHint` in the response, no SMS |
| **Real** | a gitignored `docker-compose.override.yml` with real credentials | a 6-digit code generated with `crypto.randomInt`, sent through the gateway phone |

Real SMS turns on only when that override file supplies `SMS_GATE_LOGIN` /
`SMS_GATE_PASSWORD` — copy `docker-compose.override.yml.example` and fill it in.
The transport is a self-hosted Android SMS gateway (sms-gate.app): a phone with a
SIM, running the gateway app, sends the message. **Do not enable it while
testing** — it sends real, billable SMS from a real SIM.

## 4. The demo script

Two browser tabs side by side is the clearest demonstration: sessions are **per
tab** (`sessionStorage`), so the two tabs are two independent accounts.

1. **Two accounts, two doors.** In tab A sign in as `8870313035`, in tab B as
   `6381195975`. Pressing **Create account** with a number that already has one
   reads "Welcome back" and goes straight to the inbox; pressing **Log in** with
   a number that has none is carried into account creation ("Let's create your
   account") instead of dead-ending — the copy follows the *number's* state, not
   the button. The dev code `123456` is shown on screen via `devHint`.
2. **Send → live arrival.** In tab A use the compose button (bottom right) and
   send to `6381195975`. Tab B's chat list updates **live** over the socket, with
   an unread badge, and the new mail opens a `Subject: …` divider in the thread.
3. **Reply once.** In tab B open the thread and either press **Reply** on the mail
   or **swipe it to the right** - the swipe opens the same reply compose directly.
   Back in tab A the reply arrives, labelled `re: …`. Answering the *same* mail
   again is impossible: the affordance is gone, and the server refuses a forced
   second attempt with **`409`** — reply-once is enforced server-side, not in the
   UI.
4. **The New Mail button.** A thread has **no message box**: what looks like one
   is a **New mail** button that opens the traditional compose with `To` locked
   to that person. There is no way to type a reply into the thread and have it
   go somewhere else.
5. **A group.** From Home, compose to two recipients (`6381195975, 9500089722`).
   That is one message and one thread, visible to all three members. The creator
   **broadcasts** (their message box is the New mail button, recipient set
   locked); every other member **replies per mail**, privately, and that reply
   reaches only the person whose mail it answers. Nobody can add or remove a
   recipient inside the thread.
6. **An alias.** Profile → **Alias IDs** → add `john.doe7`. An alias must mix
   letters and digits and an account may hold **one**. Mail sent to
   `john.doe7@phonemail.com` arrives exactly as if the number had been used.
7. **A contact.** Open a thread and tap the person's name. The detail sheet opens;
   **Add** saves them, closes the sheet by itself, and the chat shows the name
   you gave them immediately — no reload.
8. **Settings.** In Profile: **Signed-in devices** (every session with a readable
   label - "Chrome on Windows" - when it signed in, when it was last active, a *This
   device* marker and a **Log out** that really ends that device's token), **Font
   size** (Normal / Large / Extra large, applied before first paint and remembered on
   this device), the **SMS notification** switch (real state the
   delivery path reads), the **Language** row, the **Folders** rows (Drafts,
   Spam, Trash — each opens its own screen, and a thread's chevron panel moves a
   mail into Spam or Trash), the display-name row, and **Delete account**, which
   verifies a live one-time code before removing everything and reports exactly
   what it removed.
9. **The chat's own grammar.** Consecutive messages from one sender group into a
   run; a calendar change draws a **date pill** ("Today", "Yesterday",
   "27 Sep"); a long mail collapses behind *Read full message*; the chevron under
   a mail opens Move to Spam / Move to Trash / Favorite / Reply. Unread state is
   the chat list's own badge - the cards carry no marker.
10. **A file.** In the compose screen THREE affordances sit where the single
   paperclip used to be: a **document** icon (file picker filtered to documents), an
   **image** icon (filtered to images) and a **camera** icon (which asks a phone for
   a capture). Up to three files, 20MB each, 40MB per message. The chosen files
   appear as cards in the MESSAGE BODY - an icon for the kind, the name, the size -
   and come off again with one tap; an oversize file is refused before it is
   uploaded. Pressing send shows real upload progress on those cards (a percentage,
   because the send goes through XMLHttpRequest precisely so it can), a failed send
   leaves them with a retry, and the message arrives with a download card inside its
   bubble in the same language. The home screen's **Attachments** chip filters to the
   conversations that carry one.

## 5. Feature-to-spec mapping

Every line of `docs/SPEC.md`, where it lives, and its honest status — done,
a documented deviation, or cut with a reason.

| Spec line | Where | Status |
|---|---|---|
| Phone number as the email ID | `prisma/schema.prisma`, `src/lib/phone.ts` | **Done** — `9876543210@phonemail.com` |
| Toll-free account creation: call, press "1", or SMS | `POST /api/ivr/signup`, `docs/ivr-setup.md` | **Done in code, operator-side wiring pending** - a full voice tree: language (1 English / 2 Tamil) -> main menu -> what PhoneMail is on 3 / **register on 4**. Twilio makes a new request per step, so the stage, the language and the replay count ride in each Gather's action URL and the token is checked on every request; an unknown stage restarts at the greeting, and two invalid digits end the call politely. The Exotel one-shot path (press 1, account ready) still works. Every branch is unit-tested against the pure flow plus live guard checks; **the real call is unverified until the console is wired** |
| Web portal, two fields (phone + OTP), registration only, resets after each signup | `/portal` | **Done** — after creation the fields clear and it returns to the empty phone step for the next account |
| If no free OTP providers are available, use password auth | — | **Not needed** — an OTP transport is available (self-hosted gateway), so the conditional fallback clause never applies |
| Web client | `/desktop` | **Done** — Gmail-style and Gmail-measured (rail 240px, list 380px, a 720px readable reading column): the rail holds the logo, the real folders and profile/settings at its foot; the list is thread-grouped with Compose in its toolbar; the pane renders stacked EMAILS (From/To/date header, full body, attachment cards, Reply) and opens on an empty state, never a form; a desktop-native composer card handles new mail and replies (the phone's compose screen is unreachable from here); settings reach full parity with the phone; and **a signed-out visitor sees the login card alone - the shell renders only for a signed-in session**. Colours are the design system's tokens only (a grep for literal hex finds none), and no chat bubbles exist anywhere on this client |
| Mobile client | `/` (mobile route group), installable PWA | **Done** |
| Access the inbox from both clients | `/` and `/desktop` | **Done** — same endpoints, same JWT. On a wide viewport `/` hands over to `/desktop` even before signing in (the desktop's own login screen takes it from there); `/mobile` is the explicit phone URL and is never redirected away from (round 12) |
| SMS notification, exact template, only for users without the mobile app (registered via call, portal or web client) | `src/lib/notify.ts`, gate on `User.registeredVia` | **Done** — the spec's own wording is the canonical format, in a rotated set of short one-line bodies (a single long fixed template is the one shape this project proved the carrier drops - see `src/lib/otp.ts`), with the subject flattened and truncated. Gated `portal`/`desktop`/`ivr`, 60s per-recipient throttle that reports `throttled` (round 12 moved it ahead of the dev-mode return, where it had been unreachable), and it can never fail a delivery. The README's own section says what has to be true for a real text to arrive |
| Implement SMS via free trial providers (Twilio et al.); a pre-available template if custom text is unavailable; the provider's international number for testing | `src/lib/otp.ts`, PROJECT.md §9 | **Superseded, documented** — Fast2SMS required KYC and the Twilio trial hit verification walls for Indian numbers, so the shipped transport is a self-hosted Android gateway through the developer's own SIM. The message formats in `src/lib/otp.ts` are the ones manually verified to arrive through a real carrier |
| Mobile: every screen follows WhatsApp's design language | `src/app/(mobile)`, tokens in `tailwind.config.ts` | **Done** |
| Screen 1: language selection | `/onboarding` step 1 | **Superseded, feature kept** — the owner replaced the step with the welcome screen, and language moved to the **Language row in Settings**, which is present (English live; Hindi and Tamil are offered as coming-soon entries that cannot be chosen, because only English ships) |
| Screen 2: Terms & Conditions | consent line above the CTA + `/terms` | **Deviation, stated** — the amended brief replaced the separate screen with an acknowledgement line, which is what ships; the line links to the real Terms page |
| Screen 3: phone verification, automatically detected and pre-filled, editable | `/onboarding` step 2 | **Partial, platform-limited** — a web page cannot read the SIM. The honest equivalent ships: the last number that signed up **on this device** is pre-filled, and it stays editable |
| Screen 4: OTP automatically detected and verified, then the inbox | `/onboarding` step 3 | **Partial** — the code auto-submits on the sixth digit; WebOTP (SMS Retriever) is not implemented, because it needs the app to be a verified origin |
| Request device permissions during onboarding (SIM, SMS, contacts) | — | **Not applicable on the web** — no such permission exists for a browser page |
| Home: two ways to compose — traditional (bottom-right button) and chat view (search a number) | Home | **Done** — and since round 4 they are the *only* ways: a thread has no composer, so a message can only start from Home or from a mail's Reply |
| No separate Inbox or Sent — everything is a conversation | `GET /api/conversations` | **Done** |
| Full-width search bar | Home | **Done** |
| Filter chips: All, Unread, Attachments, Favorites | Home | **Done** — all four filter. **Attachments** filters on a real count of the files a conversation carries |
| Top-left menu: Home, Drafts, Spam, Trash | Settings → Folders | **Deviation, resolved** — the drawer was removed at the owner's request and the folders became rows in Settings, each opening its own screen, with move-to-folder in a thread's chevron panel. The destination changed; the feature is present |
| Profile icon, top-right → account settings: alias IDs, language, personal details, profile picture and more | Home → `/profile` | **Done** for aliases, language, the display name, the folders, the notification switch and account deletion; **the profile picture is not built** (see limitations) |
| Compact Subject field above the message box | traditional `/compose` | **Done as superseded** — the subject field's home is the **traditional compose**, and the thread's message box is a **New mail** button that opens it. A mail that opened a subject renders `Subject: <subject>`; only a reply renders `re: <subject>` |
| All emails from the same sender stay in one chat | `GET /api/conversations` | **Done** |
| New emails display the subject at the top; replies are linked to the original (swipe right to tag the original message) | thread | **Done with one moved gesture** — a new subject draws a divider at its chronological position, and a reply carries a link to the exact mail it answers plus a quoted preview. The tag/move panel is on **swipe left**; **swipe right** opens the reply compose for that mail directly (quoted context, derived subject, reply-once) |
| When replying the Subject field is hidden; for new emails it stays visible | `/compose` | **Deviation, stated** — the reply's subject is pre-filled `re: <original>` and stays visible, so the sender can see what they are answering |
| Each message can be replied to only once | `POST /api/emails` claim, `Email.repliedAt` | **Done** — a conditional update, so a race cannot double-reply; the affordance disappears once a mail is answered, and a forced second attempt answers `409` |
| A long email: tap it to open the traditional view | thread → *Read full message* | **Done** |
| Delete a conversation | the person sheet (a thread's header, or the address book) | **Done** - *Delete chat*, with a confirmation that says what actually happens. It is RECIPIENT-SCOPED: your side of the pairwise thread leaves your list, your thread and your unread count, and the counterpart's copy is untouched, because the row is shared. Group messages are never touched by it, and a new mail from the same person restarts the conversation |
| Compose a new email in the traditional view from the space WhatsApp's camera tab occupies; `To` pre-filled and locked | the thread's **New mail** button | **Done** — the camera slot became the New mail button; `To` arrives pre-filled and locked |
| Reply in the traditional view: swipe right and pick it, or tap the mail → full view → Reply | thread | **Done** - swipe right now OPENS the reply compose for that mail directly (quoted context, derived subject, `replyToId`, reply-once), and the spec's alternative (tap → full view → Reply) also ships |
| CC in the traditional compose | `/compose`, `POST /api/emails` | **Done** - a real Cc field directly under To, with the same chips, the same resolution (a number or an alias), the same contacts autocomplete and per-chip removal. Cc recipients ARE recipients: they receive fan-out rows exactly as the To list does, they count towards the group, and the MIME message carries the Cc header. *(Round 21: the multipart send path read `to` and `attachments` and never `cc`, so a message with a file attached silently dropped every Cc recipient - no row, no thread membership, no error. Fixed, and `ct23` now freezes the 2 To + 1 Cc delivery on both payload shapes.)* |
| Inside a conversation, new recipients cannot be added to To or CC; they stay locked in the traditional view; multiple recipients only from Home's compose | locked `lockTo` on the New mail compose | **Done** — a thread has no recipient field at all |
| Two or more recipients from Home create a group chat; later mail to one recipient stays in its own 1:1 chat | derived thread keys (`src/lib/threadKey.ts`) | **Done** |
| Group replies are visible only to their sender and the group's creator | `POST /api/emails` (validated group key) + the group thread's per-viewer filter | **Done** — the creator broadcasts; every other member replies from a mail, the reply is addressed to that mail's author, carries the group key explicitly, and appears in exactly two payloads. One reply per member per mail, and the socket event reaches only the recipient |
| Summary: automatic phone & OTP detection (password if OTP is unavailable) | see the two rows above | **Partial, platform-limited**, as above |
| Summary: emails organised as chats | — | **Done** |
| Summary: manage alias IDs in settings | `/profile`, `/api/aliases` | **Done** — an account holds one alias, and it must mix letters and digits, so an alias cannot be a second phone number and cannot be all digits |
| Web: a single screen with phone, OTP and one Next button; "By signing up, you agree to the Terms of Service" above it, hyperlinked | `/portal` | **Partial** — the portal is a two-step phone → OTP flow rather than one screen; the consent line with its live hyperlink is present |
| Web home similar to Gmail; no conversation-style interface; profile and settings provided | `/desktop`, `/desktop/inbox`, `/desktop/profile`, `/desktop/settings` | **Done** — the desktop shows MAIL, not chat: the reading pane renders one stacked email per message (round 12 removed the last bubble markup), the rail's three folder items are the real `Email.folder` values, and settings carry profile/aliases/language/SMS/font size/devices/delete - the same endpoints and modules the phone uses |
| Dockerize everything; software must be up at `docker compose up -d` | `docker-compose.yml`, `Dockerfile`, `smtp/Dockerfile` | **Done** — re-verified from a fresh clone of origin |

**The two deviations that were closed**, for the record: the **Language** row and
the **Folders** rows were both restored to Settings (they had briefly been
removed), so the mapping no longer carries a deviation for either.

### Remaining gaps, each with its recommendation

Re-checked line by line against `docs/SPEC.md` on 2026-09-28. "Unverified" means
implemented here but not provable from this repository alone.

| # | Gap or unverified flag | Status | Recommendation |
|---|---|---|---|
| 1 | Phone verification is not automatic (no SIM, no WebOTP) | Partial, platform-limited | Accept: a web page cannot read the SIM; the last-number pre-fill plus auto-submit on the sixth digit is the honest maximum |
| 2 | The IVR signup's real call is unverified | Unverified (operator-side) | Wire the Exotel/Twilio console, then re-run `ct19` against a live call and record the transcript |
| 3 | Profile picture is not built | Cut | Either remove the `User.avatar*` columns or build upload plus a party-checked serving route - do not leave unused scaffolding |
| 4 | `/portal` keeps its inline styles | Deviation, stated | Port it onto the token system the next time it is touched; it is a registration-only page |
| 5 | Drafts live in `localStorage` | Deviation, stated | Accept for a single-device demo; a server-side draft needs a recipient-less row, which the `Email` model deliberately forbids |
| 6 | No TLS at the app layer | Unverified (deployment) | Terminate TLS in front of the app before any real deployment; the Compose stack is HTTP for the evaluator |
| 7 | 7-day JWT with no revocation list | Gap, documented | Per-device sessions already revoke; the token itself cannot. Accept for the demo, or shorten the TTL |
| 8 | 5 npm advisories in the transitive tree | Unverified (informational) | Upgrade the `next`/`postcss` chains after submission; the committed artefact is the verified one |
| 9 | Committed placeholder secrets | Deviation, documented | Rotate through `docker-compose.override.yml` (gitignored), exactly as the SMS credentials already are |
| 10 | SMS needs the gateway phone online | Unverified (external) | Accept: a fresh clone runs in dev mode and the evaluated path never needs a real text |
| 11 | Responsiveness is audited by a browser harness, not by a suite | Verified | 16 page-width combinations across both clients, 0 findings; it stays out of the regression because the regression must run with no browser |

## 6. Architecture

**Runtime.** Next.js 15 App Router with every API route pinned to the Node.js
runtime (`export const runtime = "nodejs"`) — there is no Edge runtime anywhere in
the project, which is what satisfies the "backend: Node.js" requirement. Socket.io
needs a long-lived process, so the app runs through `server.mjs` rather than
`next start`; API routes and the socket server therefore share one process, which
is how a route can emit a realtime event.

**Four Docker services**: `app`, `postgres`, `redis`, `smtp` — one internal
network, one compose file, one command. Postgres, Redis and SMTP publish nothing;
only `app:3000` is reachable from the host.

**The SMTP round trip is the point.** `POST /api/emails` never writes a row. It
hands the message to the `smtp` service, which parses it and posts it back to
`/api/mail/inbound` — and **that is the only place an `Email` row is ever
created**. A message that did not complete the round trip therefore cannot appear
as delivered, and the hop is observable in `docker compose logs smtp`.

**Group threads are derived, not stored.** A group has no table and no membership
row: the key is `"grp:" + sha256(sorted unique [sender, ...recipients])`. Two
things fall out of that — a reply naming the same people lands in the same thread
with no stored state, and a message with exactly one recipient has no key at all,
which keeps one-to-one mail unchanged.

**The broadcast / reply visibility model.** In a group, the creator's mail is a
**broadcast**: every member reads it. Any other member's mail is a **reply**,
addressed to the one member whose mail it answers, carrying the group key
explicitly — so a reply lives in exactly two payloads, its sender's and its
recipient's, and nobody else's socket hears about it. `replyToId` is what
distinguishes the two in the data, which is why a broadcast cannot be filed as a
reply or a reply as a broadcast.

**The notification gate is a server decision.** `User.registeredVia` records how
an account was *first* created; only `portal`, `desktop` and `ivr` are notified.
An unknown value falls to the safe side (no SMS), and the account's own switch can
only ever *narrow* who is notified — never widen it past what the spec allows. The
throttle and the never-fail-a-delivery rule live in `src/lib/notify.ts`.

**Folders are recipient-scoped state.** `Email.folder` behaves like `isRead` and
`tag`: moving a message to Spam or Trash hides it from *that reader's* inbox and
group views, while the sender still sees what they sent.

**Aliases resolve through one lookup** (`src/lib/alias.ts`) shared by the send
route and the inbound path, so the two cannot drift apart. Uniqueness is checked
against phone numbers as well as other aliases, so an address is never ambiguous.

**Sessions are per tab.** The JWT lives in `sessionStorage`, so two tabs are two
accounts — that is what makes the two-tab demo work — and the auth guard is
three-phase (loading → authenticated → unauthenticated) so a refresh never flashes
the onboarding screen.

**The service worker is build-stamped, and navigations are network-first.**
`/sw.js` is served by a route handler that stamps the cache name from the image's
own `.next/BUILD_ID`, so a rebuild rotates the cache and an installed PWA picks up
new code instead of serving a stale one. Navigations are answered from the
**network** whenever the network is there; the precache is only the **offline
fallback**, and matching respects the full URL including search params (no
`ignoreSearch`). That is what stops a returning user — or the installed PWA — from
being served a previous build's shell.

**Attachments are rows, not files.** A file's bytes live in Postgres (`Attachment`),
like the avatar, because the container filesystem is not durable and "no filesystem
storage" was the requirement. A message with files is submitted as
multipart/form-data over the SAME single SMTP submission the text uses, the SMTP
service hands the MIME parts on, and the inbound webhook - still the only writer of
an `Email` row - stores the files with it. Downloads are JWT-gated and party-only:
401 without a token, 403 for anyone but the message's sender and recipient.

**Migrations are committed** (`prisma/migrations/`, 13 of them) and applied by the
app container's entrypoint, so a fresh clone reaches a working schema with no
manual step.

**OTP transport history.** The project started on Fast2SMS, moved to a Twilio
trial (both blocked by KYC / trial verification walls for Indian numbers), and now
sends through a self-hosted Android gateway over the developer's own SIM. The
formats in `src/lib/otp.ts` are only the ones manually verified to arrive — the
carrier drops templated text and filters duplicates, which is why the code rotates
among short, verified wordings. Full history: PROJECT.md §9 and §10.

## 7. Known limitations

Written down rather than hidden:

- **Attachments have limits, and they are deliberate.** Three files per message,
  20MB each, 40MB in total, enforced in the browser, in the send route and again on
  the inbound webhook. A group message stores its files once per recipient row
  rather than sharing them through a join table - duplicated bytes in exchange for
  an attachment owned by exactly the row it belongs to, which is what keeps the
  download check the row's own party check. There is no share link: a download needs
  a session, and the bytes are fetched with the same Authorization header
  everything else uses, so a token never appears in a URL.
 The display name is real, editable
  and what the profile header leads with. A **profile picture is not built**: no
  upload, no serving route, the `User.avatar*` columns are unused scaffolding, and
  every account shows the same neutral person mark.
- **Phone auto-detection and WebOTP are platform-limited.** A browser cannot read
  the SIM, and SMS Retriever needs a verified origin; the app does what the
  platform allows (last-number pre-fill, auto-submit on the sixth digit).
- **`/portal` keeps its original styling.** It is written with inline styles
  rather than the token system, so it did not take part in the visual refresh. It
  is functional and uses the same palette.
- **Drafts are local to the browser.** An `Email` row needs both a sender and a
  recipient and an abandoned compose has no recipient, so a draft is kept in
  `localStorage` rather than the database. It does not sync between devices.
- **5 npm advisories** (`npm audit --omit=dev`: 1 moderate, 4 high) in the
  transitive tree. They are informational here: no dependency was upgraded during
  the build, because the verified artefact is the committed one, and upgrading the
  chain (`next`/`postcss` and their transitive deps) is the next maintenance step.
- **SMS delivery needs the gateway phone online.** Real SMS goes through a
  self-hosted Android gateway, so delivery requires that phone running the gateway
  app with a working SIM. Nothing in the evaluated path depends on it — a fresh
  clone runs in dev mode.
- **Carrier filtering is real.** Indian carriers drop templated or duplicated SMS
  text, which is why only a small set of message wordings is used and why the code
  rotates between them rather than sending one long custom sentence.
- **There is no end-to-end encryption, and it was a decision.** The server sees
  subject and body in plaintext. The full design that would change that - per-user
  keypairs at signup, a non-extractable private key on the device, encrypt at
  compose, a ciphertext-only server - is written up in
  [`docs/E2E-FUTURE.md`](docs/E2E-FUTURE.md), together with the reason it was cut:
  on the web there is no recovery story for a lost device that is both usable and
  safe, and shipping without one would turn "lost my phone" into "lost my mail" for
  exactly the users this product is for.
- **No native shell.** The Capacitor/Android assessment is in §10.2: feasible, but
  it needs a hosted backend, the organisers clarified web-only, and the PWA already
  delivers install, standalone and an offline shell.

## 8. Verification evidence

Every number below came from a run in this repository; nothing here rests on a
claim made anywhere else.

- **861 assertions across 28 suites, green on the loaded database**, in dev mode
  through the real SMTP round trip: 15 for the onboarding forms, 27 for the auth
  screens, 27 for the palette, 21 for the chat reference, 21 for the traditional
  reader, 21 for display names, 39 for the group chat, 36 for the final functional
  items, 25 for aliases plus the non-member 403 path, 37 for contacts, 60 for the
  round-2 fixes, 54 for the round-3 items, 32 for the settings reference
  (source-only), 20 for the round-3 chat fixes, 10 for the round-4 polish rules
  (source-only), 26 for round 4, 25 for round 5 (the service worker **executed in a
  sandbox** rather than read), 26 for round 6 (source-only), 32 for round 7 (the
  deployed stylesheet plus the attachment round trip, hashes included), 33 for round
  8, 47 for round 9 (the five fixes, CC, delete chat's scoping and the security
  report's references - including the reply-privacy invariant proven for the payload
  AND the socket), 50 for round 10 (the IVR tree: 28 mocked branches plus 22 live
  checks), 53 for round 11 (the contact sheet's in-place confirmation, the font-size
  module and its pre-paint bootstrap, the wide-screen handover, the **tiered OTP
  policy driven live**, sessions with per-device revocation, and the desktop moved
  onto the design system's tokens), and **54 for round 12**: the notify chain's
  **six outcomes driven live** (including the throttle, which the old gate order made
  unreachable), the rotated and sanitized notification body, the wide-screen entry
  decision at five widths and four URLs, the contact save's animated confirmation,
  the role tags proven through a real SMTP round trip on a member set that had never
  existed, the rail's real folder links, the endpoints the desktop settings reuse,
  and the absence of bubble markup in the new traditional reading pane; and **24 for round 13**: the signed-out page carrying no shell, the reading pane's empty default, the desktop composer's fields, affordances and BOTH send paths driven live, the Gmail measures, the token audit and every desktop route.

  And **round 21**, the final hardening pass: **12** for the multi-recipient fix (2 To
  + 1 Cc delivered on BOTH payload shapes, with the multipart path that used to drop
  the Cc recipient frozen shut), **56** for the re-pointed round-8 suite (it now
  grades the FLAT OTP policy that ships - a second request inside 60s refused, allowed
  after it, the 5-strike burn untouched, and no window counters in any response),
  **17** for the security headers read off live responses including a 404, and **16**
  for the hardening proof: the manifest, the two icons and a real service worker
  (installable), the socket accepting a real tab token, a message landing in an OPEN
  socket *and* in the recipient's inbox while postgres, redis and smtp sit on internal
  networks, and the egress checks that show those three cannot reach the internet
  while the app still can. The responsiveness audit is separate from the suites - it
  drives a real browser at 360/390/768/1024/1440 on both clients (16 page-width
  combinations, 0 findings) and so cannot run in a regression that must work with no
  browser.

  `ct5/settings_ref.mjs`, `ct8/polish_regression.mjs` and
  `ct15/clickthrough6_regression.mjs` are the **source-only** suites: they grade a
  design, a copy rule and the shape of the markup, which live in the source and the
  tokens, so they need no server, no OTP and no mode - and are never a reason to
  touch one.
### SMS notifications: what has to be true for a real text to arrive

The app sends a "you have new mail" SMS through the sms-gate.app gateway. In the
default checkout it deliberately sends NOTHING, and that is the feature working,
not a fault:

- **Dev mode never sends.** `docker-compose.yml` ships placeholder gateway
  credentials, and the code treats a placeholder as "no gateway": the delivery
  path records the outcome `dev-mode` and returns. To send real SMS, put the real
  credentials in `docker-compose.override.yml` (see
  `docker-compose.override.yml.example`); that file is gitignored and must NOT be
  committed.
- **The gateway phone has to be online with the app running.** sms-gate.app queues
  each message for the paired Android device. If that phone is off, has no signal,
  or the sms-gate app is not running, the gateway still accepts the message (it
  answers 2xx, which means "queued", not "delivered") and nothing arrives.
- **The recipient has to be notifiable.** The spec allows this SMS only for users
  who do NOT have the mobile app, which the app records as `User.registeredVia`:
  `portal`, `desktop` or `ivr` notify; `mobile` (and anything unrecognised) does
  not. An account that first signed in on the phone therefore never gets these
  texts, even if it later uses the web client - first registration is what counts.
- **The account's own switch has to be on.** `/profile` (phone) and
  `/desktop/settings` carry a switch for it, on by default. It can only ever
  narrow who is notified, never widen it past the spec's rule.
- **One text per recipient per 60 seconds.** A burst of mail cannot drain the
  SIM's quota; the second message inside the window reports `throttled`.

The delivery path records WHY for every message - `sent`, `throttled`,
`dev-mode`, `failed`, `skipped-mobile`, `skipped-disabled` or `skipped-self` -
and the SMTP service logs that outcome with the delivery it belongs to, so the
answer to "why did no text arrive?" is always in `docker compose logs smtp`.

- **Fresh-clone evaluator simulations, repeatedly through the build** - most
  recently against the current commit: `git clone https://github.com/ah-REE/phonemail.git`
  then `docker compose up -d`, all FIFTEEN migrations applying on a clean volume (the
  Session table included), all four services healthy, `/`, `/mobile`, `/desktop`,
  `/desktop/inbox`, `/desktop/settings`, `/compose` and `/favicon.ico` all answering
  200, and **all twenty-three suites run against that clone**, with one documented skip
  (a socket assertion that needs a socket client from `node_modules`, which a fresh
  clone only has inside its container - the same assertion runs and passes on the
  loaded database). That includes the attachment suites, the reply-privacy invariant
  suite, the IVR tree and the round-11 suite, so file sending, CC, delete chat, the
  voice tree, the tiered OTP policy and per-device revocation all work on a clone as
  well as here. The suites that inspect the database directly were run with
  `COMPOSE_DIR=<clone>` so they read the stack actually under test.
- **The service-worker counterfactual.** The stale-shell fix is not asserted by
  reading code: the served `/sw.js` is fetched over HTTP, executed in a Node
  sandbox with stubbed `self`/`caches`/`fetch`, and driven with real requests.
  With a previous build's shell cached at `/` and the network available, the
  **pre-fix** worker returns the stale shell for a navigation while the current one
  returns the network's answer. Pre-fix stale, post-fix fresh — the counterfactual
  holds.
- **Load numbers** (one run, dev mode, this machine, Node HTTP client):
  `GET /api/health` p50 **5.7 ms**, p95 **7.6 ms** over 30 sequential requests;
  `POST /api/auth/send-otp` **13.3 ms** and `POST /api/auth/verify-otp` **13.7 ms**
  as single round trips — comfortably inside the 500 ms login target. A 50-way
  concurrent burst from a single client returns all 200s with a p95 of **315 ms**,
  which is connection setup rather than server time. The OTP endpoints are
  deliberately cooldown-guarded (60s per number, 5 wrong attempts), so they are
  measured as round trips rather than under load.

## 9. Compliance notes

**a. BACKEND = NODE.JS.** Built on Next.js (App Router) whose API routes and
server run entirely on the Node.js runtime — no Edge runtime anywhere in the
project, which is what satisfies the "Backend: Node.js or Go" requirement.

**b. EMAIL TRANSPORT = SELF-HOSTED LOCAL SMTP.** The `smtp` service is a
self-hosted SMTP server speaking real SMTP on port 25, implemented with Node's
`smtp-server` package (maintained by the author of `nodemailer`) rather than
Postfix/Haraka. No third-party email API is used. The Postfix/Haraka swap path is
documented in [`smtp/README.md`](smtp/README.md).

**c. OTP AUTH.** Placeholder credentials (the committed default) run dev mode —
fixed OTP `123456`, `devHint` in responses — so the two-command boot needs no
secrets. Real SMS runs through a self-hosted Android SMS gateway configured via a
gitignored `docker-compose.override.yml`. The evaluated flow never depends on real
SMS.

**d. REALTIME.** Socket.io on a custom Node server; JWT-authenticated
connections; per-user rooms, with a 30-second polling fallback when the socket is
unavailable.

**Security.** Every security feature that is actually in this build - OTP-only auth,

the JWT and its gating, the notification rules, the webhook secrets, the reply-once
claim, party-only downloads, the group reply invariant, the alias rules, deletion
and the service worker's scope - is written up in
[`docs/SECURITY.md`](docs/SECURITY.md), each entry with the file and symbol to grep
for. The honest gaps (no TLS at the app layer, the npm advisories, the 7-day token
with no revocation, the committed placeholder secrets and their rotation policy)
are at the end of the same document.

## 10. Future work

In the order it would actually help.

### 10.1 End-to-end encryption - designed, and deliberately not built

Per-user keypairs at signup, the private key non-extractable on the device, encrypt
at compose, a server that holds ciphertext only: the whole design, with what it buys
and what it costs, is in [`docs/E2E-FUTURE.md`](docs/E2E-FUTURE.md). The short
version of why it is not here: on the web there is no *usable and safe* recovery for
a lost device, and shipping encryption without one would turn "lost my phone" into
"lost my mail" for exactly the users this product is for.

### 10.2 A native shell (Capacitor / Android) - assessed, not taken

**The assessment: feasible, but it needs a hosted backend.** A Capacitor wrapper is
mechanically straightforward - the client is already a single-origin web app with a
service worker, its storage is `sessionStorage`, and every call is same-origin HTTP.
It would give a real install, a real icon and, the one thing the web cannot give,
access to the platform keychain (§10.1) and to SMS Retriever for automatic OTP.

What it needs first is the deployment: a Capacitor app cannot reach
`localhost:3000`, because a phone has no Compose stack. Shipping the shell means
operating the API and the SMTP hop at a public HTTPS origin - a deployment project,
not a packaging one.

**What the organisers said:** web-only, explicitly, so a native build would sit
outside the brief.

**What ships instead:** the PWA. `manifest.json` with `display: standalone` and both
icons, a service worker with install/activate/fetch handlers registered from the
mobile shell, realtime over a socket with a 30-second polling fallback, and five
security headers on every response. That is install-from-the-browser, a standalone
window and an offline shell - the same user-visible outcome as a thin native wrapper,
with none of the deployment.

**The call:** keep the PWA for this scope. Revisit Capacitor only alongside §10.1
(native keychain) *and* a hosted backend, because either alone does not pay for
itself.

### 10.3 The small ones

- Rotate the committed placeholder secrets and terminate TLS before any real
  deployment (see §7 and `docs/SECURITY.md`).
- Upgrade the `next`/`postcss` chains to clear the five advisories.
- Build the profile picture, or remove the `User.avatar*` columns.
- Port `/portal` onto the token system.

## Repository layout

```
src/app/(mobile)/      the mobile client (onboarding, home, threads, compose, folders, profile)
src/app/(desktop)/     the Gmail-style desktop client (/desktop, /desktop/inbox, profile, settings)
src/app/portal/        registration-only web portal
src/app/api/           every endpoint (auth, emails, conversations, aliases, contacts, mail/inbound, ivr, health)
src/components/        shared UI (message card, app bar, back button, wordmark, user sheet, avatar)
src/lib/               domain logic (alias, threadKey, timeline, folders, inbound, notify, otp, socket, phone)
prisma/                schema + 13 committed migrations
smtp/                  the self-hosted SMTP service and its README
design/                the Stitch exports the visual language was built from
docs/                  SPEC.md (the organiser's task), SECURITY.md and E2E-FUTURE.md
PROJECT.md             the working plan and the full decisions log (§9)
```
