# Temporary Booking Slot Locking

Status: Draft for review — Phase 1 — **this is the system's most critical correctness guarantee**
Related: [DATABASE_SCHEMA_PLAN.md](../database/DATABASE_SCHEMA_PLAN.md) §4 · [BOOKING_LIFECYCLE.md](BOOKING_LIFECYCLE.md) · [PAYMENT_LIFECYCLE.md](PAYMENT_LIFECYCLE.md)

## 1. Design Principle

**Postgres is the lock. Redis/BullMQ is a convenience, never the authority.** Every read of "is this slot available" and every write of "reserve/confirm this slot" goes through the database inside a transaction; the exclusion constraint makes the invariant physically true at the storage layer, so even a bug in application code, a second API instance, or a crashed worker cannot produce an overlapping reservation.

## 2. Hold Creation Flow

```
Customer picks Court C, 2026-12-01 19:00–20:00
        │
        ▼
POST /booking-holds  { courtId: C, startAt, durationMinutes, idempotencyKey? }
        │
        ▼
┌─────────────────────────── BEGIN TRANSACTION ───────────────────────────┐
│ 1. If Idempotency-Key present: look up prior result for this key.        │
│    If found and not expired, return the same hold response (no new row). │
│ 2. SELECT court FOR UPDATE (row lock on Court — serializes concurrent    │
│    attempts on the SAME court so the subsequent availability check and  │
│    insert are atomic as seen by other transactions on this court).      │
│ 3. Re-validate: court is active, within operating hours, not in a       │
│    CourtBlock window, slot aligns to the sport's slot increment.        │
│ 4. Resolve price via the pricing engine (GET /pricing/quote logic,      │
│    inlined server-side — never trusts a client-supplied price).         │
│ 5. INSERT INTO booking_holds (... status='ACTIVE', expires_at=now()+5m) │
│    → the EXCLUDE USING gist constraint fires here. If it conflicts with │
│      an existing ACTIVE hold OR a PENDING/CONFIRMED booking (checked by  │
│      an explicit SELECT against `bookings` in the same transaction,     │
│      see §3), the transaction raises and is caught as SLOT_CONFLICT.    │
│ 6. Store the Idempotency-Key → response mapping (Redis, TTL = hold TTL).│
└───────────────────────────── COMMIT ──────────────────────────────────┘
        │
        ▼
Schedule a BullMQ delayed job `expire-hold:{holdId}` with delay = 5 min
(best-effort cleanup trigger — see §5)
        │
        ▼
Response: { holdId, reservationToken, expiresAt, pricingSnapshot }
        │
        ▼
Invalidate Redis availability cache key `avail:{courtId}:{date}`
```

## 3. Cross-Table Conflict Check (Hold vs. Booking)

A single Postgres `EXCLUDE` constraint only guards overlaps **within one table**. `booking_holds` and `bookings` are separate tables (see [ENTITY_RELATIONSHIPS.md](../database/ENTITY_RELATIONSHIPS.md) for why), so a hold insert must also be checked against the `bookings` table's active rows (`PENDING`/`CONFIRMED`), and a booking insert (walk-in, or hold-conversion) must be checked against `booking_holds`' active rows belonging to *other* holds.

This is done with:
1. `SELECT ... FROM bookings WHERE court_id = :courtId AND status IN ('PENDING','CONFIRMED') AND time_range && tstzrange(:start, :end) FOR UPDATE` inside the same transaction as the hold insert, **after** the `SELECT court FOR UPDATE` row lock in step 2 above — the Court-row lock is what prevents a second concurrent transaction from running this same check-then-insert sequence in parallel and both seeing "no conflict" before either commits (classic check-then-act race). This makes the cross-table check safe even though it isn't expressible as a single declarative constraint.
2. The within-table `EXCLUDE` constraint on `booking_holds` is the backstop for hold-vs-hold, and on `bookings` for booking-vs-booking, in case the row lock is ever bypassed by a code path that doesn't take it (defense in depth — there should be exactly one code path, the `BookingHoldService.createHold`/`BookingService.createDirectBooking` methods, and this is enforced by code review + an integration test that attempts to insert directly via a second service method and confirms the DB still rejects it).

## 4. Countdown UI Contract

- Server returns `expiresAt` as an absolute ISO-8601 UTC timestamp. The client computes remaining time as `expiresAt - serverNow`, where `serverNow` is derived from the response's `Date` header (or an explicit `serverTime` field in the payload) at the moment the hold was created — **never from the client's own clock**, which may be skewed.
- The countdown is cosmetic. The actual authority is the next real request: `GET /booking-holds/:reservationToken` returns 410 `HOLD_EXPIRED` the instant `expires_at <= now()` in the database, regardless of what the client's timer shows. Checkout submission (`POST /bookings/from-hold`) re-checks hold validity server-side as its very first step, inside the finalizing transaction.
- On reaching zero client-side: stop allowing checkout submission, call `GET /availability` to refresh the grid, and show "reservation expired, please select another slot." This is a UX nicety; the server-side re-check is what actually prevents a stale submission from succeeding.

## 5. Expiry Mechanics

Two cooperating mechanisms, in priority order:

1. **Lazy expiry (authoritative)**: every availability read and every conflict check filters active holds with `expires_at > now()` — an un-swept expired hold row simply stops counting as a conflict the instant its clock runs out, satisfying rule HLD-5 ("expired holds must not block availability even if the worker has not processed them") without needing the sweep to have run yet.
2. **Active expiry (housekeeping)**: a BullMQ delayed job (`expire-hold:{holdId}`, scheduled at creation time with a 5-minute delay) runs an `UPDATE booking_holds SET status='EXPIRED' WHERE id = :id AND status='ACTIVE' AND expires_at <= now()`. This (a) frees the slot from the exclusion-constraint index promptly instead of relying only on the predicate filter, keeping the constraint's working set small, and (b) triggers the availability-cache invalidation and any "your hold expired" notification. Idempotent — running it twice, or after the hold already converted, is a no-op (the `WHERE status='ACTIVE'` guard).
3. **Database sweep (Redis-down fallback)**: a scheduled job running directly against Postgres (cron-triggered, not Redis-queued) every 1 minute: `UPDATE booking_holds SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at <= now()`. This exists specifically so that **if Redis/BullMQ is entirely unavailable**, holds still expire correctly within ~1 minute of their true expiry (and, per point 1 above, even *before* any sweep runs, lazy expiry already makes the slot bookable again — this sweep is purely state-hygiene, not a correctness dependency).

## 6. Recovery on Page Refresh

- The client persists the `reservationToken` (not the raw `holdId`) in `sessionStorage`/a short-lived cookie.
- On page load, if a token is present, the client calls `GET /booking-holds/:reservationToken`. If the hold is still `ACTIVE` and unexpired, checkout resumes with the original `expiresAt` and `pricingSnapshot` (price is **not** re-quoted on refresh — the snapshot taken at hold creation is authoritative until conversion, so the customer isn't shown a different price than what they started checkout against).
- If expired/converted/released, the client clears the token and returns the customer to slot selection.
- `reservationToken` is a high-entropy random value (not the sequential/guessable `id`), specifically so a token cannot be brute-forced to hijack or probe someone else's in-progress hold.

## 7. Payment Race Conditions

### 7.1 Payment succeeds before hold expiry (happy path)
Webhook arrives → transaction: re-check hold is `ACTIVE` and unexpired AND re-check no conflicting `PENDING`/`CONFIRMED` booking exists for the slot (defensive, should be impossible given the exclusion constraint, but checked explicitly as the final gate before conversion) → insert `Booking` (status per approval mode) → update hold to `CONVERTED` with `booking_id` set → update `Payment` to `CAPTURED`. All in one transaction. See [PAYMENT_LIFECYCLE.md](PAYMENT_LIFECYCLE.md) for the full payment-side sequence.

### 7.2 Payment succeeds exactly as the hold expires
The conversion transaction's re-check (`status='ACTIVE' AND expires_at > now()`) is the deciding line. Two outcomes:
- If the check passes (webhook arrived a moment before the sweep/lazy-expiry boundary), conversion proceeds normally — this is still inside the "happy path" from the database's perspective, just with tight timing.
- If the check fails (hold already `EXPIRED` by the time the webhook's transaction runs), we are in §7.3.

### 7.3 Late payment after the hold has expired and/or the slot was reassigned
This is the brief's explicitly called-out hard case. Sequence:
1. Webhook confirms payment capture for a hold/booking attempt whose hold is no longer `ACTIVE` (expired, released, or — worse — already converted to a *different* booking because another customer grabbed the freed slot in the interim).
2. **Never create a duplicate booking and never silently drop the payment.** The handler:
   - Marks the associated `Payment.status = CAPTURED` (the money did move — that's a fact independent of booking outcome) but sets `Payment.reconciliationFlag = true`.
   - If an orphaned `Booking` row exists in `PENDING` for this payment (can happen if the booking was created optimistically before the final webhook — see note below), it's transitioned to `Booking.status = EXPIRED`.
   - Inserts a row into the reconciliation queue (modeled as `Payment.reconciliationFlag = true` plus a `Notification` to Owner/Admin and Accountant roles — `payment:reconcile` permission holders) describing the conflict: original slot, original amount, what currently occupies the slot, if anything.
   - **No automatic refund is issued.** Refund-vs-rebook-on-another-slot-vs-manual-goodwill-gesture is an owner/accountant judgment call (per Product Requirements §7 open question 3 on no-show/refund discretion, this is deliberately not automated) — the system surfaces the case and provides a one-click "refund this payment" action, but does not decide for the business.
3. **Design choice to avoid creating the Booking optimistically before payment confirmation**: to minimize how often §7.3 can even occur, `POST /bookings/from-hold` for the ONLINE/full-or-advance-payment path does **not** insert a `Booking` row at all until the webhook confirms capture — it only creates the `Payment` row (status PENDING) and returns the Razorpay order to the client. The hold itself remains the only "something is reserved" evidence until money is confirmed. This means the race in §7.3, when it happens, has no orphaned `PENDING` booking to clean up — just a payment that arrived too late against a hold that's gone. (PAY_AT_VENUE bookings, which don't wait on a payment gateway, *do* create the Booking immediately on hold conversion, since there's no webhook race to protect against there.)

## 8. Idempotency

- `Idempotency-Key` header on `POST /booking-holds`: server stores `(businessId, key) → response` in Redis with TTL equal to the hold duration; a Postgres-backed fallback table (`IdempotencyRecord`) is written in the same transaction as the hold insert so the guarantee survives a Redis outage, with Redis as the fast-path read.
- Razorpay webhook idempotency: `PaymentTransaction.razorpayEventId` unique constraint — a replayed webhook delivery fails the insert and the handler returns 200 without reprocessing (Razorpay's own retry semantics expect idempotent 200s, not errors, on duplicates).

## 9. Redis-Down Fallback Summary

| Function | Normal path | If Redis unavailable |
|---|---|---|
| Hold expiry | Lazy (every read) + active job + 1-min DB sweep | Lazy + 1-min DB sweep still run (sweep is a cron job hitting Postgres directly, independent of BullMQ) |
| Availability cache | Redis-cached, 15–30s TTL | Falls back to direct Postgres query every request (slower, still correct) |
| Idempotency keys | Redis fast path | Postgres `IdempotencyRecord` table read |
| Rate limiting | Redis counters | Fails open with a conservative in-memory-per-instance limiter as a degraded fallback (logged as a health-check warning; acceptable short-term posture since the underlying booking-correctness guarantees never depend on rate limiting) |

## 10. Concurrency Integration Test Plan (traces to Testing Requirements in the brief)

All tests run against a real Postgres instance (not mocked), using parallel async requests / `Promise.all` or a dedicated load-test harness (k6/Artillery) for higher concurrency levels, implemented in Phase 5.

1. **N concurrent hold requests, same court/slot** (N = 2, 10, 50): assert exactly one `201 Created`, the rest `409 SLOT_CONFLICT`; assert exactly one `ACTIVE` row in `booking_holds` for that range.
2. **Two concurrent `from-hold` conversions racing a single expiring hold**: one request arrives just before `expires_at`, one just after (simulated via a test hook that controls the clock/row's `expires_at`) — assert the pre-expiry one succeeds and the post-expiry one gets `HOLD_EXPIRED`, never both succeeding, never both failing.
3. **Hold expires naturally, then a second customer successfully books the now-free slot** — assert availability reflects the change within the lazy-expiry window (immediately) even before the sweep job runs.
4. **Payment succeeds a few hundred ms after hold expiry, slot not yet reassigned** — assert §7.2/7.3 path: no duplicate booking, `Payment.reconciliationFlag = true` if expired-before-confirmation, admin notification enqueued.
5. **Payment succeeds after the slot was reassigned to a different customer** — assert the second customer's booking is untouched, the late payment is flagged for reconciliation, no double booking exists in `bookings` for the time range (verified via a direct `SELECT ... WHERE time_range && :range` query, not just via application responses).
6. **Customer refreshes checkout mid-hold** — assert `GET /booking-holds/:reservationToken` returns the same hold/pricingSnapshot, unaffected by the refresh.
7. **Customer abandons checkout** (no explicit release, just stops interacting) — assert the hold still expires via the active job/sweep within the configured TTL and the slot becomes bookable again without manual intervention.
8. **Duplicate webhook delivery** — send the same Razorpay webhook payload twice; assert the second is a no-op (`PaymentTransaction` has exactly one row for that `razorpayEventId`, `Payment` status unchanged by the second call).
9. **Walk-in booking racing an online hold on the same slot** — assert whichever transaction commits first wins and the second gets `SLOT_CONFLICT`, regardless of whether it originated from the staff dashboard or the public API.
10. **Reschedule racing a third party booking the vacated or target slot** — assert the original booking is untouched if the new-slot hold fails, and that the vacated original slot isn't exposed as available until the original booking is actually cancelled as part of a *successful* reschedule (i.e., no window where both the old and new slot are simultaneously free due to a half-completed reschedule).

Load-level target (non-functional, informs infra sizing, not a pass/fail unit test): the system should sustain at least 100 concurrent hold-creation attempts across distinct courts without exclusion-constraint contention becoming a bottleneck (verified by the Court-row lock being scoped per-court, not a global lock — confirmed in Phase 5 load testing).
