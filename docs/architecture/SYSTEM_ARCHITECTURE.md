# System Architecture

Status: Draft for review — Phase 1
Related: [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) · [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)

---

## 1. High-Level Component Diagram

```
                                   ┌─────────────────────────┐
                                   │        End Users        │
                                   │  Customers / Owner/Staff │
                                   │        / Admins         │
                                   └────────────┬─────────────┘
                                                │ HTTPS
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                               │                               │
        ┌────────▼────────┐            ┌────────▼────────┐            ┌────────▼────────┐
        │   apps/web       │            │ apps/dashboard   │            │   apps/admin     │
        │ Next.js (public) │            │ Next.js (owner/  │            │ Next.js (admin)  │
        │ dynamic hostname │            │ staff)           │            │                  │
        │ resolution       │            │                  │            │                  │
        └────────┬────────┘            └────────┬────────┘            └────────┬────────┘
                 │   REST (JSON, /api/v1)         │                               │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │
                                   ┌────────────▼────────────┐
                                   │        apps/api          │
                                   │  Next.js (headless —     │
                                   │  Route Handlers only,    │
                                   │  no pages/UI)            │
                                   │  route.ts → service fns  │
                                   │  → Prisma                 │
                                   │  withAuth/withPermission/ │
                                   │  withLocationScope wrappers,│
                                   │  rate-limit middleware     │
                                   └──┬───────────┬───────────┘
                                      │           │
                   ┌──────────────────┘           └──────────────────┐
                   │                                                 │
          ┌────────▼─────────┐                             ┌────────▼─────────┐
          │   PostgreSQL      │                             │      Redis        │
          │  (source of truth)│                             │ cache + BullMQ    │
          │  Prisma ORM        │                             │ queues + session  │
          │  Exclusion         │                             │ rate-limit store  │
          │  constraints for   │                             └────────┬─────────┘
          │  hold/booking      │                                      │
          │  overlap safety    │                             ┌────────▼─────────┐
          └────────────────────┘                             │   apps/worker     │
                                                               │  BullMQ consumers │
                   ┌──────────────────────────────────────────┤  - hold expiry    │
                   │                                           │  - notifications  │
          ┌────────▼─────────┐                                │  - image processing│
          │  S3 / Cloudflare R2│                               │  - domain verify  │
          │  media storage      │◄──────────────────────────────┤  - scheduled reports│
          └─────────────────────┘                               └────────┬─────────┘
                                                                         │
                                               ┌─────────────────────────┼─────────────────────────┐
                                               │                         │                         │
                                     ┌─────────▼─────────┐   ┌───────────▼──────────┐   ┌───────────▼──────────┐
                                     │     Razorpay        │   │     WhatsApp API      │   │   Email Provider      │
                                     │ Orders/Webhooks/     │   │  (notifications)      │   │  (transactional)      │
                                     │ Refunds              │   └───────────────────────┘   └────────────────────────┘
                                     └──────────────────────┘
```

**Pattern**: `apps/api` is a **headless Next.js app used purely as a backend** — it has no pages, no UI, nothing under it is ever rendered to a browser; its `app/api/v1/**/route.ts` tree is the entire application. It is a **modular monolith** (not microservices) for v1: one deployable, one Postgres connection pool, organized internally into per-domain folders (own route handlers, service functions, zod schemas, tests per module — see §2), which keeps a future extraction to separate services possible without a full rewrite, while avoiding distributed-transaction complexity for a system whose core correctness requirement (no double-booking) is much easier to guarantee inside one database/transaction boundary. `apps/web`, `apps/dashboard`, and `apps/admin` are ordinary (non-headless) Next.js apps — they render UI and call `apps/api` over HTTP exactly like they would call any REST backend; they never import Prisma or `apps/api`'s service functions directly, which is what keeps "frontends talk to the backend only through the API" true as a hard boundary (enforced by these being separate deployables/packages, not just a convention).

---

## 2. Monorepo Folder Structure

```
turf/
├── apps/
│   ├── web/                     # Next.js — customer-facing public website
│   │   ├── app/
│   │   │   ├── (marketing)/           # home, about, contact, legal
│   │   │   ├── locations/[slug]/
│   │   │   │   └── courts/[courtSlug]/book/
│   │   │   ├── checkout/[holdId]/
│   │   │   ├── bookings/[bookingId]/confirmation/
│   │   │   ├── account/(auth)/login|register/
│   │   │   ├── account/bookings/
│   │   │   └── api/revalidate/        # on-demand ISR hook for website-builder publishes
│   │   ├── middleware.ts              # hostname → business/website resolution
│   │   ├── lib/
│   │   └── public/
│   │
│   ├── dashboard/               # Next.js — owner & staff dashboard
│   │   └── app/
│   │       ├── (auth)/login/
│   │       └── (protected)/
│   │           ├── overview/
│   │           ├── calendar/
│   │           ├── locations/[id]/
│   │           ├── courts/[id]/
│   │           ├── pricing/
│   │           ├── bookings/
│   │           ├── customers/
│   │           ├── payments/
│   │           ├── refunds/
│   │           ├── coupons/
│   │           ├── staff/
│   │           ├── reports/
│   │           ├── website-builder/
│   │           ├── domains/
│   │           └── settings/
│   │
│   ├── admin/                   # Next.js — administrative dashboard
│   │   └── app/(protected)/
│   │       ├── business/
│   │       ├── users-roles/
│   │       ├── locations-overview/
│   │       ├── bookings-overview/
│   │       ├── payments-overview/
│   │       ├── refunds/
│   │       ├── audit-logs/
│   │       ├── notifications/
│   │       └── system-health/
│   │
│   ├── api/                     # Next.js — HEADLESS backend (Route Handlers only, no pages)
│   │   ├── app/
│   │   │   └── api/v1/
│   │   │       ├── auth/
│   │   │       │   ├── login/route.ts
│   │   │       │   ├── refresh/route.ts
│   │   │       │   └── customer/{login,register,guest-session}/route.ts
│   │   │       ├── users/[[...segments]]/route.ts        # or one route.ts per concrete path, per module
│   │   │       ├── roles/route.ts
│   │   │       ├── permissions/route.ts
│   │   │       ├── business/route.ts
│   │   │       ├── locations/[id]/route.ts
│   │   │       ├── courts/[id]/route.ts
│   │   │       ├── sports/route.ts
│   │   │       ├── amenities/route.ts
│   │   │       ├── media/route.ts
│   │   │       ├── pricing/route.ts
│   │   │       ├── availability/route.ts
│   │   │       ├── booking-holds/route.ts
│   │   │       ├── bookings/route.ts
│   │   │       ├── customers/route.ts
│   │   │       ├── payments/route.ts
│   │   │       ├── refunds/route.ts
│   │   │       ├── coupons/route.ts
│   │   │       ├── website/route.ts
│   │   │       ├── domains/route.ts
│   │   │       ├── notifications/route.ts
│   │   │       ├── reports/route.ts
│   │   │       ├── audit-logs/route.ts
│   │   │       └── health/route.ts
│   │   ├── modules/                       # business logic lives HERE, not in route.ts files
│   │   │   ├── auth/{service,guards}.ts
│   │   │   ├── locations/service.ts
│   │   │   ├── booking-holds/service.ts     # the concurrency-critical module
│   │   │   ├── bookings/service.ts
│   │   │   ├── pricing/service.ts
│   │   │   ├── payments/{service,webhook-handler}.ts
│   │   │   └── ... one folder per module in the list above
│   │   ├── lib/
│   │   │   ├── auth/                      # withAuth(), withPermission(), withLocationScope()
│   │   │   │                              #   higher-order functions wrapping route handlers —
│   │   │   │                              #   the Next.js equivalent of NestJS guards
│   │   │   ├── validation/                # zod-parse helper + shared schemas from packages/validations
│   │   │   ├── response.ts                # response-envelope + error-mapping helpers
│   │   │   ├── rate-limit.ts              # Redis-backed limiter, called explicitly inside handlers
│   │   │   └── openapi/                   # zod-to-openapi registry + /api/docs generator
│   │   ├── middleware.ts                   # request-id, CORS, (NOT auth — auth is per-route via lib/auth)
│   │   ├── next.config.js                  # output: 'standalone'; forces Node.js runtime (not Edge)
│   │   └── test/                           # integration + e2e tests (incl. concurrency tests, §10 of
│   │                                        # TEMPORARY_SLOT_LOCKING.md)
│   │
│   └── worker/                  # BullMQ job processors (shares @turf/database)
│       └── src/
│           ├── processors/
│           │   ├── hold-expiry.processor.ts
│           │   ├── booking-reminder.processor.ts
│           │   ├── notification.processor.ts
│           │   ├── payment-receipt.processor.ts
│           │   ├── refund.processor.ts
│           │   ├── image-processing.processor.ts
│           │   ├── domain-verification.processor.ts
│           │   └── scheduled-report.processor.ts
│           └── main.ts
│
├── packages/
│   ├── ui/                      # shared shadcn/ui-based component library
│   ├── types/                   # shared TS types (API DTOs, enums)
│   ├── validations/             # shared zod schemas (frontend + backend DTO validation)
│   ├── api-client/               # typed fetch client + TanStack Query hooks, generated from OpenAPI
│   ├── config/                   # shared eslint/tsconfig/tailwind config
│   └── database/                 # Prisma schema, migrations, seed scripts, generated client
│
├── infrastructure/
│   ├── docker/                   # Dockerfiles per app, docker-compose for local dev
│   ├── nginx/                    # reverse proxy config, hostname routing for custom domains
│   ├── deployment/                # IaC / deploy manifests
│   └── monitoring/                 # Prometheus/Grafana or equivalent config, alert rules
│
├── docs/
│   ├── architecture/
│   ├── database/
│   ├── api/
│   ├── workflows/
│   └── decisions/                 # ADRs
│
├── .github/workflows/              # CI: lint, typecheck, test, build, deploy
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. Why a Modular Monolith, Not Microservices (ADR summary)

- The single hardest correctness requirement (no overlapping holds/bookings) is a single-database transactional problem. Splitting booking-holds and bookings into separate services would force a distributed transaction or a saga, adding failure modes for no real scaling benefit at this product's expected load.
- `apps/api` has no framework-level module system (Next.js doesn't have NestJS-style DI modules), so the boundary is enforced by **folder convention + lint rule**, not the compiler: each domain's logic lives under `apps/api/modules/<domain>/` (deliberately kept outside the routable `app/` tree, so business logic can never itself become an accidental route), route handlers under `app/api/v1/<domain>/.../route.ts` are the only files allowed to import a given module's service functions from outside that module, and an ESLint import-boundary rule (`eslint-plugin-boundaries` or an equivalent custom rule) fails CI if one module's service file imports another module's internals directly instead of through its exported public functions. This gives most of the "can be extracted later" benefit NestJS's module system would have given, enforced in CI rather than by the compiler.
- `apps/worker` is already a separate deployable process from day one (not in-process `setInterval` jobs, and not a Next.js app at all — see §2 note below), so the one place that *does* need independent scaling/isolation (background jobs) already has it.

**Why `apps/worker` is plain Node.js/TypeScript, not Next.js**: BullMQ consumers are long-running processes that poll/consume a queue — there is no "request" for a Next.js Route Handler to respond to, and no benefit to carrying Next.js's build/runtime machinery into a process that never serves HTTP. `apps/worker` is a standalone TS project that imports `packages/database` (Prisma) and `packages/validations` exactly like `apps/api` does, just without any web framework at all. "Next.js for frontend and backend" is read here as: the HTTP-serving backend (`apps/api`) and the three UI apps are Next.js; the queue-consuming worker is backend *infrastructure*, not an HTTP backend, and stays framework-agnostic Node.

See [docs/decisions/0002-single-tenant-vs-multi-tenant.md](../decisions/0002-single-tenant-vs-multi-tenant.md) and [0003-modular-monolith.md](../decisions/0003-modular-monolith.md).

---

## 4. Request Flow Examples

### 4.1 Public availability read
`apps/web` → `GET /api/v1/availability?courtId=&date=` → `AvailabilityService` → checks Redis cache (key: `avail:{courtId}:{date}`, TTL short, e.g. 15–30s) → on miss, queries Postgres (operating hours, blocks, active holds, bookings) → writes cache → returns slot grid. Cache is **actively invalidated** on hold-create/release/convert and booking create/cancel for that `(courtId, date)` key, not just left to expire, so the 15–30s TTL is a safety net, not the primary consistency mechanism.

### 4.2 Hold creation (the critical path)
See [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) for full detail. Summary: single DB transaction, protected by a Postgres exclusion constraint on `(court_id, time range)` for ACTIVE holds + CONFIRMED/PENDING bookings, with a BullMQ delayed job scheduled for `expiresAt` as a cleanup safety net (DB state, not the job, is authoritative).

### 4.3 Payment webhook
Razorpay → `POST /api/v1/payments/webhook/razorpay` (public, signature-verified) → signature check → look up `PaymentTransaction` by Razorpay event/payment id (idempotency) → if already processed, 200 OK no-op → else, atomic transaction: update `Payment`/`PaymentTransaction`, attempt hold→booking conversion per the state-verification rules in [PAYMENT_LIFECYCLE.md](../workflows/PAYMENT_LIFECYCLE.md) → enqueue receipt/notification job.

### 4.4 Dynamic website resolution
Incoming request to `apps/web` → Next.js middleware reads `Host` header → looks up `Domain` (cache-first, Redis key `domain:{hostname}` → `businessId`/`websiteId`) → on cache miss, calls API `GET /api/v1/domains/resolve?hostname=` → sets a request-scoped context (business + **published** `Website` config) → page renders from that config. Draft/unpublished edits are never read on this path (see [WEBSITE_BUILDER.md](WEBSITE_BUILDER.md)).

---

## 5. Cross-Cutting Backend Conventions

- **Route handlers are thin**: a `route.ts` file parses the request with a zod schema from `packages/validations`, wraps itself in the needed `withAuth`/`withPermission`/`withLocationScope` higher-order functions (composed, e.g. `export const POST = withAuth(withPermission('booking:create')(handler))`), calls exactly one module service function, and maps the result through the shared `lib/response.ts` envelope helper. No business logic and no direct Prisma import inside a `route.ts` file — Prisma is only imported inside `modules/*/service.ts` files, enforced by the same import-boundary lint rule as §3.
- **Response envelope**: `{ data, meta?, error? }` consistently; list endpoints use `{ data: T[], meta: { page, pageSize, total } }`.
- **Transactions**: any multi-table write that must be atomic uses `prisma.$transaction` (interactive transactions where ordering/row-locking matters, e.g. hold creation, hold→booking conversion, payment confirmation).
- **Idempotency**: client-supplied `Idempotency-Key` header supported on hold-creation and payment-initiation endpoints; server stores a short-lived `(key → response)` record (Redis, with Postgres fallback table for anything that must survive Redis loss) to return the same result on retry instead of double-creating.
- **Soft deletes**: `deletedAt` timestamp columns on Customer, Media, Coupon, Location, Court — never a hard `DELETE` on anything with booking/financial history.

---

## 6. Caching Strategy

| Data | Cache | TTL / invalidation |
|---|---|---|
| Availability slot grid | Redis | 15–30s TTL + explicit invalidation on hold/booking mutation |
| Published website config | Redis (+ Next.js ISR at the edge) | Invalidated explicitly on "Publish" action; draft never cached under the public key |
| Domain → business resolution | Redis | Invalidated on domain verify/activate/remove |
| Pricing rule resolution for a (court, date) | In-request memoization only (not cross-request cached) — pricing must always reflect the latest rules; the **result charged** is what gets snapshotted, not the rule itself |
| Permission checks | Not cached beyond request lifecycle — RBAC reads are cheap, indexed joins |

Redis is **never** the source of truth for booking/hold state — it is a cache and a job queue. If Redis is unavailable, availability reads fall back to Postgres (slower, but correct) and hold expiry falls back to a periodic DB sweep job (see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §"Redis-down fallback").

---

## 7. API Module Breakdown

See [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) for the full endpoint list. Module-to-domain mapping matches §15 of the brief 1:1 (auth, users, roles, permissions, business, locations, courts, sports, amenities, media, pricing, availability, booking-holds, bookings, customers, payments, refunds, coupons, website, domains, notifications, reports, audit, health).

---

## 8. Security Architecture

| Concern | Approach |
|---|---|
| Authentication | JWT access token (short-lived, 15 min) + refresh token (httpOnly, secure, SameSite=Lax cookie, rotated on every use, reuse detection revokes the whole session family) |
| Password storage | bcrypt/argon2id, never reversible encryption |
| RBAC | Enforced by `withPermission()`/`withLocationScope()` wrapper functions composed around every protected `route.ts` handler (`lib/auth/`); the permission/location check runs and can short-circuit with 403 before the handler body executes, same ordering guarantee a NestJS guard would give, just expressed as function composition instead of a decorator. A lint rule flags any exported `GET`/`POST`/etc. in `app/api/v1/**` that isn't wrapped by at least `withAuth` or explicitly marked `withPublic()`, so "no wrapper present" fails CI instead of silently defaulting to open. |
| Rate limiting | Redis-backed, per-IP and per-account, stricter limits on auth endpoints, hold-creation, and payment-initiation; applied via an explicit `checkRateLimit()` call at the top of the relevant handlers (not Next.js edge middleware, since the limiter needs the same Redis client the rest of the app uses, and rate-limited routes need the Node.js runtime anyway — see §10) |
| Input validation | zod schemas from `packages/validations` parsed at the top of each route handler (`schema.parse(await req.json())`); the same schemas are imported by the frontend apps' React Hook Form resolvers, so shape is defined exactly once and only the validation *call site* differs between server and client |
| Upload validation | Signed-URL issuance checks declared MIME/size; a post-upload worker job re-validates actual bytes (magic-number sniffing) before marking `Media` as ready |
| Webhook security | Razorpay webhook signature verified with the webhook secret before any processing; replayed/duplicate event ids rejected idempotently |
| Website content | Section content is structured JSON rendered through fixed, audited React components — never raw HTML/script injection; any "custom HTML" field (if ever added) would be sanitized server-side with an allowlist, and is **not** included in v1 |
| Domain resolution | Hostname → business lookup is a strict allowlist join (verified `Domain` rows only); unverified/unknown hostnames never resolve to any business data |
| CORS | Explicit allowlist of the three app origins (+ any verified custom domains for `apps/web` only) |
| Headers | HSTS, X-Content-Type-Options, X-Frame-Options/Frame-ancestors, CSP (scoped to allow the specific CDN/Razorpay script origins needed) |
| Secrets | Never in Postgres; env/secret-manager only; Razorpay keys, JWT signing keys, S3/R2 credentials, WhatsApp/email provider keys |
| PCI scope | No card data ever touches our servers — Razorpay Checkout/hosted flow only |
| Audit logging | Every staff/admin mutating action logged with actor, before/after, IP, user agent |

---

## 9. Concurrency Strategy Summary

Full detail in [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md). Headline decisions:

1. **Database is the lock.** A PostgreSQL exclusion constraint using the `btree_gist` extension over `(court_id, tstzrange(start_at, end_at))` WHERE status is active-equivalent (ACTIVE hold or PENDING/CONFIRMED booking) makes overlapping reservations physically impossible to insert, independent of application bugs or multiple API instances.
2. **Redis/BullMQ is an optimization, not a guarantee.** Delayed jobs expire holds proactively for good UX, but every read of "is this slot free" also filters by `expires_at > now()` in SQL, so a late/missed job can never cause a false "unavailable."
3. **Idempotency keys** prevent double-submission from retries/double-clicks from creating two holds or two payment attempts.
4. **Payment confirmation re-validates everything** inside one transaction (hold still valid/owned by this payer, no conflicting booking exists) before flipping status — see Payment Lifecycle doc for the exact race-condition handling.

---

## 10. Deployment Topology (target, Phase 12)

- `apps/web`, `apps/dashboard`, `apps/admin`: deployed as separate Next.js services (can share infra but are independently deployable/scalable; `apps/web` needs multi-tenant-hostname-aware caching/ISR, the other two don't).
- `apps/api`: built with `next build` using `output: 'standalone'` and run with `next start` (or the standalone server it produces) as horizontally scalable, **long-running Node.js containers** — explicitly **not** deployed as Vercel Edge Functions or any serverless/Lambda-style FaaS target. This is a deliberate constraint, not a default: hold creation and payment-confirmation rely on `prisma.$transaction` with `SELECT ... FOR UPDATE` row locking held for the duration of a multi-statement transaction (see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §2–3), which needs a stable connection from a long-lived pool; serverless functions' per-invocation connection churn (and, on platforms like Vercel, the Edge runtime's lack of raw TCP/Prisma support at all) would fight that model. Every route handler also explicitly sets `export const runtime = 'nodejs'` so no route can accidentally be scheduled onto an Edge runtime by a future Next.js default change.
- `apps/worker`: separately scaled BullMQ consumer pool (plain Node.js, not Next.js — see §3); can scale independently of API traffic.
- Postgres: managed instance with automated backups, PITR; connection pooling via PgBouncer (or the managed provider's equivalent) in front of `apps/api`'s pool, sized for the number of concurrent Node containers; read replica considered post-v1 if reporting load requires it.
- Redis: managed instance, persistence enabled (AOF) so queued delayed jobs survive a restart (defense in depth — DB sweep remains the real backstop).
- Nginx/ingress: terminates TLS, routes by `Host` header (needed for custom-domain support on `apps/web`), proxies `/api/v1/*` calls from the three frontend apps to `apps/api`'s origin, and proxies page requests to the matching frontend app's origin.
- CI/CD: GitHub Actions — lint → typecheck → unit tests → integration tests (spin up ephemeral Postgres+Redis via service containers) → build → deploy on merge to main, with a required-checks branch protection rule.
