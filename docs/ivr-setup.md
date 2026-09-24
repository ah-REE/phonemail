# IVR signup (Exotel)

A caller dials the PhoneMail number and presses 1; Exotel calls
`/api/ivr/signup`; the caller gets an account with no OTP, because **the call
itself proves the number** — you cannot place a call from a number you do not
control, and Exotel reports it in `CallFrom`.

## What the endpoint expects

| | |
|---|---|
| Method | `POST` |
| Auth | `?token=<IVR_WEBHOOK_SECRET>` in the URL (or an `x-ivr-secret` header) |
| Caller number | `CallFrom` — query string, form body or JSON body |
| Success | `200` + XML `<Response><Say>Your PhoneMail account is ready…</Say></Response>` |
| Wrong secret | `401` + XML apology |
| Unreadable number | `400` + XML apology |
| Secret not configured | `503` + XML apology |

The route is **idempotent**: pressing 1 twice returns the same account, never a
duplicate. Accounts are created with `upsert`, so an existing number is simply
returned.

## Exotel console steps (you do these)

1. **Get a trial number** in the Exotel dashboard (a virtual number that can
   receive calls).
2. **Create an Applet flow**: *Greeting* ("Press 1 to create your PhoneMail
   account") → *Gather* (single digit, 1) → **Passthru** applet whose URL is
   your public endpoint with the token:
   `https://<your-public-host>/api/ivr/signup?token=<IVR_WEBHOOK_SECRET>`
   Add `CallFrom` to the passthru parameters so the endpoint can read the
   caller's number (Exotel sends it by default, but make it explicit).
3. **Point the number at that flow** (App → Connect → your flow).
4. The XML the endpoint returns is spoken back to the caller.
5. Set the same `IVR_WEBHOOK_SECRET` in `docker-compose.override.yml` (see
   `docker-compose.override.yml.example`) and `docker compose up -d app`.

## The public URL problem

Exotel must reach your machine from the internet, so `localhost` will not work.
Two options:

- **Tunnel (fastest):** `ngrok http 3000` or `cloudflared tunnel --url
  http://localhost:3000`, then use the printed HTTPS URL in the Passthru applet
  and re-point it whenever the tunnel restarts (free tiers rotate the hostname).
- **Hosted deployment** (Day 7): put the stack on a host with a stable domain
  and use that, which removes the rotating-URL problem entirely.

## Verifying the code path without Exotel

```bash
# correct secret -> account created (repeat: same account, still 200)
curl -i -X POST "http://localhost:3000/api/ivr/signup?token=<secret>&CallFrom=+918870313035"

# wrong secret -> 401
curl -i -X POST "http://localhost:3000/api/ivr/signup?token=wrong&CallFrom=+918870313035"
```

## Status

The endpoint is code-complete and tested (secret check, caller upsert,
idempotency, XML shape). **The real call is unverified until you wire the Exotel
console** — that is the one step that cannot be done from this machine.
