# ADR-0002: Single-Tenant Product, Multi-Tenant-Ready Data Model

Status: Accepted
Date: 2026-11-27

## Context
The brief is explicit: "Build a single-business turf management platform" — not a marketplace where multiple businesses self-onboard. At the same time, several entities (`Business`, `Domain`, `Website`) are exactly the entities a future multi-tenant version would need to partition by tenant.

## Decision
Build strictly for one `Business` row in v1 (enforced in application logic — e.g., business-creation/onboarding flows are not exposed as a public self-serve feature), but keep every table's lineage traceable to `businessId` and keep `Domain.hostname` globally unique rather than unique-per-business. This costs nothing in v1 (there's one business, so "global" and "per-business" uniqueness are equivalent) and avoids a breaking migration if the product direction changes later.

## Consequences
- No multi-tenant billing, isolation-by-tenant query middleware, or tenant-admin-of-tenants UI is built now — that would be over-engineering for a stated single-business requirement.
- Every new table added in later phases should still include a `businessId` lineage path (even if indirect, e.g. via `locationId → businessId`) as a matter of convention, reviewed in PRs.
