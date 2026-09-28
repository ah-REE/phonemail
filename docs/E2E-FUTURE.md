# End-to-end encryption: the design this build did not take

This document is the honest record of what "end-to-end encrypted mail" would mean
for PhoneMail, how it would be built, what it would cost, and why this build
deliberately stopped short of it.

It is written down because the alternative - a one-line "E2E encryption: not
implemented" in a limitations list - hides the interesting part: the interesting
part is that the *first* three steps are cheap and the last one is not, and that the
step that is not is the one this product's users would actually feel.

## 1. What ships today, stated plainly

Today the server sees everything. A message is composed in the browser, sent to
`POST /api/emails`, handed to the self-hosted SMTP service in `smtp/`, delivered
back to `POST /api/mail/inbound`, and written to Postgres as one row per
(sender, recipient) pair with the **subject and body in plaintext**. Encryption
exists on the wire where TLS exists and nowhere else. The word "end-to-end" does
not apply to this build, and no part of the README claims it does.

That is a normal, defensible place for a 7-day build to be. It is also a place
whose cost lands squarely on the product's stated user: a first-time smartphone
user whose phone number *is* their identity, on a service that necessarily knows
that number already.

## 2. The design that would actually be end-to-end

### 2.1 A keypair per user, created at signup, private half never uploaded

1. **Onboarding generates the keypair on the device.** `crypto.subtle.generateKey`
   with ECDH P-256 (for key agreement) plus ECDSA P-256 (for signatures), or X25519
   where a WebCrypto implementation exposes it.
2. **The private key is stored non-extractably.** `generateKey` with
   `extractable: false`, then the `CryptoKey` handle is written to IndexedDB. That
   is the strongest guarantee a browser offers: the handle can be *used* but its
   bytes cannot be read out by the page, so an XSS bug cannot exfiltrate the key -
   only *use* it while the tab is open.
3. **The public key is registered with the server** at the end of onboarding, in a
   row keyed by the phone number, alongside the algorithm and creation time.
4. **The server becomes a directory, not a reader.** It publishes public keys for
   the members of a conversation and stores ciphertext. It can no longer decrypt
   anything, and neither can the SMTP hop, because the message body is opaque bytes
   by the time it leaves the device.

### 2.2 Encrypt at compose, unwrap per recipient

A message to N recipients is sealed once and unwrapped N times:

1. The composer generates a **fresh symmetric content key** per message
   (`AES-GCM`, 256-bit).
2. `subject` and `body` - and each attachment's bytes - are encrypted with that key
   and a random 96-bit IV per object.
3. The content key is wrapped **once per recipient** with ECDH against that
   recipient's public key (ephemeral sender key + HKDF, the standard ECIES shape).
4. The envelope - ciphertext blobs, per-recipient wrapped keys, IVs, algorithm
   identifiers - is what the server stores and what the SMTP hop carries.
5. A recipient unwraps their own wrapped key with their private key and decrypts.

Because the content key is wrapped per recipient, a group message is still stored
once per recipient *row* (which is what the current model already does), each row
holding only that recipient's wrapped key. The reply-privacy invariant this build
already enforces - a group reply is visible only to its sender and the member it
answers - becomes a property of the wrapped-key set rather than of a query filter.

### 2.3 The properties this buys

- A database dump is unreadable without every recipient's private key.
- An operator cannot read mail, cannot be compelled to hand over plaintext it does
  not have, and cannot silently tamper with a body without breaking AES-GCM's
  authentication tag.
- The phone number stays the address; the *directory* mapping address to public key
  is the only thing the server must still be trusted for.

## 3. The four problems that make it a project, not a patch

### 3.1 Lost device = lost mail, and there is no good answer

This is the problem that actually killed the feature for this product.

A non-extractable browser key cannot be backed up by copying it. If the phone is
lost, wiped, or the browser profile is cleared, the private key is gone - and with
it, every message ever sent to that address, including messages sent *after* the
loss that the user has not yet read. That is not a minor edge: this product's
audience is first-time smartphone users, on cheap handsets, on numbers that get
recycled by carriers. "Lose your phone, lose your identity" is a support burden no
7-day demo can absorb.

The usual escapes all have a cost:

| Recovery design | What it costs |
|---|---|
| **Mnemonic / recovery phrase** | 12-24 words to a user who may not have a pen. This is the failure mode that made PGP unusable for exactly this audience |
| **Password-wrapped key backup** (key re-encrypted under a passphrase and stored server-side) | The server now holds an offline-attackable blob; a weak passphrase undoes the guarantee |
| **Social recovery** (Shamir shares to trusted contacts) | Requires several trusted contacts with accounts - the product's users often have none yet, and the UI to manage shares is a whole feature |
| **Platform keychain / passkey-style escrow** | The right answer technically (iCloud/Google keychain, hardware-backed), but the browser cannot reach it portably: WebCrypto gives you no hardware-backed, synchronised, non-extractable key. On the web it does not exist |
| **Server-side escrow of the private key** | Not end-to-end at all; it is the thing we were trying to avoid, with extra steps |

The honest conclusion: on the **web**, with this audience, the only recovery story
that is both usable and genuinely secure is the platform keychain - and browsers do
not expose it. That is an argument for a native shell, not for a clever workaround.

### 3.2 Key discovery, rotation and the recycled number

The server is trusted to hand out public keys. A malicious server could substitute
its own key for a recipient's (the classic MITM on the directory) unless clients
verify keys out of band - safety-number comparison, or a signed key history. For an
audience that will not compare safety numbers, the mitigation is a **trust-on-first-
use** record with a loud warning when a key changes, which is a UI, a ceremony and a
support cost.

Rotation compounds it: a new device means a new key, which means every correspondent
sees a key change, which means every correspondent sees the warning.

Indian carriers recycle phone numbers. Under E2E, a recycled number's new owner gets
a *new* keypair, so old ciphertext stays unreadable by them - good - but every sender
sees a key change, and nobody can prove the new holder is the intended person. That
is a policy problem the directory model makes visible and no crypto removes.

### 3.3 Group semantics, and what the server can no longer do

Today the group's membership, the derived thread key, and per-viewer filtering are
server-side decisions the suites assert directly. Under E2E:

- the server cannot sort, search or preview the subject (all ciphertext), so the
  inbox list, the search field and the "reply once" affordance lose their inputs;
- the notification body cannot carry a preview, so the SMS text degrades to "you have
  new mail" - which is already the sanitized form this build ships, so *that* one is
  actually free;
- a member's eligibility to read a message is enforced only by whether their wrapped
  key is in the envelope, which is fine - but the server can no longer *prove* the
  reply-privacy invariant to an evaluator, because it cannot see what it is
  protecting.

### 3.4 The SMTP hop stops being a mail path and becomes a courier

In this build the app hands a real MIME message to `smtp/`, which posts it back to
the app - the point being that the mail path is exercised for real. Under E2E the
MIME body would carry base64 ciphertext instead of text, and the inbound webhook
would store a blob. That part is mechanical. What is *not* mechanical is that the
server would then be storing messages it cannot index, which is the point, and the
cost described in 3.3 follows.

## 4. What it would take, concretely

Not a rewrite - the seams are already in the right places:

| Piece | Where it would land | Rough size |
|---|---|---|
| Keypair generation + non-extractable storage | `src/lib/keys.ts` (new), called from the onboarding flow | 1 day |
| Public-key registration + directory endpoint | an `Alias`-style table keyed by phone, `GET /api/keys` | 0.5 day |
| Envelope construction at compose | the `POST /api/emails` client path in both composers | 1 day |
| Unwrap + decrypt on read | the thread reader, `mail-reader.tsx` path | 1 day |
| Attachment sealing | the `attachments` module | 0.5 day |
| Key-change warning + recovery ceremony | new UI in Settings/onboarding | 2+ days |
| Recovery story that is actually safe | **not solvable on the web** | - |

The last row is the whole argument. The first six rows are about 6 days of work - a
whole buildathon - and they deliver a product that loses users' mail when they lose
their phone.

## 5. Why this build cut it

1. **The recovery problem has no good web answer** (3.1). Shipping E2E without a
   recovery story is worse for this audience than shipping plaintext with an honest
   note: a lost phone would silently destroy mail, and the user would blame the app.
2. **A browser cannot do non-extractable key storage with platform backup.** The
   honest fix is a native shell - which is exactly the Capacitor assessment in the
   README, and that assessment ends at the same place: web-only was the organisers'
   call.
3. **The evaluator path must stay zero-setup.** `git clone && docker compose up -d`
   has to work with no ceremony. A key directory, a key-change warning and a recovery
   flow all add setup steps to a path that is graded on working with none.
4. **The 7-day scope had higher-value work**: the mobile and desktop clients, the
   group semantics, the OTP transport, the IVR path and the SMTP round trip are what
   the brief actually asks to be demonstrated.

## 6. What would have to be true to build it anyway

- A **native shell** (Capacitor + the platform keychain), so keys are
  hardware-backed and backed up by the OS.
- A **phone-number directory** with a published, auditable key history, and a
  decision about what a key change means.
- A **stated recovery policy** - most likely "the platform keychain is the backup,
  and someone with no keychain backup is warned, in words, before they send".
- An acceptance that **the server can no longer search, preview or prove** anything
  about message content, and the client must do all of it.

Until those four are settled, adding AES-GCM to the compose path would produce a
system that looks encrypted in a demo and fails the first user who changes phones.

## See also

- [`docs/SECURITY.md`](SECURITY.md) - what *is* in this build, with the file and
  symbol for each entry, and its honest gaps.
- [`README.md`](../README.md) §5 (feature-to-spec mapping) and §7 (known
  limitations).
