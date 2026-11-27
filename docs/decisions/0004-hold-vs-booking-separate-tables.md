# ADR-0004: `BookingHold` and `Booking` as Separate Tables

Status: Accepted
Date: 2026-11-27

## Context
The brief's §8 booking-status enum includes `HOLD` as a `Booking` status, while §9 separately specifies a dedicated `booking_holds` table. A literal reading could be satisfied by either (a) one `Booking` table whose status includes `HOLD`, with no separate hold table, or (b) two tables as the brief's §9 schema explicitly lists. This ADR records why (b) was chosen, since it's the higher-fidelity reading of an explicitly-specified table but introduces the reconciliation work documented in [ADR-0001](0001-architecture-review-findings.md) finding F1.

## Decision
Two tables: `BookingHold` (short-lived, high-churn, five-minute-lifetime rows) and `Booking` (long-lived, reporting/history-bearing rows). A hold converts into a booking as an explicit, auditable event rather than an in-place status mutation.

## Rationale
1. **Brief fidelity**: §9 explicitly specifies the `booking_holds` table schema, including fields (`session_id`, `expires_at`) that don't belong on a long-lived `Booking` row (a confirmed booking doesn't need a guest session id or an expiry timestamp).
2. **Hot-path isolation**: Holds are created and destroyed at a much higher rate than bookings are created (many holds are abandoned/expired for every one that converts). Keeping them in their own small table means the exclusion constraint's working index stays small and fast, independent of `Booking` table growth over years of operation.
3. **Simpler exclusion constraints**: A single predicate (`status = 'ACTIVE'`) on `BookingHold` is simpler and less error-prone than one constraint that would need to reason about hold-like-and-booking-like statuses together in one 8-value enum.
4. **Auditability**: `BookingHold.status = CONVERTED` + `bookingId` set is a clear, permanent record of "this hold became this booking," distinguishable from a walk-in booking that never had a hold at all — useful for the booking-funnel report (hold created → converted → expired/abandoned) and for debugging the race conditions this system is built to prevent.

## Consequences
- Conflict-checking "is this slot free" must always query both tables (see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §3) — an added implementation responsibility, mitigated by funneling all writes through two specific service methods and testing that nothing bypasses them.
- The brief's literal `HOLD` status value on `Booking` is kept in the enum only for the narrow late-payment-reconciliation edge case, not for routine state — documented clearly in [BOOKING_LIFECYCLE.md](../workflows/BOOKING_LIFECYCLE.md) §1 so it doesn't read as an oversight.
