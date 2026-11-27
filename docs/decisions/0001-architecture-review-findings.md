# ADR-0001: Architecture Review Findings — Gaps, Conflicts, Race Conditions, Open Questions

Status: Accepted (as a tracking record — individual items below carry their own status)
Date: 2026-11-27

This document is the output of reviewing the original project brief for missing requirements, conflicting states, race conditions, and data-consistency issues, as explicitly requested in §22 of the brief. Each finding states what was found, where it's resolved (if resolved), and what remains open.

## Resolved During Planning

### F1. The brief's `Booking` status enum (`HOLD, PENDING, ...`) conflicts with having a separate `BookingHold` table
**Finding**: §8 lists `HOLD` as a `Booking` status, but §9 separately specifies a `booking_holds` table with its own status enum (`ACTIVE, CONVERTED, EXPIRED, RELEASED`). Taken literally, this implies a `Booking` row should exist in `HOLD` status *and* a separate `BookingHold` row should exist simultaneously — redundant and a source of drift (which one is authoritative while both exist?).
**Resolution**: `HOLD` is realized structurally as "an `ACTIVE` `BookingHold` exists, no `Booking` row yet." Documented explicitly in [BOOKING_LIFECYCLE.md](../workflows/BOOKING_LIFECYCLE.md) §1 so this isn't rediscovered as a bug during implementation. `Booking.status` keeps `HOLD`/`EXPIRED` in its enum only for the narrow late-payment-reconciliation edge case (ADR cross-ref: [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §7.3), not for routine use.

### F2. Cross-table overlap (hold vs. booking) cannot be enforced by a single DB constraint
**Finding**: A Postgres `EXCLUDE` constraint is scoped to one table. With holds and bookings in separate tables, nothing in the schema alone prevents an `ACTIVE` hold and a `PENDING` booking from overlapping on the same court.
**Resolution**: Row-level locking (`SELECT ... FOR UPDATE` on the `Court` row) wraps both the within-table insert and an explicit cross-table existence check inside one transaction, serializing concurrent attempts on the same court. Documented in [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §3, with constraint-level defense-in-depth on top. **Residual risk**: this depends on every write path going through the same two service methods — enforced by code review discipline and an integration test (§10 item 9 in that doc), not by the schema alone. Flagged as the single highest-risk implementation detail in the whole system; Phase 5 must not ship without the full test suite in TEMPORARY_SLOT_LOCKING §10 passing.

### F3. Payment succeeding after a hold has already been reassigned has no specified resolution in the brief beyond "never create a duplicate booking... notify the administrator"
**Finding**: The brief states the requirement but not the mechanism.
**Resolution**: Full design in [PAYMENT_LIFECYCLE.md](../workflows/PAYMENT_LIFECYCLE.md) and [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §7.3 — reconciliation flag on `Payment`, no automatic refund (owner-discretionary), admin notification, and a design choice to avoid creating a `Booking` row at all until online payment is actually confirmed, which minimizes how often this case is even reachable.

### F4. Operating hours overnight ranges (e.g. 10 PM–2 AM) are not addressed anywhere in the brief
**Finding**: A naive per-day time-range model breaks for courts open past midnight.
**Resolution**: Explicit handling documented in [DATABASE_SCHEMA_PLAN.md](../database/DATABASE_SCHEMA_PLAN.md) §2 "Operating Hours Resolution" — `closesAt < opensAt` is a valid overnight representation, attributed to the opening day, with slot generation walking past midnight. Flagged for dedicated unit tests in Phase 4.

### F5. Pricing-rule precedence is unspecified ("weekday, weekend, peak, off-peak, special date, holiday pricing" is a flat list with no stated priority)
**Finding**: Without an explicit precedence order, two simultaneously-matching rules (e.g. "weekend" and "peak-hour" both matching a Saturday evening slot) have undefined resolved price.
**Resolution**: Explicit tier order defined in [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) §"Pricing Resolution Algorithm" (Special Date > Holiday > Peak/Off-peak > Weekend > Weekday > Base), with an in-tier `priority` field for finer control and a logged-as-config-error tie-break. **Open**: this exact tier ordering is a product judgment call, not a technical necessity — flagged to the owner for confirmation before Phase 4 locks it in (see "Open Items Requiring Owner Input" below).

### F6. "Customer" identity vs. "User" (staff) identity overlap was unclear in the brief's role list (Customer is listed as a Role alongside Owner/Admin/etc.)
**Finding**: Treating Customer as just another row in the same `Role`/`User` table as staff would force RBAC/location-scope machinery onto every end customer, and breaks guest checkout (no credentials).
**Resolution**: `Customer` and `User` are separate identity tables sharing only the auth/JWT infrastructure. Documented in [ENTITY_RELATIONSHIPS.md](../database/ENTITY_RELATIONSHIPS.md) §2.

### F7. Draft/live website leakage risk
**Finding**: Brief requires "unpublished changes must not affect the live website" — a flag-based approach (`isPublished` boolean per section) is easy to get right initially and easy to regress later (one new query path that forgets the filter leaks drafts).
**Resolution**: Structural separation via an append-only `WebsiteVersion` snapshot table that is the *only* thing the public path is allowed to query — detailed in [WEBSITE_BUILDER.md](../architecture/WEBSITE_BUILDER.md) §3.

## Open Items Requiring Owner Input (not blocking Phase 2–4, but should be resolved before the phases that depend on them)

| # | Question | Blocks | Current placeholder assumption |
|---|---|---|---|
| 1 | Default booking-approval mode (auto vs. manual) for new locations | Phase 6 default behavior | Auto-confirm, manual as opt-in override |
| 2 | Is advance-payment percentage business-wide or per-court? | Phase 7 pricing/payment UI | Per-court override with business-wide default |
| 3 | Does NO_SHOW forfeit a prepaid amount automatically, or is refund always owner-discretionary? | Phase 7 refund automation | Always owner-discretionary (no auto-forfeit logic) |
| 4 | Guest (non-account) customer PII retention period | Phase 11/12 data-retention job | 24 months then anonymize |
| 5 | Exact pricing-tier precedence order (F5 above) confirmed by the business | Phase 4 pricing engine | Special Date > Holiday > Peak/Off-peak > Weekend > Weekday > Base |
| 6 | Hold TTL configurability bounds (brief says 5 min fixed in the example, but also implies configurability via "default hold duration") | Phase 5 | Configurable 1–15 min, default 5 |

## Explicitly Not Treated as Gaps (reviewed and judged non-issues)

- **BullMQ as "not the sole source of truth" (brief §9 rule 8)**: satisfied by the lazy-expiry-first design in TEMPORARY_SLOT_LOCKING §5 — reviewed and confirmed this fully addresses the requirement rather than just nominally using Redis alongside Postgres.
- **Multi-sport slot-duration differences** (football 60 min vs. badminton 30–45 min, say): handled by `Sport.defaultSlotDurationMinutes`/`defaultSlotIncrementMinutes` being per-sport, not global constants — confirmed no hardcoded duration exists in the pricing/availability design.
