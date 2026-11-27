# Turf Booking

A booking app for a single turf venue. Customers browse photos and book slots; a 5-minute
hold blocks a slot while a customer checks out, and releases it automatically if they don't
complete the booking in time. Staff/admin manage pricing, operating hours, photos, and
bookings.

## Stack

- Next.js (App Router, TypeScript) — single app for the customer site, admin panel, and API
- PostgreSQL (via Prisma) — courts, bookings, payments
- Redis — the 5-minute slot hold (atomic `SET NX EX 300` lock)
- NextAuth (Credentials) — roles: `CUSTOMER`, `STAFF`, `ADMIN`
- Razorpay — full payment, partial (deposit) payment, or pay-at-venue

## Local setup

Everything — Postgres, Redis, and the app itself — runs through Docker (via
[OrbStack](https://orbstack.dev)); you don't need Node/pnpm on the host at all.

```bash
cp .env.example .env                               # fill in Razorpay keys when you have them
docker compose up -d --build                       # starts Postgres, Redis, and the app (hot-reloading)
docker compose run --rm app pnpm prisma migrate dev --name init   # first time only: creates the schema
docker compose run --rm app pnpm db:seed            # creates an admin + staff login and two sample courts
```

The app is at [http://localhost:3000](http://localhost:3000). Source files are bind-mounted into
the `app` container, so edits on the host hot-reload inside it — no rebuild needed for code changes
(only `docker compose up --build` again after changing `package.json` or the `Dockerfile`).

After the first migration, future schema changes use the same pattern:
`docker compose run --rm app pnpm prisma migrate dev --name <description>`.

If you'd rather run the app on the host with Node/pnpm directly (Docker only for Postgres/Redis),
use `docker compose up -d postgres redis`, keep `.env`'s `DATABASE_URL`/`REDIS_URL` pointed at
`localhost`, and run `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` as usual.

Seeded logins (from `pnpm db:seed`):

- Admin: `admin@turf.local` / `admin1234`
- Staff: `staff@turf.local` / `staff1234`

Customers sign up from `/register`.

## Razorpay

Online payments need real keys in `.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`NEXT_PUBLIC_RAZORPAY_KEY_ID` (same as `RAZORPAY_KEY_ID`), and `RAZORPAY_WEBHOOK_SECRET`
(set when configuring the webhook endpoint at `/api/webhooks/razorpay` in the Razorpay
dashboard). Until those are set, the "pay at venue" flow still works end-to-end.

## Deploying for a new client (white-label)

This app is deployed fresh per turf-owner client (one Vercel project + Neon database +
Upstash Redis each), not as a shared multi-tenant SaaS. See **[DEPLOYMENT.md](DEPLOYMENT.md)**
for the full runbook. The local Docker setup above is for development only — it's not how
clients' sites actually run in production.

## Email

Transactional email (password reset, booking confirmations) goes through
[Resend](https://resend.com) (`src/lib/email.ts`). Without `RESEND_API_KEY` set, emails are
logged to the console instead — useful for local dev, not a substitute for configuring it
before a client goes live.

## Security notes

- Rate limited (Redis-backed, `src/lib/rate-limit.ts`): login (by IP and by email), signup,
  booking holds, and payment-order creation.
- Uploaded images are validated by sniffing actual file bytes (`file-type`), not the
  client-supplied MIME header.
- Court photo uploads go to Vercel Blob in production (`src/lib/storage.ts`), falling back to
  local disk only when `BLOB_READ_WRITE_TOKEN` is unset (local dev) — Vercel's filesystem is
  read-only at runtime, so local-disk writes silently don't work there.
- Security headers + a CSP are set in `next.config.ts`.
- Admin/staff mutations (pricing, hours, staff accounts, blocked slots, staff-initiated
  cancellations) are written to an audit log, viewable at `/admin/audit-log` (admin only).
- `src/middleware.ts` runs on the Node.js runtime, not Edge — it has to, since the session's
  role re-check queries Postgres via Prisma, which Edge can't run. Keep that in mind if you
  ever touch the `jwt`/`session` callbacks in `src/lib/auth.ts`.

## How the 5-minute slot hold works

1. A customer picks a slot → `POST /api/bookings/hold` tries `SET lock:<court>:<date>:<time> <bookingId> NX EX 300`
   on Redis. Only one request can win this atomically, which is what prevents two customers
   double-booking the same slot in a race.
2. On success, a `Booking` row is created with `status = HOLD` and a 5-minute `expiresAt`. The
   checkout page shows a live countdown.
3. If the customer completes payment or confirms pay-at-venue, the booking becomes
   `CONFIRMED`/`PARTIALLY_PAID` and the Redis lock is deleted — the slot is now blocked
   permanently by that status instead of the temporary lock.
4. If they don't, Redis's own TTL removes the lock after 5 minutes with no extra process
   needed, and the slot becomes bookable again. The stale `HOLD` row is lazily marked
   `EXPIRED` the next time anyone checks that court/date's availability.

See `src/lib/availability.ts` and `src/lib/redis.ts` for the implementation.
