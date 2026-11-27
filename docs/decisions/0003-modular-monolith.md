# ADR-0003: Modular Monolith for `apps/api`, Not Microservices

Status: Accepted
Date: 2026-11-27 (content updated same day following [ADR-0005](0005-nextjs-only-stack.md) — `apps/api` is a headless Next.js app, not NestJS; the decision below is unchanged, only the enforcement mechanism)

## Context
The brief lists 22 backend modules (auth, users, roles, ..., health) and asks for clean module boundaries. It does not ask for microservices, but the module list is large enough that the question is worth deciding explicitly rather than drifting into either extreme.

## Decision
One backend application (`apps/api`), internally organized into strictly-bounded modules — one folder per domain (`apps/api/modules/<domain>/`, outside the routable `app/` tree), each owning its own service functions and zod schemas, called by thin route handlers under `app/api/v1/<domain>/.../route.ts`, with cross-module access only through a module's exported public functions. Background processing is already split out as a separate deployable (`apps/worker`), which is the one piece of the system that genuinely benefits from independent scaling today.

## Rationale
- The hardest correctness requirement (no double-booking) is fundamentally a single-database-transaction problem (see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md)). Splitting `booking-holds` and `bookings` into separate services would force a distributed transaction/saga for no real benefit at this product's scale.
- A folder-per-domain convention, with an ESLint import-boundary rule enforced in CI (one module's service file may not import another module's internals, only its exported functions), gives most of the organizational benefit a framework-level module system would give — enforced boundaries, independent testability — without the operational cost of N deployables, N sets of infra, and distributed tracing/debugging overhead. (`apps/api` runs on Next.js, which has no DI/module container of its own — see [ADR-0005](0005-nextjs-only-stack.md) for why the enforcement mechanism is a lint rule rather than a compiler/framework guarantee.)
- A modular monolith with clean internal boundaries can be extracted into services later, module by module, if a specific module's load profile ever demands it (most likely candidate: `media`/image-processing, already partially isolated into `apps/worker`).

## Consequences
- All modules share one Postgres connection pool and one deploy unit for `apps/api` — a bug in one module can, in the worst case, affect API availability for all modules (mitigated by a shared error-handling convention in every route handler, health checks, and horizontal scaling of stateless, long-running Node containers — see [ADR-0005](0005-nextjs-only-stack.md) on why these must not be serverless/Edge instances).
- `apps/worker` already proves out the "split what actually needs to scale independently" pattern, so this isn't an all-or-nothing monolith decision — it's a decision to default to one service and only split when there's a concrete, demonstrated reason.
