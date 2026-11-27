# Database Schema Plan

Status: Draft for review — Phase 1 (schema, not yet implemented in Prisma)
Related: [ENTITY_RELATIONSHIPS.md](ENTITY_RELATIONSHIPS.md) · [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md)

## Conventions

- **Primary keys**: UUID (`uuid` / Postgres `gen_random_uuid()`, pgcrypto or `uuid-ossp` extension), per the brief.
- **Naming**: Prisma models are PascalCase with camelCase fields; mapped to snake_case tables/columns in Postgres via `@@map`/`@map` (e.g. model `BookingHold` field `courtId` → table `booking_holds` column `court_id`), matching the brief's example table name exactly.
- **Money**: `Decimal` in Prisma → Postgres `DECIMAL(12,2)`. Currency is implied by `Business.currency` (single business); a `currency` column is still stored on `Payment`/`Refund` rows for audit durability even though v1 is INR-only.
- **Time**: All `DateTime` columns stored as `timestamptz` (UTC). `Business.timezone` (IANA string, e.g. `Asia/Kolkata`) is the single place display-timezone is resolved from; `Location` may override if a future multi-timezone business needs it (nullable `timezoneOverride`), but is not used in v1.
- **Soft delete**: `deletedAt DateTime?` on models listed in ENTITY_RELATIONSHIPS §4.
- **Audit columns**: `createdAt`, `updatedAt` on every model; `createdById`/`updatedById` (nullable FK to `User`) on owner/admin-managed catalog models.
- **Extensions required**: `pgcrypto` (UUIDs), `btree_gist` (exclusion constraint for hold/booking overlap — see §"Concurrency-Critical Schema" below).

---

## 1. Business & Access Control

### Business
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | string | |
| legalName | string? | |
| slug | string unique | reserved for future multi-tenant use |
| currency | string(3) | default `INR` |
| timezone | string | default `Asia/Kolkata` |
| country | string(2) | default `IN` |
| supportEmail | string? | |
| supportPhone | string? | |
| logoMediaId | uuid? → Media | |
| faviconMediaId | uuid? → Media | |
| createdAt/updatedAt | timestamptz | |

### BusinessSettings (1:1 with Business)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| businessId | uuid unique FK | |
| defaultHoldDurationMinutes | int | default 5, check 1–15 |
| defaultBookingApprovalMode | enum(AUTO, MANUAL) | overridable per Location/Court (nullable override columns there) |
| minAdvanceBookingMinutes | int | default 0 |
| maxAdvanceBookingDays | int | default 60 |
| defaultCancellationWindowHours | int | default 24 |
| defaultAdvancePaymentPercent | decimal(5,2)? | null = full payment required by default |
| noShowGraceMinutes | int | default 15 |

### User (staff identity)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| businessId | uuid FK | |
| email | string unique | |
| phone | string? | |
| passwordHash | string | argon2id |
| firstName/lastName | string | |
| isActive | boolean | default true; deactivation revokes sessions |
| lastLoginAt | timestamptz? | |
| createdAt/updatedAt/deletedAt | | |

### Role
| id uuid PK | name string unique (OWNER, ADMIN, LOCATION_MANAGER, RECEPTIONIST, ACCOUNTANT) | isSystem boolean (true for the 5 fixed roles; protects from deletion) |

### Permission
| id uuid PK | key string unique (e.g. `booking:create`, `pricing:update`, `refund:approve`, `location:manage`, `staff:manage`) | description string |

### RolePermission (join)
| roleId FK, permissionId FK | composite PK (roleId, permissionId) |

### UserRole (join)
| userId FK, roleId FK | composite PK (userId, roleId) — a user can hold multiple roles, though v1 UI assigns one primary role |

### UserLocationAccess (join)
| userId FK, locationId FK | composite PK; absence of any row + Owner/Admin role ⇒ global access (see ENTITY_RELATIONSHIPS §2) |

### AuditLog
| id uuid PK | businessId FK | actorUserId FK? | action string | entityType string | entityId uuid? | beforeJson jsonb? | afterJson jsonb? | ipAddress string? | userAgent string? | createdAt |
- Index: `(businessId, entityType, entityId)`, `(createdAt)`.

---

## 2. Locations, Courts, Sports, Amenities

### Location
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| businessId | uuid FK | |
| name | string | |
| slug | string unique | |
| description | text? | |
| addressLine1/2 | string | |
| city/state/postalCode/country | string | |
| latitude/longitude | decimal(9,6) | |
| contactPhone/contactEmail | string? | |
| coverMediaId | uuid? → Media | |
| bookingApprovalModeOverride | enum? | null = inherit BusinessSettings |
| cancellationWindowHoursOverride | int? | |
| isActive | boolean | default true |
| createdAt/updatedAt/deletedAt | | |

Indexes: `slug` unique, `(businessId, isActive)`.

### Sport
| id uuid PK | businessId FK | name string | slug string | iconMediaId uuid? | defaultSlotDurationMinutes int (e.g. 60) | defaultSlotIncrementMinutes int (e.g. 30 or 60) | isActive boolean |

### Amenity
| id uuid PK | businessId FK | name string | iconMediaId uuid? | isActive boolean |

### LocationAmenity / CourtAmenity (joins)
| locationId/courtId FK, amenityId FK | composite PK |

### OperatingHours
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| locationId | uuid? FK | |
| courtId | uuid? FK | |
| dayOfWeek | int (0–6) | |
| opensAt | time | stored as `smallint` minutes-from-midnight to sidestep timezone-in-`time`-type ambiguity, resolved against `Business.timezone`/Location override at read time |
| closesAt | time | may be `< opensAt` to represent an overnight range (e.g. 22:00–02:00) — see §"Operating Hours Resolution" |
| isClosed | boolean | default false; explicit "closed this day" row rather than absence of a row (absence = "inherit from location") |

Check constraint: **exactly one of `locationId`, `courtId` is non-null.**
Index: `(courtId, dayOfWeek)`, `(locationId, dayOfWeek)`.

#### Operating Hours Resolution
A court's effective hours for a given day = its own `OperatingHours` row for that `dayOfWeek` if one exists, otherwise the location's row for that `dayOfWeek`. An overnight range (`closesAt < opensAt`) is interpreted as spanning into the next calendar day; the availability engine must treat this explicitly (slot generation walks `opensAt` → `opensAt + duration` even past midnight, attributed to the *opening* day for display, consistent with how the court is actually operated). This is flagged in [0001-architecture-review-findings.md](../decisions/0001-architecture-review-findings.md) as a subtle area requiring dedicated unit tests.

### Court
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| locationId | uuid FK | |
| sportId | uuid FK | |
| name | string | |
| isIndoor | boolean | |
| capacity | int? | |
| dimensions | string? | free text, e.g. "100x60 ft" |
| description | text? | |
| primaryMediaId | uuid? → Media | |
| basePrice | decimal(12,2) | fallback when no PricingRule matches |
| bookingApprovalModeOverride | enum? | |
| maintenanceStatus | enum(OPERATIONAL, UNDER_MAINTENANCE) | derived/cached; authoritative source is active `CourtBlock` rows, this column is a denormalized convenience flag updated by the same transaction that creates/ends a block |
| isActive | boolean | |
| createdAt/updatedAt/deletedAt | | |

Index: `(locationId, isActive)`, `(sportId)`.

### LocationGallery / CourtGallery
| id uuid PK | locationId/courtId FK | mediaId FK | sortOrder int | createdAt |
Index: `(locationId, sortOrder)` / `(courtId, sortOrder)`.

### CourtBlock (maintenance)
| id uuid PK | courtId FK | reason string | startAt timestamptz | endAt timestamptz | createdByUserId FK | createdAt |
Index: `(courtId, startAt, endAt)` — used by availability engine's range-overlap filter (no exclusion constraint needed here; overlapping maintenance blocks on the same court are harmless, just redundant).

---

## 3. Pricing

### PricingRule
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| courtId | uuid FK | |
| type | enum(BASE, WEEKDAY, WEEKEND, PEAK, OFF_PEAK, HOLIDAY) | SPECIAL_DATE is its own table (`SpecialDate`), not this enum value — see rationale below |
| daysOfWeek | int[] | empty/null = all days (used for WEEKDAY/WEEKEND/PEAK/OFF_PEAK types) |
| startTime/endTime | smallint (minutes) | null = all-day |
| price | decimal(12,2) | |
| priority | int | higher wins on overlap within the same type-tier |
| validFrom/validTo | date? | null = open-ended |
| isActive | boolean | |
| createdAt/updatedAt | | |

Index: `(courtId, isActive)`.

**Why SpecialDate is a separate table, not a PricingRule row**: special/holiday pricing is keyed by exact calendar date(s), not a recurring weekday/time pattern, and can be business-wide (all courts) or court-specific. Folding it into `PricingRule` would require nullable `specificDate` alongside nullable `daysOfWeek`/`startTime`, making the resolution algorithm branch on which fields are populated rather than on a clean table boundary. See the Pricing Resolution Algorithm in [API_SPECIFICATION.md](../api/API_SPECIFICATION.md) §Pricing.

### SpecialDate
| id uuid PK | businessId FK | courtId uuid? FK (null = applies to all courts) | date date | label string (e.g. "Diwali") | priceOverride decimal(12,2)? | priceMultiplier decimal(5,2)? | isHoliday boolean | createdAt |

Exactly one of `priceOverride`/`priceMultiplier` is expected to be set (validated in service layer, not a DB constraint, since "neither set" is also valid meaning "closed/no override, label only").

### Coupon
| id uuid PK | businessId FK | code string unique | discountType enum(PERCENTAGE, FIXED) | discountValue decimal(12,2) | minBookingAmount decimal(12,2)? | maxDiscountAmount decimal(12,2)? | usageLimitTotal int? | usageLimitPerCustomer int? | validFrom/validTo timestamptz | applicableSportIds uuid[]? | applicableLocationIds uuid[]? | isActive boolean | createdAt/updatedAt |

### CouponRedemption
| id uuid PK | couponId FK | bookingId FK | customerId FK | discountAmount decimal(12,2) | createdAt |
Index: `(couponId, customerId)` — enforces per-customer usage limit via count query (not a DB constraint, since the limit itself is configurable data).

---

## 4. Concurrency-Critical Schema — Booking Holds & Bookings

This is the most important section of this document; see [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) for the full behavioral design. This section only defines the schema and the exclusion constraint.

### BookingHold (table: `booking_holds`, matching the brief exactly)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| court_id | uuid FK → Court | |
| customer_id | uuid? FK → Customer | nullable for guest checkout |
| session_id | string | guest-tracking id (cookie-backed), also stored for authenticated customers for recovery-on-refresh |
| reservation_token | string unique | opaque, cryptographically random — the "secure reservation token" the brief requires for refresh-recovery; **this**, not `id`, is what the client stores and presents back |
| start_at | timestamptz | |
| end_at | timestamptz | |
| status | enum(ACTIVE, CONVERTED, EXPIRED, RELEASED) | |
| idempotency_key | string? unique | dedupes retried create-hold requests |
| pricing_snapshot | jsonb | computed at hold time so checkout can display a price; re-validated (not blindly trusted) at conversion |
| booking_id | uuid? FK → Booking | set only on CONVERTED |
| expires_at | timestamptz | |
| created_at / updated_at | timestamptz | |

**Exclusion constraint** (requires `btree_gist`):
```sql
ALTER TABLE booking_holds
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

ALTER TABLE booking_holds
  ADD CONSTRAINT excl_active_hold_overlap
  EXCLUDE USING gist (court_id WITH =, time_range WITH &&)
  WHERE (status = 'ACTIVE');
```
This makes it physically impossible for Postgres to accept a second `ACTIVE` hold on the same court with an overlapping `time_range`, regardless of application-level races, multiple API instances, or bugs. The `WHERE (status = 'ACTIVE')` partial predicate means EXPIRED/RELEASED/CONVERTED holds never block new inserts (rule HLD-5 from the brief: expired holds must not block availability even if a worker hasn't processed them — this constraint, by only indexing ACTIVE rows, makes that true at the data layer, not just by convention).

Indexes: `(court_id, status)`, `(reservation_token)` unique, `(customer_id)`, `(expires_at)` for the sweep job, `(session_id)`.

### Booking
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| courtId | uuid FK | |
| customerId | uuid? FK | nullable for walk-ins created before a customer record exists, backfilled when staff enters details |
| holdId | uuid? FK → BookingHold | set when booking originated from a hold; null for direct walk-ins |
| startAt/endAt | timestamptz | |
| status | enum(HOLD, PENDING, CONFIRMED, REJECTED, CANCELLED, COMPLETED, EXPIRED, NO_SHOW) | see note below on why `HOLD` appears here too |
| source | enum(ONLINE, WALK_IN, STAFF_MANUAL) | |
| pricingSnapshot | jsonb | `{ basePrice, ruleApplied, specialDateApplied, couponCode, discountAmount, taxAmount, totalAmount, currency }` |
| totalAmount | decimal(12,2) | denormalized from snapshot for indexed reporting queries |
| couponId | uuid? FK | |
| checkInAt | timestamptz? | |
| cancelledAt | timestamptz? | cancelledByUserId/cancelledByCustomer discriminator fields |
| cancellationReason | string? | |
| rescheduledFromBookingId | uuid? FK → Booking | self-reference, set on the *new* booking when a reschedule creates a replacement |
| idempotencyKey | string? unique | |
| createdAt/updatedAt | | |

**Why `Booking.status` includes `HOLD`**: not as a status this table's own rows sit in for five minutes (that's `BookingHold`'s job), but because a `Booking` row's *state machine*, as specified in the brief (§8), formally includes HOLD as the initial logical state before PENDING/CONFIRMED. In this schema that initial state is **represented by `BookingHold` existing with no `Booking` row yet** — i.e., "HOLD" the brief's status enum value is realized as "no Booking row exists yet, only a BookingHold." See the explicit state-machine mapping and rationale in [BOOKING_LIFECYCLE.md](../workflows/BOOKING_LIFECYCLE.md) §"Reconciling the brief's 8 statuses with two tables" — this is flagged as a specification ambiguity resolved there, not glossed over.

**Exclusion constraint on Booking** (guards walk-ins/direct bookings against each other and against active holds together — see below):
```sql
ALTER TABLE bookings
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

ALTER TABLE bookings
  ADD CONSTRAINT excl_active_booking_overlap
  EXCLUDE USING gist (court_id WITH =, time_range WITH &&)
  WHERE (status IN ('PENDING','CONFIRMED'));
```
`HOLD`-equivalent reservation is covered by `booking_holds`' own constraint; `REJECTED/CANCELLED/COMPLETED/EXPIRED/NO_SHOW` are terminal/non-blocking and excluded from the predicate. **Cross-table** overlap (an ACTIVE hold vs. a PENDING/CONFIRMED booking on the same court/time) cannot be expressed as a single Postgres exclusion constraint across two tables — this is handled by application-level transactional checks described in [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md) §"Cross-table conflict check," using `SELECT ... FOR UPDATE` row locking on the relevant Court row (or an advisory lock keyed on `court_id`) to serialize the check-then-insert across both tables within one transaction. This is the one place a single DB constraint isn't sufficient alone, and it's called out as a specific risk in [0001-architecture-review-findings.md](../decisions/0001-architecture-review-findings.md).

Index: `(courtId, startAt)`, `(customerId)`, `(status)`, `(holdId)` unique where not null.

### BookingStatusHistory
| id uuid PK | bookingId FK | fromStatus enum? | toStatus enum | changedByUserId FK? | changedByCustomer boolean | reason string? | createdAt |

---

## 5. Customers

### Customer
| id uuid PK | businessId FK | email string? | phone string | firstName/lastName string? | passwordHash string? | null for guest-only customers who never register | isGuest boolean | marketingOptIn boolean | createdAt/updatedAt/deletedAt |

Unique constraint: `(businessId, phone)` — phone is the primary identity key (more reliable than email for this market), email optional and unique-when-present.

---

## 6. Payments & Refunds

### Payment
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| bookingId | uuid FK | |
| customerId | uuid? FK | |
| type | enum(FULL, ADVANCE, BALANCE, PAY_AT_VENUE) | |
| method | enum(RAZORPAY, CASH, OTHER) | |
| status | enum(PENDING, AUTHORIZED, CAPTURED, FAILED, CANCELLED) | independent of Booking.status — see PAYMENT_LIFECYCLE.md |
| amount | decimal(12,2) | |
| currency | string(3) | |
| razorpayOrderId | string? unique | |
| razorpayPaymentId | string? unique | |
| reconciliationFlag | boolean | default false; set true by the race-condition handling path in PAYMENT_LIFECYCLE.md §"Late payment after slot reassigned" |
| createdAt/updatedAt | | |

### PaymentTransaction (append-only event log)
| id uuid PK | paymentId FK | eventType string (ORDER_CREATED, ATTEMPT_FAILED, WEBHOOK_RECEIVED, CAPTURED, …) | razorpayEventId string? unique | rawPayload jsonb | createdAt |

`razorpayEventId` uniqueness is the primary duplicate-webhook defense (rule PAY-duplicate-webhook-prevention); a second webhook delivery with the same event id fails the unique insert and the handler treats that as "already processed, return 200."

### Refund
| id uuid PK | paymentId FK | amount decimal(12,2) | reason string? | status enum(REQUESTED, PROCESSING, COMPLETED, FAILED) | razorpayRefundId string? unique | initiatedByUserId FK? | createdAt/updatedAt |

---

## 7. Media

### Media
| id uuid PK | businessId FK | url string | storageKey string | mimeType string | sizeBytes int | width/height int? | purpose enum(LOGO, FAVICON, HERO_BANNER, LOCATION_COVER, LOCATION_GALLERY, COURT_PRIMARY, COURT_GALLERY, FACILITY, WEBSITE_ASSET, PROMO_BANNER) | status enum(PENDING_UPLOAD, PROCESSING, READY, FAILED) | thumbnailUrl string? | uploadedByUserId FK? | createdAt/updatedAt/deletedAt |

`status` starts `PENDING_UPLOAD` when a signed URL is issued, moves to `PROCESSING` once the client confirms upload, `READY` once the image-processing worker job validates bytes + generates variants. Nothing elsewhere in the schema should treat a `Media` row as usable until `READY`.

---

## 8. Website Builder & Domains

### Website (1:1 with Business)
| id uuid PK | businessId uuid unique FK | themeId string (references a built-in theme key, not a DB-editable table in v1) | brandColorsJson jsonb | typographyJson jsonb | seoDefaultsJson jsonb | createdAt/updatedAt |

### WebsitePage
| id uuid PK | websiteId FK | slug string | title string | isSystemPage boolean (home/about/contact/legal vs custom) | seoOverrideJson jsonb? | createdAt/updatedAt |
Unique: `(websiteId, slug)`.

### WebsiteSection
| id uuid PK | websitePageId FK | type string (HERO, GALLERY, LOCATIONS_LIST, COURTS_LIST, TESTIMONIALS, ABOUT, CONTACT, FOOTER, CUSTOM) | sortOrder int | contentJson jsonb | isPublished boolean |

### WebsiteVersion (publish snapshot mechanism — see WEBSITE_BUILDER.md)
| id uuid PK | websiteId FK | snapshotJson jsonb | publishedByUserId FK | publishedAt timestamptz |

Draft edits mutate `WebsitePage`/`WebsiteSection` rows directly (acting as the working copy); "Publish" serializes the full current tree into a new `WebsiteVersion` row, and the **public read path resolves against the latest `WebsiteVersion.snapshotJson`**, never against live `WebsitePage`/`WebsiteSection` rows. This is what guarantees "unpublished changes must not affect the live website" (brief §11) structurally, not by a flag that's easy to forget to check.

### Domain
| id uuid PK | websiteId FK | hostname string unique | type enum(SUBDOMAIN, CUSTOM) | verificationToken string | verificationStatus enum(PENDING, VERIFIED, FAILED) | sslStatus enum(PENDING, PROVISIONING, ACTIVE, FAILED) | isPrimary boolean | verifiedAt timestamptz? | createdAt/updatedAt |

`hostname` global-uniqueness across the whole table (not scoped per business) is deliberate even in single-tenant v1 — it's the exact invariant that makes multi-tenant-ready hostname resolution correct later, and it's what prevents two `Domain` rows from ever racing to claim the same custom domain.

---

## 9. Notifications

### Notification
| id uuid PK | businessId FK | recipientUserId uuid? FK | recipientCustomerId uuid? FK | channel enum(EMAIL, WHATSAPP, IN_APP) | templateKey string | payloadJson jsonb | status enum(QUEUED, SENT, FAILED) | sentAt timestamptz? | failureReason string? | createdAt |

Check constraint: exactly one of `recipientUserId`/`recipientCustomerId` is set.

---

## 10. Indexing & Performance Notes

- All `*_id` FK columns indexed by default via Prisma's implicit index on relation scalar fields — explicitly confirmed in schema review, not assumed.
- Composite indexes called out above are the ones the availability/reporting hot paths depend on; final list to be validated with `EXPLAIN ANALYZE` against seeded data in Phase 4/5 before sign-off.
- `jsonb` columns (`pricingSnapshot`, `contentJson`, `payloadJson`, audit before/after) are not indexed by default; a GIN index will be added only if a specific query pattern against them is confirmed necessary (none identified yet).

## 11. Migration Strategy

- Prisma Migrate, one migration per logical schema change, committed to `packages/database/prisma/migrations`.
- The two exclusion constraints in §4 are **not expressible in Prisma schema syntax directly** (Prisma doesn't yet support `EXCLUDE USING gist`) — they will be added via a Prisma migration's generated SQL, hand-edited to append the `CREATE EXTENSION`/`ALTER TABLE ... ADD CONSTRAINT` statements, with a comment explaining why the migration file deviates from the auto-generated diff. This is called out now so Phase 2 implementation doesn't "fix" it away by accident.
- Seed script (`packages/database/prisma/seed.ts`) creates: one `Business` + `BusinessSettings`, the 5 fixed `Role`s + full `Permission` catalog + `RolePermission` grants, a starter `Sport` list (Football, Cricket, Badminton), a starter `Amenity` list, and one sample `Location`/`Court` for local dev — never seeded into a real deployment target.
