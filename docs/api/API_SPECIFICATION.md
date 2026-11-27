# API Specification

Status: Draft for review — Phase 1
Related: [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) · [DATABASE_SCHEMA_PLAN.md](../database/DATABASE_SCHEMA_PLAN.md)

Base path: `/api/v1`, served by `apps/api` (a headless Next.js app — Route Handlers only, no pages; see [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md) §2–3). All endpoints documented via Swagger/OpenAPI, generated at build time from the same `packages/validations` zod schemas every route handler already uses for request/response validation, via `@asteasolutions/zod-to-openapi`: each schema is registered once (path, method, request/response shape, tags) in `apps/api/lib/openapi/registry.ts`, and a build script (`pnpm --filter api run build:openapi`) emits `openapi.json`, served at `/api/docs` through a static Swagger UI page. `packages/api-client` is generated from that same OpenAPI schema so frontend DTOs never hand-drift from the backend.

## Conventions

- **Response envelope**: `{ "data": ..., "meta": {...}? }` on success; errors return `{ "error": { "code": "BOOKING_SLOT_CONFLICT", "message": "...", "details": {...}? } }` with an appropriate HTTP status (400/401/403/404/409/422/429/500).
- **Pagination**: `?page=1&pageSize=20` (default 20, max 100); list responses include `meta: { page, pageSize, total, totalPages }`.
- **Filtering/sorting**: `?filter[field]=value`, `?sort=-createdAt` (REST-conventional, documented per-endpoint in Swagger, not exhaustively repeated here).
- **Auth**: `Authorization: Bearer <accessToken>` for API calls; refresh token lives in an httpOnly cookie, used only against `/auth/refresh`.
- **Idempotency**: `Idempotency-Key` header accepted on `POST /booking-holds` and `POST /payments/*`.
- **Versioning**: breaking changes ship as `/api/v2`; `/v1` is supported for the lifetime of any client built against it.

## Authorization Model

Every protected route composes its exported `GET`/`POST`/etc. handler with `withPermission('resource:action')(handler)` and, where the resource is location-bound, `withLocationScope()(...)` (reads `locationId` from the route param, query, or resolved resource, then checks `UserLocationAccess` unless the caller's role is global). Both checks run inside the wrapper **before** the inner handler body executes — the same before-the-handler ordering guarantee a NestJS guard would give, just as plain function composition instead of a decorator (there is no decorator/guard primitive in Next.js Route Handlers). Customer-only routes use `withCustomer()`; public routes are explicitly wrapped in `withPublic()` so "no wrapper present" is never silently treated as public — an ESLint rule fails the build on any exported route method missing one of `withAuth`/`withPermission`/`withCustomer`/`withPublic` (fail-closed default).

---

## 1. auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Staff (User) login, email+password |
| POST | `/auth/customer/login` | Customer login, phone/email+password or OTP |
| POST | `/auth/customer/register` | |
| POST | `/auth/customer/guest-session` | Issues a `sessionId` for guest checkout, no account |
| POST | `/auth/refresh` | Rotates refresh token, reuse-detection revokes session family |
| POST | `/auth/logout` | |
| POST | `/auth/forgot-password`, `/auth/reset-password` | |

## 2. users (staff)
| Method | Path | Permission |
|---|---|---|
| GET | `/users` | `staff:manage` |
| POST | `/users` (invite) | `staff:manage` |
| GET/PATCH | `/users/:id` | `staff:manage` (self-read exempt) |
| POST | `/users/:id/deactivate` | `staff:manage` |

## 3. roles / 4. permissions
| GET | `/roles` | list fixed roles + their permission sets |
| GET | `/permissions` | full catalog |
| POST | `/users/:id/roles` | assign role (+ optional locationIds) — `staff:manage` |
| DELETE | `/users/:id/roles/:roleId` | |
| PUT | `/users/:id/location-access` | replace location-scope set |

## 5. business
| GET/PATCH | `/business` | `business:manage` (Owner only for sensitive fields, enforced in service) |
| GET/PATCH | `/business/settings` | `business:manage` |

## 6. locations
| GET | `/locations` (public: active only; staff: all + filters) |
| GET | `/locations/:slug` |
| POST | `/locations` | `location:manage` |
| PATCH/DELETE(soft) | `/locations/:id` | `location:manage` + location-scope |
| PUT | `/locations/:id/operating-hours` | |
| POST/PUT/DELETE | `/locations/:id/gallery` | reorder via PUT with ordered id array |

## 7. courts
| GET | `/courts` (filter by locationId, sportId) |
| GET | `/courts/:id` |
| POST | `/courts` | `court:manage` + location-scope |
| PATCH/DELETE(soft) | `/courts/:id` | |
| PUT | `/courts/:id/operating-hours` | |
| POST/PUT/DELETE | `/courts/:id/gallery` | |
| POST | `/courts/:id/blocks` (maintenance) | |
| DELETE | `/courts/:id/blocks/:blockId` | |

## 8. sports / 9. amenities
| GET/POST/PATCH/DELETE | `/sports` | `catalog:manage` |
| GET/POST/PATCH/DELETE | `/amenities` | `catalog:manage` |
| PUT | `/locations/:id/amenities`, `/courts/:id/amenities` | set membership |

## 10. media
| POST | `/media/signed-upload-url` | body: `{ purpose, mimeType, sizeBytes, ownerType, ownerId }` → returns `{ mediaId, uploadUrl, fields }` |
| POST | `/media/:id/confirm-upload` | client confirms upload done → triggers processing job |
| DELETE | `/media/:id` | soft delete + async storage cleanup job |

## 11. pricing
| GET | `/courts/:id/pricing-rules` |
| POST/PATCH/DELETE | `/courts/:id/pricing-rules/:ruleId` | `pricing:manage` |
| GET/POST/PATCH/DELETE | `/special-dates` | business- or court-scoped |
| GET | `/pricing/quote?courtId=&date=&startTime=&durationMinutes=&couponCode=` | **the** pricing-resolution endpoint, used by both availability-to-checkout flow and walk-in creation; always server-computed, returns the same shape stored later in `pricingSnapshot` |
| GET/POST/PATCH/DELETE | `/coupons` | `coupon:manage` |
| POST | `/coupons/validate` | public — checks validity/usage without creating a redemption |

### Pricing Resolution Algorithm (authoritative)
For a given `(courtId, date, startTime, durationMinutes)`:
1. Check `SpecialDate` for `date` scoped to this court or business-wide (court-specific row wins if both exist) → if found and it's a full override, use it and stop.
2. Else collect all active `PricingRule`s for the court whose `daysOfWeek`/time-range match, grouped by `type` tier (HOLIDAY > PEAK/OFF_PEAK > WEEKEND > WEEKDAY > BASE/`Court.basePrice` fallback).
3. Within the highest matching tier, the rule with the highest `priority` wins; ties broken by most-recently-created rule (logged, flagged as a config error for the owner to fix — ties should not occur in well-formed config).
4. Multiply resolved per-slot-unit price by `durationMinutes / Sport.defaultSlotDurationMinutes` (supporting non-standard durations per BKG flow step 4).
5. Apply coupon (if any) per its discount type, respecting `minBookingAmount`/`maxDiscountAmount`/usage limits (usage check queries `CouponRedemption`, not a cached counter, to stay correct under concurrency).
6. Return `{ basePrice, tierApplied, ruleId?, specialDateId?, subtotal, couponCode?, discountAmount, totalAmount, currency }` — this exact shape becomes `Booking.pricingSnapshot` at hold/booking creation time.

## 12. availability
| GET | `/availability?courtId=&date=` → slot grid: `[{ startAt, endAt, status: 'AVAILABLE'|'HELD'|'BOOKED'|'BLOCKED', price }]` |
| GET | `/availability/calendar?courtId=&month=` → per-day summary (for dashboard month view) |

Public and staff share this endpoint; staff additionally sees which booking/hold occupies a non-available slot (via a separate authenticated detail call, not embedded in the public payload).

## 13. booking-holds
| Method | Path | Notes |
|---|---|---|
| POST | `/booking-holds` | body: `{ courtId, startAt, durationMinutes, customerId? }` (session/guest id derived from auth context); returns `{ holdId, reservationToken, expiresAt, pricingSnapshot }`. Idempotency-Key honored. |
| GET | `/booking-holds/:reservationToken` | recovers an active hold on page refresh — **lookup by token, not by guessable id** |
| DELETE | `/booking-holds/:reservationToken` | explicit release (user picks a different slot / abandons) |
| POST | `/booking-holds/:reservationToken/extend` | optional, rate-limited, owner-configurable whether allowed at all (default: not allowed, to keep the 5-minute guarantee meaningful) |

Full behavior in [TEMPORARY_SLOT_LOCKING.md](../workflows/TEMPORARY_SLOT_LOCKING.md).

## 14. bookings
| GET | `/bookings` | staff: filtered list; customer: `/bookings/mine` |
| GET | `/bookings/:id` | |
| POST | `/bookings/walk-in` | staff-only, bypasses hold flow, still goes through pricing + the same conflict-check transaction |
| POST | `/bookings/from-hold` | body: `{ reservationToken, customerInfo, paymentMethod }` — the checkout-completion endpoint; for `PAY_AT_VENUE` this directly creates the booking (PENDING or CONFIRMED per approval mode); for online payment this creates a `Payment` in PENDING and returns Razorpay order details, booking is only finalized on webhook confirmation (see Payment Lifecycle) |
| POST | `/bookings/:id/approve`, `/bookings/:id/reject` | `booking:approve` — manual-approval mode only |
| POST | `/bookings/:id/cancel` | staff or owning customer; enforces cancellation-window policy |
| POST | `/bookings/:id/reschedule` | body: `{ newStartAt, newDurationMinutes }` — internally creates a new hold on the new slot first, only mutates original booking on success |
| POST | `/bookings/:id/check-in` | |
| POST | `/bookings/:id/complete`, `/bookings/:id/no-show` | |

## 15. customers
| GET | `/customers` | staff, `customer:view` |
| GET | `/customers/:id` | includes booking history |
| PATCH | `/customers/:id` | |
| GET | `/customers/me` | customer self-service |

## 16. payments
| POST | `/payments/:id/initiate` | creates Razorpay order for a PENDING Payment |
| POST | `/payments/webhook/razorpay` | public, signature-verified, idempotent |
| GET | `/payments` | staff, filters |
| GET | `/payments/:id` | |
| GET | `/payments/reconciliation-queue` | flagged race-condition cases, `payment:reconcile` |
| POST | `/payments/:id/collect-balance` | generates a new Payment for outstanding amount (partial-advance flow) |

## 17. refunds
| POST | `/refunds` | body: `{ paymentId, amount, reason }` — `refund:approve` |
| GET | `/refunds` | |
| GET | `/refunds/:id` | |

## 18. website
| GET | `/website` | staff — full draft tree |
| PATCH | `/website`, `/website/pages/:id`, `/website/pages/:id/sections/:id` | draft mutation, `website:manage` |
| PUT | `/website/pages/:id/sections/reorder` | |
| POST | `/website/publish` | snapshots draft → `WebsiteVersion` |
| GET | `/website/preview` | staff-only render of current draft |
| GET | `/website/public` | **public**, resolves by `Host` header → latest published `WebsiteVersion`; this is the only endpoint `apps/web` calls for page content |

## 19. domains
| GET/POST/DELETE | `/domains` | `domain:manage` |
| POST | `/domains/:id/verify` | triggers DNS TXT check job, returns current status |
| GET | `/domains/resolve?hostname=` | **public**, used by `apps/web` middleware; strict allowlist join against `VERIFIED` domains only |

## 20. notifications
| GET | `/notifications` | staff (business-wide) and customer (own) views |
| PATCH | `/notifications/settings` | provider config, `notification:manage` |

## 21. reports
| GET | `/reports/revenue`, `/reports/occupancy`, `/reports/booking-funnel`, `/reports/coupon-usage`, `/reports/outstanding-dues` | `report:view`, date-range + location filters; heavy ones backed by a materialized/cached job result, not computed synchronously |

## 22. administration (admin app's additive endpoints)
| GET | `/admin/overview` | cross-location KPIs, `admin:view` |
| GET | `/audit-logs` | `audit:view`, filterable |
| GET | `/health` | liveness/readiness + queue depth/DLQ size/webhook failure rate, used by both ops tooling and the admin System Health screen |

---

## Error Codes (initial catalog, extended as implementation proceeds)

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | |
| `AUTH_TOKEN_EXPIRED` | 401 | |
| `FORBIDDEN_LOCATION_SCOPE` | 403 | caller lacks access to this location |
| `FORBIDDEN_PERMISSION` | 403 | |
| `SLOT_CONFLICT` | 409 | hold/booking overlap rejected by exclusion constraint or pre-check |
| `HOLD_EXPIRED` | 410 | reservation token no longer active |
| `HOLD_NOT_FOUND` | 404 | |
| `PAYMENT_VERIFICATION_FAILED` | 422 | webhook signature or amount mismatch |
| `COUPON_INVALID` | 422 | expired/usage-exceeded/not-applicable |
| `RATE_LIMITED` | 429 | |
| `VALIDATION_ERROR` | 400 | DTO validation failure, `details` carries field errors |

---

## Swagger/OpenAPI Governance

- Every zod schema in `packages/validations` that backs a request body/query/response is registered with an example and description via `zod-to-openapi`'s `.openapi({...})` extension; every route's entry in `apps/api/lib/openapi/registry.ts` declares its tags, summary, and the response shape/status codes it can return.
- CI step (`pnpm --filter api run build:openapi`) regenerates the OpenAPI JSON and fails the build if it differs from the committed spec file used by `packages/api-client`'s generator — prevents silent client/server drift.
