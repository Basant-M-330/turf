# Implementation Roadmap

Status: Draft for review — Phase 1
Related: all documents in `docs/architecture`, `docs/database`, `docs/api`, `docs/workflows`

This roadmap follows the 12 phases specified in the project brief. Each phase lists: scope, key deliverables, dependencies, and acceptance criteria. No phase after Phase 1 begins until its predecessor's acceptance criteria are met and documentation is updated, per the brief's workflow rules (§21).

---

## Phase 1 — Architecture and Repository Setup *(this phase)*

**Scope**: Planning only, no application code.

**Deliverables**: the 10 documents in this planning set, monorepo folder structure (documented, not yet scaffolded with real packages beyond empty directories/config stubs), pnpm/Turborepo config skeleton.

**Acceptance criteria**:
- [ ] All 10 documents exist and are internally consistent (cross-references resolve, no contradicting field names between ENTITY_RELATIONSHIPS/DATABASE_SCHEMA_PLAN/API_SPECIFICATION).
- [ ] Open product questions (PRD §7) and architecture review findings (ADR-0001) are explicitly listed, not silently assumed.
- [ ] Owner/stakeholder sign-off recorded before Phase 2 begins.

---

## Phase 2 — Database Schema and Authentication

**Scope**: Implement the Prisma schema from DATABASE_SCHEMA_PLAN.md (all tables except those only needed by later phases can be stubbed, but core identity/location/court/booking/payment tables must be real); implement `auth` module (JWT, refresh rotation, password hashing) for both `User` and `Customer` principal types; implement `roles`/`permissions`/`users` modules with the `withPermission`/`withLocationScope` wrapper functions (see [ADR-0005](../decisions/0005-nextjs-only-stack.md)).

**Key deliverables**:
- `packages/database` Prisma schema + initial migration, including the two exclusion constraints (hand-edited migration SQL per DATABASE_SCHEMA_PLAN §11).
- Seed script (fixed roles/permissions, starter sports/amenities).
- `apps/api` auth module: login/register/refresh/logout for both principal types, guest-session issuance.
- RBAC wrapper functions (`withPermission`, `withLocationScope`) with unit tests.

**Dependencies**: Phase 1 sign-off.

**Acceptance criteria**:
- [ ] `prisma migrate deploy` succeeds against a clean Postgres instance; exclusion constraints verified present via `\d booking_holds`/`\d bookings`.
- [ ] Integration test: concurrent duplicate hold inserts against the raw table (before any service layer exists) are rejected by the constraint — proves the DB-level guarantee independent of application code, ahead of Phase 5.
- [ ] Auth flow tests: login, refresh rotation + reuse detection, logout revocation, RBAC guard denies an unauthorized role/location combination (seeded test fixtures).
- [ ] Swagger docs render for all implemented endpoints.
- [ ] Lint + typecheck clean across the monorepo.

---

## Phase 3 — Business, Locations, and Court Management

**Scope**: `business`, `locations`, `courts`, `sports`, `amenities`, `media` modules, full CRUD + location-scoped authorization, operating-hours resolution logic, image upload pipeline (signed URL → confirm → processing job).

**Acceptance criteria**:
- [ ] Owner can create a Location with nested OperatingHours and at least one Court with its own OperatingHours override; GET reflects correct effective-hours resolution (location-inherit vs court-override cases both unit-tested, including the overnight-range case from DATABASE_SCHEMA_PLAN §2).
- [ ] A Location Manager scoped to Location A cannot read/write Location B's courts (403, tested).
- [ ] Media upload: invalid MIME/oversized file rejected before signed URL issuance; a tampered-content-type upload is caught by the post-upload processing job (magic-number check), not just trusted at request time.
- [ ] Gallery reorder and soft-delete work and are reflected in subsequent GETs.
- [ ] No sport or court count is hardcoded anywhere in this phase's code (spot-checked in review — e.g., no `switch` on a sport name literal in availability/pricing logic introduced this early).

---

## Phase 4 — Pricing and Availability Engine

**Scope**: `pricing` and `availability` modules — PricingRule/SpecialDate/Coupon CRUD, the pricing-resolution algorithm (API_SPECIFICATION §Pricing), the availability slot-grid computation, Redis caching with explicit invalidation hooks (even though hold/booking mutation isn't built until Phase 5/6 — invalidation hooks are stubbed/wired now and exercised fully once those phases land).

**Acceptance criteria**:
- [ ] Pricing resolution unit tests cover every tier-precedence case in the algorithm (special date beats holiday beats peak beats weekend beats weekday beats base; priority tie-break; coupon stacking with min/max caps).
- [ ] Availability endpoint returns correct slot grids against seeded CourtBlock/OperatingHours fixtures, including an overnight-hours court.
- [ ] Availability p95 latency measured against a seeded dataset meets the target in PRODUCT_REQUIREMENTS §5 (warm cache) — recorded, not just assumed.
- [ ] Changing a PricingRule does not alter any previously-stored `pricingSnapshot` (requires at least a manual/walk-in booking path or a test-only booking fixture to exist by this point — if Phase 6 hasn't landed yet, this is verified against a minimal test harness that directly snapshots a quote, not a full booking).

---

## Phase 5 — Temporary Booking Locking System

**Scope**: `booking-holds` module exactly as specified in [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md): hold creation transaction, cross-table conflict check with row locking, reservation-token recovery endpoint, BullMQ expiry job + DB sweep cron, idempotency key handling, Redis-down fallback paths.

**Acceptance criteria** (these map directly to the brief's "Critical tests" #1–#3, #6, #7, #9):
- [ ] All 10 concurrency integration tests in TEMPORARY_SLOT_LOCKING §10 pass against a real Postgres+Redis instance in CI (service containers), including the N=50 concurrent hold test.
- [ ] Hold expiry verified correct under three conditions: BullMQ healthy, BullMQ job deliberately dropped (simulating a missed job — lazy expiry still correct), Redis entirely stopped (DB sweep cron still correct).
- [ ] Reservation-token recovery works after a simulated page refresh (new HTTP session, same token).
- [ ] Load test: 100 concurrent hold attempts across 20 distinct courts complete without constraint-contention-driven failures beyond the expected per-court conflicts (recorded latency distribution, not just pass/fail).

---

## Phase 6 — Booking Lifecycle

**Scope**: `bookings` module per [BOOKING_LIFECYCLE.md](../workflows/BOOKING_LIFECYCLE.md): hold-to-booking conversion (pay-at-venue path fully live; online-payment path stubbed until Phase 7 provides real Razorpay capture, but the transaction shape and state transitions are implemented and tested with a fake/mock payment capture signal), approval workflows, cancellation/reschedule, walk-in creation, check-in/complete/no-show, `BookingStatusHistory` audit trail.

**Acceptance criteria**:
- [ ] Full state diagram in BOOKING_LIFECYCLE.md is covered by tests for every transition and at least one invalid-transition-rejected case per state.
- [ ] Reschedule test: original booking untouched when the new-slot hold fails; original cancelled and new booking created atomically when it succeeds; no window where both slots are simultaneously free (brief's critical test #9's spirit, adapted — pricing-change-after-booking is explicitly covered too: an existing CONFIRMED booking's price is unaffected by a subsequent PricingRule edit).
- [ ] Walk-in booking goes through the identical conflict-check transaction as the public flow (proven by a test that races a walk-in against an online hold on the same slot — brief's critical test #1 variant).
- [ ] Location-scope enforcement: a Receptionist without access to Location X cannot create/approve/cancel bookings there (brief's critical test #10).

---

## Phase 7 — Razorpay Payments

**Scope**: `payments`, `refunds` modules per [PAYMENT_LIFECYCLE.md](../workflows/PAYMENT_LIFECYCLE.md): order creation, webhook handler with signature verification + idempotency, full/advance/pay-at-venue flows wired end-to-end with the real Phase 6 booking flow, refund initiation + webhook confirmation, reconciliation queue, balance collection.

**Acceptance criteria** (brief's critical tests #4, #5, #8):
- [ ] Payment succeeding before hold expiry converts correctly end-to-end (hold → booking → payment captured), tested against Razorpay's test-mode webhooks or signed synthetic payloads.
- [ ] Payment succeeding after hold expiry/reassignment is caught by the reconciliation path — no duplicate booking, flag set, admin notified — verified with a direct DB query for overlapping active bookings.
- [ ] Duplicate webhook delivery (same event id, replayed) is a verified no-op (single `PaymentTransaction`, no double notification sent, no double state transition).
- [ ] Invalid/forged webhook signature is rejected with 400 and does not touch any Payment/Booking row (security test, not just a happy-path test).
- [ ] Partial refund and full refund both tested, including the over-refund-amount rejection case.

---

## Phase 8 — Customer-Facing Website

**Scope**: `apps/web` pages per PRODUCT_REQUIREMENTS §4.1, wired to the real API (locations/courts/availability/checkout/booking confirmation/my-bookings/auth), responsive layouts, countdown UI per TEMPORARY_SLOT_LOCKING §4.

**Acceptance criteria**:
- [ ] Full customer journey (browse → select slot → hold created → countdown visible and server-synced → checkout → payment → confirmation) works end-to-end against Phases 4–7's real backend, for both guest and registered-customer paths.
- [ ] Countdown UI reaching zero correctly disables checkout and prompts a refresh, verified by forcing a hold to expire mid-test.
- [ ] Mobile/tablet/desktop responsive QA pass on the booking flow and My Bookings screen specifically (highest-traffic, highest-risk screens).
- [ ] Accessibility pass (WCAG 2.1 AA) on the booking flow per PRODUCT_REQUIREMENTS §5.

---

## Phase 9 — Website Builder and Domain Support

**Scope**: `website`, `domains` modules + dashboard's Website Builder/Domains screens, per [WEBSITE_BUILDER.md](WEBSITE_BUILDER.md): section editor, theming, draft/publish/preview, subdomain auto-provisioning, custom domain + DNS verification + SSL status, hostname-based resolution wired into `apps/web`'s middleware.

**Acceptance criteria**:
- [ ] Draft edits are confirmed invisible on the public site until Publish is clicked (explicit test: edit a section, hit the public endpoint directly, confirm old content still served; publish; confirm new content now served).
- [ ] Rollback to a prior `WebsiteVersion` works.
- [ ] Custom domain verification flow tested against a real (or test-harness-simulated) DNS TXT lookup; unverified hostnames never resolve to business content (security test).
- [ ] Hostname-based resolution correctly serves different content for the default subdomain vs. a verified custom domain pointed at the same business, and returns a generic not-found for an unrecognized hostname.

---

## Phase 10 — Owner and Staff Dashboard

**Scope**: Remaining `apps/dashboard` screens (calendar, bookings management, customers, payments/refunds UI, coupons, staff, settings) and `apps/admin` screens, wired to all prior-phase APIs.

**Acceptance criteria**:
- [ ] Calendar day/week/month views correctly reflect bookings/holds-in-progress/maintenance blocks across at least 2 locations with overlapping-but-distinct court schedules.
- [ ] Staff walk-in creation, approval workflow, and reschedule-via-drag (which must call the real reschedule endpoint, never a raw date mutation) all function against live data.
- [ ] Admin dashboard's cross-location overview, audit log viewer, and system health screen (queue depth/DLQ/webhook failure rate) reflect real backend state.
- [ ] Full RBAC matrix spot-checked across all dashboard screens for each of the 6 roles (automated where feasible, manual QA checklist otherwise).

---

## Phase 11 — Notifications and Reporting

**Scope**: `notifications`, `reports` modules + worker processors for reminders/receipts/scheduled reports; Email provider + WhatsApp API integration.

**Acceptance criteria**:
- [ ] Each notification trigger in PRODUCT_REQUIREMENTS §3.12 fires correctly and is retried on transient provider failure (verified by forcing a provider error once and confirming retry+eventual success, and confirming a terminal failure is logged/visible, not silently dropped).
- [ ] Booking reminder jobs fire at the configured offsets against seeded future bookings.
- [ ] Revenue/occupancy/funnel/outstanding-dues reports validated against hand-computed expected values on a seeded dataset.
- [ ] Scheduled/heavy reports run as background jobs and are cached, not computed synchronously on dashboard load (verified by response-time comparison and by confirming a cache-hit path exists).

---

## Phase 12 — Testing and Production Deployment

**Scope**: Full test-suite hardening across all layers, Docker images, GitHub Actions CI/CD pipeline, infrastructure (nginx hostname routing, monitoring/alerting), production environment setup, data backup/PITR verification, final security review.

**Acceptance criteria**:
- [ ] All 10 "Critical tests" from the brief's Testing Requirements section pass in CI, consolidated into one documented test report.
- [ ] CI pipeline: lint → typecheck → unit → integration (service containers) → build, required to pass before merge; a staging deploy gate before production.
- [ ] Security review checklist (SYSTEM_ARCHITECTURE §8) walked item-by-item with evidence (not just "looks fine") — including a webhook-signature-forgery test, a JWT-tampering test, and a cross-location-access test.
- [ ] Backup/restore (PITR) rehearsed at least once against a non-production environment.
- [ ] Load test results for the booking-hold path recorded and reviewed against the Phase 5 baseline.
- [ ] Production monitoring dashboards live (queue depth, webhook failure rate, API error rate/latency, DB connection pool).

---

## Milestone Timeline (indicative, not a committed delivery date — to be re-baselined once team size/velocity is known)

| Phase | Depends on | Relative sequencing |
|---|---|---|
| 1 | — | Done first, blocking everything |
| 2 | 1 | Foundation |
| 3 | 2 | |
| 4 | 2, 3 | |
| 5 | 2, 3, 4 | **Highest-risk phase — do not compress** |
| 6 | 5 | |
| 7 | 6 | |
| 8 | 4, 6 (7 for real payments, can stub initially) | Can start UI work in parallel with late Phase 7 |
| 9 | 3 | Can largely parallelize with Phases 5–8 (different module surface) |
| 10 | 3–7 | Needs most backend modules done |
| 11 | 6, 7 | |
| 12 | all | Hardening pass, not new features |

Phases 5 and 7 are flagged as the ones where schedule pressure most often causes real-world double-booking/payment-integrity incidents in systems like this — the roadmap deliberately does not compress their acceptance criteria even under timeline pressure.
