# ADR-0005: Next.js for Both Frontend and Backend (NestJS Dropped)

Status: Accepted
Date: 2026-11-27 — supersedes the backend half of the original brief's technology stack (§2: NestJS + REST + Swagger/OpenAPI)

## Context
The original project brief specified NestJS as the backend framework. The stakeholder has since decided the stack should use Next.js for both frontend and backend, with no separate NestJS service. This ADR records the resulting shape of `apps/api` and what changes (and what doesn't) as a consequence, so the rest of the planning set — written against the NestJS assumption — has one place that explains the substitution rather than each document silently disagreeing with the brief.

## Decision
- `apps/api` becomes a **headless Next.js app**: App Router, but its entire surface is `app/api/v1/**/route.ts` Route Handlers — no pages, no UI, nothing rendered. It remains the **single backend** that `apps/web`, `apps/dashboard`, and `apps/admin` call over HTTP; those three stay separate, ordinary (page-rendering) Next.js apps. This was chosen over the alternative of folding backend logic into each of the three frontend apps' own API routes, specifically to preserve the brief's "keep all business logic in the backend, frontends communicate through the API only" rule without tripling the implementation of RBAC, pricing, booking, and payment logic across three app trees.
- NestJS's framework-provided mechanisms are replaced with plain-TypeScript equivalents:
  | NestJS concept | Next.js replacement |
  |---|---|
  | Controller | `route.ts` exported `GET`/`POST`/`PATCH`/`DELETE` functions |
  | Guard (`@UseGuards`) | Higher-order wrapper functions (`withAuth`, `withPermission`, `withLocationScope`, `withCustomer`, `withPublic`) composed around the exported handler |
  | DTO + `class-validator` | zod schemas from `packages/validations`, parsed explicitly at the top of the handler |
  | Module (DI container, `imports`/`exports`) | Folder convention (`apps/api/modules/<domain>/`, kept outside the routable `app/` tree entirely so business logic is never itself a route) + an ESLint import-boundary rule enforced in CI, since Next.js has no DI container |
  | Interceptor (response envelope) | A shared `lib/response.ts` helper every handler calls explicitly before returning |
  | Exception filter | A shared `lib/response.ts` error-mapping helper, or a `try/catch` convention wrapping each handler |
  | Swagger via decorators (`@ApiTags`, `@ApiOperation`) | `zod-to-openapi` registry entries generated from the same validation schemas, emitted to `openapi.json` by a build script |
  | Pipe (validation) | The same zod `.parse()` call used for the DTO replacement above — one mechanism covers both roles |
- `apps/worker` (BullMQ consumers) stays plain Node.js/TypeScript — it was never NestJS in the original plan either, and there's no reason to make it Next.js now (no HTTP requests to handle; see [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) §3). This is an explicit scope call, not an oversight — flagged so the stakeholder can correct it if "Next.js for backend" was meant to include the worker too.
- `apps/api` must run as a long-lived Node.js process (`next build` with `output: 'standalone'`, then `next start`), never as Vercel Edge Functions or another FaaS/serverless target, and every route explicitly sets `export const runtime = 'nodejs'`. This is the one place the framework swap has a real technical consequence beyond syntax: the booking-hold/payment-confirmation transactions rely on `SELECT ... FOR UPDATE` row locks held across a multi-statement `prisma.$transaction` (see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md)), which needs a stable pooled Postgres connection — the kind of thing serverless's per-invocation connection churn (and Vercel's Edge runtime's lack of a raw TCP driver) actively fights against. NestJS, running as a conventional long-lived server, never raised this question; with Next.js it has to be called out explicitly because "deploy a Next.js app" more commonly implies Vercel's default serverless/Edge targets, which would be the wrong choice here.

## Consequences
- Every other planning document's *data model, API surface, workflow logic, and concurrency guarantees are unchanged* — this ADR is purely a framework substitution at the HTTP-handling layer. [DATABASE_SCHEMA_PLAN.md](../database/DATABASE_SCHEMA_PLAN.md), [ENTITY_RELATIONSHIPS.md](../database/ENTITY_RELATIONSHIPS.md), and all three workflow docs required no changes.
- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) and [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) were updated in place to describe the Next.js Route Handler conventions instead of NestJS's. [ADR-0003](0003-modular-monolith.md) (modular monolith vs. microservices) was updated to describe module boundaries as a lint-enforced folder convention rather than a NestJS/DI-enforced one — the underlying decision (one deployable, not microservices) is unchanged.
- Losing compiler-enforced module boundaries (NestJS's DI graph) in favor of a lint rule is a real, if modest, reduction in how hard it is to accidentally couple two modules together. Mitigated by treating the import-boundary ESLint rule as a required CI check, same severity as a type error.
- OpenAPI generation is no longer "free" from framework decorators — it requires deliberately registering each schema with `zod-to-openapi`, which is additional, explicit work per endpoint rather than an incidental side effect of annotating a NestJS controller. Scheduled as part of each module's implementation checklist in [IMPLEMENTATION_ROADMAP.md](../architecture/IMPLEMENTATION_ROADMAP.md), not deferred to a cleanup pass.
