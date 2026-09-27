# IVR signup — the voice tree

A caller dials the PhoneMail number and gets an account with no OTP, because **the
call itself proves the number**: you cannot place a call from a number you do not
control, and the provider reports it (`From` on Twilio, `CallFrom` on Exotel).

The endpoint serves two shapes, branching on what arrives:

| Path | Trigger | Behaviour |
|---|---|---|
| **Twilio voice tree** | a `From`, with or without a `stage` | the multi-step menu below — registration is **option 4** |
| **Exotel one-shot** | a `CallFrom` and no `stage` | the original reply: press 1, account ready |

## The call, step by step

**STEP 1 — the call connects** (no `stage`, no digits): the language menu.

> Welcome to PhoneMail. Choose your language. For English, press 1. For Tamil, press 2.

**STEP 2 — `stage=lang`**, with `Digits`:

| Digits | Answer |
|---|---|
| `1` | the main menu, in English |
| `2` | *"Tamil is coming soon. Continuing in English."* then the main menu |
| anything else | the language menu again (max 2 replays, then goodbye + `<Hangup/>`) |

**STEP 3 — `stage=main&lang=en`**, with `Digits`:

| Digits | Answer |
|---|---|
| `3` | what PhoneMail is, ending *"To register now, press 4."* then the menu again |
| `4` | the account is created (idempotent `upsert`), then the congratulations and `<Hangup/>` |
| anything else | the main menu again (max 2 replays, then goodbye + `<Hangup/>`) |

**Registering** says the address digit by digit, because a TTS voice reading
"8870313035 at phonemail dot com" as one number is unintelligible:

> Congratulations! Your registration is successful. Your email address is
> 8 8 7 0 3 1 3 0 3 5 at phonemail dot com. Thank you for choosing PhoneMail.

**Why Tamil ends in English:** Twilio's TTS has no Tamil voice and the app ships
English only. Saying so and continuing is the honest handling — the alternative is
either pretending or dropping the caller.

## How the state survives between steps

Twilio makes a **new HTTP request for every menu step**, so nothing is kept on the
server: the stage, the language and the replay count ride in each `<Gather>`'s
`action` URL's query params, and the **token is checked on every one of them**:

```
/api/ivr/signup?token=<secret>&stage=lang&lang=en&attempts=0
```

An unknown `stage` (a stale or hand-crafted URL) restarts at STEP 1 with a fresh
greeting rather than failing. The flow itself is a pure function —
`src/lib/ivr.ts` — so every branch is unit-tested without a server; the route
(`src/app/api/ivr/signup/route.ts`) keeps only the token check, the caller lookup
and the single write.

## What the endpoint expects

| | |
|---|---|
| Method | `POST` |
| Auth | `?token=<IVR_WEBHOOK_SECRET>` in the URL, or an `x-ivr-secret` header — **every request** |
| Stage | `stage=lang` or `stage=main`; anything else restarts at STEP 1 |
| Digits | `Digits` (Twilio), `DtmfDigits` or `digits` |
| Caller number | `From` (Twilio) or `CallFrom` (Exotel) — query string, form body or JSON body |
| Voice | `woman`, one digit per menu |
| Wrong or missing token | `401` + XML apology, at every stage |
| Unreadable number | `400` + XML apology |
| Secret not configured | `503` + XML apology |

Accounts are created with `upsert`, so pressing 4 twice — or calling again — returns
the same account and never a duplicate. **`Digits=4` at `stage=main` is the only
place in this flow that writes anything.**

## Exotel console steps (the one-shot path)

1. **Get a trial number** in the Exotel dashboard (a virtual number that can
   receive calls).
2. **Create an Applet flow**: *Greeting* → *Gather* (single digit, 1) → **Passthru**
   applet whose URL is your public endpoint with the token:
   `https://<your-public-host>/api/ivr/signup?token=<IVR_WEBHOOK_SECRET>`
   Add `CallFrom` to the passthru parameters (Exotel sends it by default, but make
   it explicit).
3. **Point the number at that flow**; the XML the endpoint returns is spoken back.
4. Set the same `IVR_WEBHOOK_SECRET` in `docker-compose.override.yml` and
   `docker compose up -d app`.

## Twilio console steps (the tree)

1. Buy or configure a number that can receive calls, with a **voice webhook** of
   type `HTTP POST` pointing at
   `https://<your-public-host>/api/ivr/signup?token=<IVR_WEBHOOK_SECRET>`.
   Nothing else is needed: every later step is driven by the `action` URLs this
   endpoint returns, which carry the token and the stage.
2. Keep the same `IVR_WEBHOOK_SECRET` as the mail webhook pattern — a single shared
   secret, rotated with the rest (see `docs/SECURITY.md`).

## The public URL problem

A provider must reach your machine from the internet, so `localhost` will not work:

- **Tunnel (fastest):** `ngrok http 3000` or `cloudflared tunnel --url
  http://localhost:3000`, then use the printed HTTPS URL in the console and
  re-point it whenever the tunnel restarts (free tiers rotate the hostname).
- **Hosted deployment:** a host with a stable domain removes the rotating-URL
  problem entirely.

## Verifying the code path without a phone

```bash
S=<IVR_WEBHOOK_SECRET>

# STEP 1: the language menu (carries token + stage=lang in the Gather action)
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&From=%2B918870313035"
# -> <Gather action="/api/ivr/signup?token=...&stage=lang&lang=en&attempts=0" numDigits="1">

# STEP 2: English -> the main menu
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&From=%2B918870313035&stage=lang&Digits=1"

# STEP 3: 3 explains PhoneMail (and offers 4)
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&From=%2B918870313035&stage=main&lang=en&Digits=3"

# STEP 3: 4 registers -- IDEMPOTENT, so running it twice is safe
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&From=%2B918870313035&stage=main&lang=en&Digits=4"

# guards
curl -i -X POST "http://localhost:3000/api/ivr/signup?token=***&From=%2B918870313035"   # 401
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&From=%2B918870313035&stage=bogus"  # STEP 1 again

# the Exotel one-shot, unchanged
curl -sS -X POST "http://localhost:3000/api/ivr/signup?token=$S&CallFrom=%2B918870313035"
```

The same checks run automatically: `ct19/ivr_tree_unit.mjs` drives **every branch of
the flow as a pure function** (mocked — no server, no database) and then proves the
live guards against the running app.

## Status

The endpoint is code-complete and tested: every branch of the tree (language,
Tamil, the description, registration, both replay limits, the unknown stage), the
idempotent upsert, the token guard on every request, and the Exotel one-shot path.
**The real call is unverified until the console is wired** — that is the one step
that cannot be done from this machine.
