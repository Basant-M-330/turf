# Product Requirements Document (PRD)
## Multi-Location Turf Booking and Management Platform

Status: Draft for review — Phase 1 (Planning only, no code written yet)
Owner: Platform/Architecture
Last updated: 2026-11-27

---

## 1. Product Summary

A single business operates one or more turf/sports facilities ("Locations"), each with one or more bookable "Courts" (football, cricket, badminton, etc.). The platform gives that business:

1. A **customer-facing public website** to discover locations/courts and book slots online.
2. An **owner/staff dashboard** to run day-to-day operations (bookings, pricing, staff, reports).
3. An **admin dashboard** for platform-level configuration, RBAC, and oversight.

This is a **single-tenant** product for one business with multiple physical locations — not a multi-tenant SaaS marketplace. (See [Decision ADR-0002](../decisions/0002-single-tenant-vs-multi-tenant.md) for why this matters architecturally, especially for the `Domain`/`Website` model.)

### 1.1 Primary business outcomes
- Centralize management of all locations/courts instead of per-location spreadsheets/registers.
- Convert walk-in-only revenue into a mix of online pre-paid and pay-at-venue bookings.
- Eliminate double-booking of courts through a reliable concurrency-safe slot reservation system.
- Give the owner a self-serve website builder so marketing pages can change without engineering involvement.
- Provide financial visibility: revenue, refunds, outstanding dues, per-location/per-court performance.

### 1.2 Non-goals (explicitly out of scope for v1)
- Multi-business/marketplace mode (other businesses onboarding themselves) — the data model allows for it later (see ADR-0002) but UI/billing for that is not built now.
- Dynamic/surge pricing driven by real-time demand algorithms (only rule-based pricing in v1).
- Native mobile apps (responsive web only in v1).
- Multi-currency / multi-country operation (INR / Asia/Kolkata only in v1, but modeled to extend).
- Loyalty points / subscriptions / membership passes (flagged as a fast-follow, see Roadmap).

---

## 2. Personas and Roles

| Role | Who | Primary goals |
|---|---|---|
| **Owner** | Business owner | Full control: all locations, financials, staff, settings, website, domains |
| **Admin** | Senior staff delegated owner-level access | Same as Owner except cannot change business-level billing/ownership |
| **Location Manager** | Runs one or more specific locations | Manage bookings, pricing, staff, courts *for assigned locations only* |
| **Receptionist** | Front-desk staff at a location | Create walk-in bookings, check-in customers, view schedule, collect pay-at-venue payments |
| **Accountant** | Finance staff | View payments, refunds, reports; no booking/court mutation rights |
| **Customer** | End user booking a court | Browse, book, pay, manage own bookings |

Permissions are **location-scoped** for Location Manager/Receptionist/Accountant (a user can be granted access to a subset of locations). Owner/Admin are global. All of this is enforced server-side (see §4, §15 of the brief, and [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) Authorization section) — the frontend only hides UI, it never is the authority.

---

## 3. Functional Requirements by Module

Each requirement is tagged with an ID used for traceability into the API spec, DB schema, and test plan.

### 3.1 Business & Settings (BIZ)
- BIZ-1: One `Business` record holds name, legal name, currency (default INR), timezone (default Asia/Kolkata), country, support contact, branding defaults.
- BIZ-2: `BusinessSettings` holds operational toggles: booking approval mode (auto vs manual, overridable per-location/court), default hold duration (default 5 min, configurable 1–15 min), cancellation policy text, min advance booking notice, max advance booking window.
- BIZ-3: Staff account creation/deactivation; staff cannot delete themselves; deactivation revokes active sessions.
- BIZ-4: Every mutating admin/staff action is written to `AuditLog` (actor, action, entity, before/after diff, IP, timestamp).

### 3.2 Roles & Permissions (RBAC)
- RBAC-1: Fixed role catalog (Owner, Admin, Location Manager, Receptionist, Accountant, Customer) for v1; `Permission` table is granular (e.g. `booking:create`, `pricing:update`, `refund:approve`) and `Role` is a named bundle of permissions, so bundles can be edited later without a schema change.
- RBAC-2: `UserRole` links a `User` to a `Role`, optionally scoped to one or more `Location`s via `UserLocationAccess`.
- RBAC-3: Every protected endpoint declares required permission(s) via a `withPermission()` wrapper (see [ADR-0005](../decisions/0005-nextjs-only-stack.md)); the same wrapper chain also checks location scope when the resource is location-bound.
- RBAC-4: Customers are a distinct identity space from staff `User`s (see ADR-0003) — a `Customer` is not a `User`/staff account, since customers never need dashboard/admin access, but both share the auth/JWT infrastructure.

### 3.3 Locations & Courts (LOC / CRT)
- LOC-1: Owner/Admin can create unlimited `Location`s with name, unique slug, description, full address + lat/long, contact info, cover image, gallery, amenities, operating hours (per weekday, with overnight-safe time ranges), booking policies (cancellation window, no-show policy), active/inactive flag.
- LOC-2: A `Location` can be deactivated (hidden from public site, blocks new bookings) without deleting history.
- CRT-1: A `Location` has unlimited `Court`s, each with name, `Sport` (FK, not an enum — see §3.4), indoor/outdoor flag, capacity, dimensions, description, gallery, base price, own operating hours (can differ from location's, but must be a subset), maintenance status, active/inactive flag.
- CRT-2: A `Court` can be put into `CourtBlock` (maintenance) for a date/time range, which removes it from availability without deleting the court or its bookings.
- CRT-3: No sport, court count, or location count is hardcoded anywhere in backend logic.

### 3.4 Sports & Amenities (SPT / AMN)
- SPT-1: `Sport` is a managed catalog (name, icon, default slot duration, default slot increment) — football, cricket, badminton, and arbitrary others are just rows.
- AMN-1: `Amenity` is a managed catalog (parking, washroom, floodlights, cafeteria, etc.) attachable to a Location and/or Court via join tables.

### 3.5 Media (MED)
- MED-1: All image upload surfaces (logo, favicon, hero banners, location/court galleries, facility images, promo banners, website page assets) go through one `Media` service: client requests a signed upload URL, uploads directly to S3/R2, then registers metadata (`Media` row: url, key, mime, size, width/height, purpose, owner entity).
- MED-2: Server validates MIME type and size **before** issuing the signed URL and again via a post-upload verification/processing job (never trust client-reported metadata).
- MED-3: Image processing job generates thumbnail + responsive variants; gallery images are reorderable (explicit `sortOrder` column) and deletable (soft delete, async S3 cleanup).
- MED-4: No binary data in Postgres — only metadata and the storage key/URL.

### 3.6 Pricing Engine (PRC)
- PRC-1: `PricingRule` scoped to a Court, with type (BASE, WEEKDAY, WEEKEND, PEAK, OFF_PEAK, SPECIAL_DATE, HOLIDAY), day-of-week set, time range, price per slot-duration-unit, priority, validity date range.
- PRC-2: `SpecialDate` table for one-off date overrides (festival pricing, holiday pricing) that outrank recurring rules.
- PRC-3: Resolution order (highest priority wins; see [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) §Pricing for exact algorithm): Special Date override → Holiday rule → Peak/Off-peak → Weekend → Weekday → Base.
- PRC-4: `Coupon` supports percentage or fixed-amount discount, usage limits (global + per-customer), validity window, min booking amount, applicable sport/location scoping.
- PRC-5: Pricing is **always computed server-side** at hold-creation time and **re-validated** at payment-confirmation time; a `PricingSnapshot` (JSON) is stored on the `Booking` row so later price changes never mutate historical bookings' charged amount.
- PRC-6: All money fields are `DECIMAL(12,2)` (never float); all monetary arithmetic happens in a single pricing service using a decimal-safe library (e.g. `decimal.js`), never native JS floats.

### 3.7 Availability (AVL)
- AVL-1: Given a Court + date, return bookable slots derived from: operating hours ∩ NOT(CourtBlock) ∩ NOT(active BookingHold) ∩ NOT(CONFIRMED/PENDING Booking), sliced by the sport's slot increment.
- AVL-2: Availability reads must be fast (target < 150 ms p95) — see caching strategy in [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) §6.

### 3.8 Booking Holds (HLD) — see dedicated [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md)
- HLD-1 through HLD-10 as specified in the brief; full design in the linked workflow doc.

### 3.9 Bookings (BKG) — see dedicated [BOOKING_LIFECYCLE.md](../workflows/BOOKING_LIFECYCLE.md)
- Booking statuses: HOLD, PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED, EXPIRED, NO_SHOW (state machine fully specified in the linked doc).
- Walk-in bookings skip the hold/public-checkout flow but still go through the same pricing + conflict-check service.
- Rescheduling creates a new hold against the new slot and only mutates the original booking once the new slot is secured (never a blind move).

### 3.10 Payments (PAY) — see dedicated [PAYMENT_LIFECYCLE.md](../workflows/PAYMENT_LIFECYCLE.md)
- Razorpay integration: full payment, partial advance, pay-at-venue, refunds (full/partial), webhook-driven confirmation, idempotent webhook processing, reconciliation workflow for race conditions.

### 3.11 Website Builder (WEB) — see dedicated [WEBSITE_BUILDER.md](../architecture/WEBSITE_BUILDER.md)
- JSON-driven page/section builder, theming, draft vs published versions, custom domains with DNS verification, hostname-based dynamic resolution.

### 3.12 Notifications (NTF)
- NTF-1: Channels: Email (always), WhatsApp (if configured), in-dashboard notifications (always).
- NTF-2: Triggers: booking confirmed/rejected/cancelled, hold about to expire (optional, best-effort), payment receipt, refund processed, booking reminder (T-24h, T-2h, configurable), staff alerts (new pending approval, reconciliation case opened).
- NTF-3: All notification sends are queued jobs (BullMQ), retried with backoff, and logged (success/failure) — never sent synchronously inside a request handler.

### 3.13 Reports (RPT)
- RPT-1: Revenue by location/court/sport/date range; occupancy %; booking funnel (holds created → converted → expired/abandoned); coupon usage; outstanding dues; refund summary.
- RPT-2: Heavy/scheduled reports run as background jobs and are cached/materialized, not computed live on each dashboard load.

### 3.14 Admin (ADM)
- ADM-1: Business configuration, user/role/permission management, cross-location overview, payment/refund oversight, audit log viewer, notification provider settings, system health (queue depth, failed jobs, webhook failures, DB connection pool stats).

---

## 4. Frontend Screen Breakdown

### 4.1 `apps/web` — Customer-facing public website
| Screen | Route pattern | Notes |
|---|---|---|
| Home | `/` | Hero, featured locations, sports offered |
| Locations list | `/locations` | Filter by city/sport |
| Location detail | `/locations/[slug]` | Courts, amenities, gallery, map |
| Court detail | `/locations/[slug]/courts/[courtSlug]` | Pricing summary, gallery, availability entry point |
| Availability / slot picker | `/locations/[slug]/courts/[courtSlug]/book` | Date + duration → slot grid |
| Checkout (hold active) | `/checkout/[holdId]` | Countdown, customer info, payment method |
| Booking confirmation | `/bookings/[bookingId]/confirmation` | Receipt, add-to-calendar |
| Customer login / register | `/login`, `/register` | Also guest checkout path |
| My bookings | `/account/bookings` | Upcoming/past, cancel/reschedule |
| Contact / About | `/contact`, `/about` | CMS-driven via Website Builder |
| Legal pages | `/privacy`, `/terms`, `/cancellation-policy` | CMS-driven |

### 4.2 `apps/dashboard` — Owner/staff
| Screen | Notes |
|---|---|
| Dashboard home | KPI tiles, today's bookings, pending approvals, occupancy |
| Calendar (day/week/month) | Per-location/court, drag to reschedule (triggers reschedule flow, not a raw drag-write) |
| Locations manager | CRUD, gallery, hours, policies |
| Courts manager | CRUD per location, gallery, hours, pricing shortcut |
| Sports / Amenities catalog | CRUD |
| Pricing rules | Per-court rule builder, special dates, calendar preview |
| Availability / Maintenance blocks | Calendar-based block creation |
| Bookings list + detail | Filter/search, manual approve/reject, check-in, mark no-show/complete |
| Walk-in booking creator | Staff-side booking without public checkout |
| Customers | List, profile, booking history |
| Payments / Refunds | List, initiate refund, reconciliation queue |
| Coupons | CRUD |
| Staff | Invite, assign role + location scope |
| Reports | Revenue, occupancy, funnel |
| Website builder | Section/page editor, theme editor, preview vs publish |
| Domains | Subdomain status, custom domain + DNS verification wizard |
| Settings | Business profile, policies, notification config |

### 4.3 `apps/admin` — Administrative dashboard
| Screen | Notes |
|---|---|
| Business configuration | Timezone/currency/country, global policy defaults |
| User & role management | All staff, role/permission editor |
| Location overview | Cross-location KPIs |
| Booking / Payment / Refund overview | Platform-wide views |
| Audit logs | Searchable/filterable |
| Notification settings | Provider keys/status (Email/WhatsApp), delivery health |
| System health | Queue depth, DLQ size, webhook failure rate, DB pool |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Availability | API uptime target 99.5%; booking-hold path must degrade gracefully if Redis is unavailable (DB remains source of truth) |
| Performance | Availability query p95 < 150ms warm cache, < 400ms cold; hold creation p95 < 300ms |
| Consistency | No two overlapping ACTIVE holds/CONFIRMED bookings for the same court may ever coexist — enforced at the DB level, not just application code |
| Security | OWASP ASVS L2 baseline; see §19 of brief, detailed in SYSTEM_ARCHITECTURE.md §8 |
| Observability | Structured logs, request tracing ID propagated through API → worker, metrics for queue depth/job failure/webhook failure |
| Internationalization readiness | Timezone/currency are business-level config, not hardcoded, even though v1 ships India-only |
| Accessibility | Public website WCAG 2.1 AA for core booking flow |
| Data retention | Audit logs retained ≥ 1 year; soft-delete (not hard-delete) for Booking, Payment, Customer, Media |

---

## 6. Acceptance Criteria (Phase-level)

Detailed phase-by-phase acceptance criteria are in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) §"Acceptance Criteria per Phase". This PRD is the source of truth for *what* each criterion must satisfy; the roadmap is the source of truth for *when*.

---

## 7. Open Product Questions (require owner decision before Phase 6+)

These are flagged, not blocking Phase 1–4 work:

1. **Manual approval default**: should new locations default to auto-confirm or manual-approve bookings? (Affects BKG state machine default transition — recommend auto-confirm with manual-approve as an opt-in toggle per location/court.)
2. **Partial payment minimum**: is the advance-payment percentage business-wide or configurable per sport/court? (Recommend per-court override with a business-wide default.)
3. **No-show policy**: does a NO_SHOW forfeit a prepaid amount, and is that refundable at owner discretion? (Needed before Payment/Refund rules are finalized — currently modeled as owner-discretionary refund, not automatic.)
4. **Guest checkout data retention**: how long do we retain a guest (non-account) customer's PII if they never register? (Affects Customer model + a future data-retention job; recommend 24 months then anonymize.)

These are tracked in [docs/decisions/0001-architecture-review-findings.md](../decisions/0001-architecture-review-findings.md) as open items, not assumptions baked silently into the schema.
