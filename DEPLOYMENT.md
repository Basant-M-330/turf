# Deploying for a new client

This app is deployed **fresh per turf-owner client** (white-label), not as a shared
multi-tenant SaaS: one Vercel project, one Neon database, one Upstash Redis per client. All
of them point at the same GitHub repo/branch, so a single `git push` to `main` redeploys
every client at once — client differences live entirely in each Vercel project's environment
variables, never in branches or forks.

## 1. Database — Neon

1. Create a new [Neon](https://neon.tech) project for this client.
2. Copy the **pooled** connection string (the one with `-pooler` in the hostname, not the
   direct one) into `DATABASE_URL`. This matters: Vercel's serverless functions open a fresh
   connection per invocation, and without Neon's built-in pooler you'll exhaust Postgres'
   connection limit under any real concurrent traffic.
3. Confirm the project's backup/point-in-time-recovery retention window in Neon's dashboard
   (Settings → Backup). This replaces running your own `pg_dump` cron — Neon handles it.

## 2. Redis — Upstash

1. Create a new [Upstash](https://upstash.com) Redis database for this client (same region
   as the Vercel deployment, to keep the slot-hold lock's latency low).
2. Copy the `rediss://` (TLS) connection string into `REDIS_URL`. `ioredis` (what
   `src/lib/redis.ts` uses) auto-enables TLS from the `rediss://` scheme — no code change
   needed, this is the same client library used in local dev against the Docker Redis.

## 3. File storage — Vercel Blob

Vercel's serverless functions have a read-only, ephemeral filesystem, so the local-dev
behavior of writing uploaded court photos straight to `public/uploads` (`src/lib/storage.ts`)
does not work in production.

1. In the client's Vercel project → Storage → create a **Blob** store, and connect it to the
   project. Vercel sets `BLOB_READ_WRITE_TOKEN` automatically when you do this — you don't
   need to copy it in by hand.
2. That's it: `src/lib/storage.ts` switches to Vercel Blob automatically once that env var is
   present, and falls back to local disk when it's not (local dev).

## 4. The Vercel project

1. Import the repo as a new Vercel project for this client.
2. **Build command**: override it to `pnpm build:vercel` (Project Settings → Build & Development
   Settings). This runs `prisma migrate deploy` before `next build`, so schema changes ship
   automatically with every deploy — don't use the plain `build` script here, it skips
   migrations.
3. Set every environment variable from `.env.example` for this client:
   - `DATABASE_URL`, `REDIS_URL` from steps 1–2.
   - `NEXTAUTH_SECRET` — generate a fresh one per client (`openssl rand -base64 32`), **never**
     reuse one across clients.
   - `NEXTAUTH_URL` — this client's final domain, `https://...`.
   - `BRAND_NAME`, `BRAND_LEGAL_NAME`, `SUPPORT_EMAIL` — this client's branding
     (`src/lib/config.ts`).
   - `MULTI_COURT` — `"true"` only if this client has more than one court.
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`,
     `RAZORPAY_WEBHOOK_SECRET` — this client's own Razorpay account, never shared.
   - `RESEND_API_KEY`, `EMAIL_FROM` — set these before going live; without them, password
     reset and booking-confirmation emails just get logged instead of sent.
4. Deploy. The first deploy's build step creates the schema (via `migrate deploy`).
5. Seed this client's actual venue data. The `prisma/seed.ts` script is a *template* (sample
   court, sample admin/staff logins) — either run it once via `vercel env pull` + a local
   `pnpm db:seed` against the new `DATABASE_URL` and then change the seeded passwords, or set
   up the real court/pricing/photos by hand through `/admin/venue` (or `/admin/courts` in
   multi-court mode) after logging in with a one-off admin account you create directly in Neon.

## 5. Domain + Razorpay webhook

1. Add the client's custom domain in the Vercel project (Settings → Domains) and point their
   DNS at it.
2. In the Razorpay dashboard, set the webhook URL to
   `https://<their-domain>/api/webhooks/razorpay` and copy the webhook secret into
   `RAZORPAY_WEBHOOK_SECRET`.

## Monitoring

Vercel's own dashboard (Deployments → Functions/Logs) covers basic error visibility without
any extra setup. For a client that's actually taking real traffic/payments, wiring up
[Sentry](https://sentry.io) (official Vercel integration, auto-configures itself) is the
natural next step — not done yet, since it needs a real account to verify against.

## Rolling out a fix to every client

Since every client's Vercel project tracks the same repo/branch, merging to `main` triggers a
rebuild on all of them. The CI workflow (`.github/workflows/ci.yml`) runs typecheck, lint, and
a full build on every push/PR — treat a red CI run as a hard stop, since the alternative is a
broken build going out to every client's live site at once.
