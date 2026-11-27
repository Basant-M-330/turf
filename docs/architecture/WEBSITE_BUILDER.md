# Website Builder & Domain Architecture

Status: Draft for review — Phase 1
Related: [DATABASE_SCHEMA_PLAN.md](../database/DATABASE_SCHEMA_PLAN.md) §8 · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) §4.4

## 1. Content Model

`Website` (1 per business) → `WebsitePage` (home, about, contact, legal pages + arbitrary custom pages) → `WebsiteSection` (ordered, typed content blocks). Every section has:
- `type`: one of a fixed enum (`HERO`, `GALLERY`, `LOCATIONS_LIST`, `COURTS_LIST`, `TESTIMONIALS`, `ABOUT`, `CONTACT`, `FOOTER`, `AMENITIES`, `CUSTOM_RICH_TEXT`).
- `contentJson`: a payload validated against a **per-type zod schema** shared between `packages/validations` (server-side enforcement) and the dashboard's section editor forms (client-side UX). No section type accepts raw HTML or script — `CUSTOM_RICH_TEXT` accepts a constrained rich-text document model (e.g., a small whitelisted node tree: paragraph, heading, bold/italic, link, list), rendered through fixed React components server/client-side, never `dangerouslySetInnerHTML` against user input. This directly satisfies the brief's "do not permit arbitrary executable HTML or JavaScript."

## 2. Theming

- A small catalog of built-in themes (`themeId`) ships as code (typography scale, spacing, component variants), not DB-editable in v1 — keeps the security/consistency surface small while still giving real visual variety.
- Per-business overrides layered on top of the chosen theme: `brandColorsJson` (primary/secondary/accent, validated as hex/HSL strings, never raw CSS), `typographyJson` (font family selection from an allowlist + size scale knobs), applied via CSS variables injected at render time — never arbitrary CSS injection.
- Logo/favicon/hero images reference `Media` rows (go through the same upload-validation pipeline as everything else in §6 of the PRD).

## 3. Draft vs. Published — the Core Guarantee

**Requirement (brief §11): "Unpublished website changes must not affect the live website."**

Mechanism:
- `WebsitePage`/`WebsiteSection` rows are the **working/draft copy** — every dashboard edit mutates them directly and immediately (no separate "draft" flag needed on these rows, because they are *never* read by the public path at all).
- `POST /website/publish` serializes the entire current tree (all pages + their sections, in order, fully resolved including referenced `Media` URLs) into a single `WebsiteVersion.snapshotJson` row, stamped with `publishedByUserId`/`publishedAt`.
- The **public read path** (`GET /website/public`, called by `apps/web`) resolves **only** against the most recent `WebsiteVersion` row for the business's `Website` — it never queries `WebsitePage`/`WebsiteSection` directly. This makes "drafts don't leak to production" a structural property of which table the public path is allowed to touch, not a flag that a future code change could accidentally stop checking.
- `GET /website/preview` (staff-only, authenticated) renders the **live draft tree** (current `WebsitePage`/`WebsiteSection` state) through the identical rendering components the public site uses, so staff see a true preview before publishing.
- Publishing is append-only (`WebsiteVersion` rows are never updated/deleted) — this gives a free rollback mechanism (`POST /website/publish/:versionId/restore` re-points "latest" by inserting a new version that's a copy of an old one, keeping the append-only invariant rather than allowing arbitrary history rewrites).

## 4. Caching of Published Config

- `GET /website/public` responses are cached in Redis under `website:{businessId}` (or, once custom domains resolve to a business, under the resolved business id regardless of which hostname was used) with a long TTL (e.g. 1 hour) **plus explicit invalidation on every successful publish** — so the cache is a performance optimization, never a staleness risk beyond "immediately invalidated on publish."
- `apps/web` additionally uses Next.js on-demand ISR: the publish action calls a revalidation webhook (`apps/web`'s `/api/revalidate` route, secret-protected) so edge-cached pages refresh immediately rather than waiting out their own cache window.

## 5. Domain Resolution

```
Request to apps/web with Host: playarena.in
        │
        ▼
Next.js middleware reads Host header
        │
        ▼
Redis lookup: domain:playarena.in → { businessId, websiteId } ?
        │                 │
     hit│              miss│
        │                 ▼
        │        GET /domains/resolve?hostname=playarena.in
        │        (strict join against Domain WHERE verificationStatus='VERIFIED')
        │        → cache the result (or cache a negative/"unknown host" result
        │           briefly, to avoid hammering the API with bad-hostname probes)
        ▼
Request context now carries { businessId, websiteId }
        │
        ▼
Page render calls GET /website/public (resolved for that websiteId)
```

Unverified or unknown hostnames resolve to a generic "not found"/platform landing response — never partially rendered business content, and never a fallback to "the first business" or any other implicit default.

## 6. Domain Registration & Verification Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING: owner adds domain\n(custom domain only;\nsubdomains auto-verified)
    PENDING --> VERIFIED: DNS TXT record found\nmatching verificationToken
    PENDING --> FAILED: verification job exhausts\nretries (e.g. 24h window)
    FAILED --> PENDING: owner retries after\nfixing DNS
    VERIFIED --> [*]
```

- Automatic subdomains (`{slug}.platform-domain.com`) are created VERIFIED immediately (the platform controls that DNS zone, so a TXT challenge is unnecessary — it just needs a wildcard/managed DNS entry pointing to the ingress, provisioned at Location/Business creation time or via a one-click "activate subdomain" action).
- Custom domains (`www.playarena.in`) require:
  1. Owner adds the hostname → server generates a `verificationToken`, status `PENDING`.
  2. Owner is shown the exact TXT record to add (`_turf-verify.playarena.in TXT "<token>"`) in their DNS provider.
  3. A BullMQ job (`domain-verification`) polls DNS (with backoff) for the TXT record; on match, flips to `VERIFIED`, triggers SSL provisioning.
  4. SSL: integration with the infra layer's certificate automation (e.g. Let's Encrypt via the ingress/CDN, or the CDN provider's managed TLS for custom domains) — modeled here as `Domain.sslStatus` transitioning PENDING → PROVISIONING → ACTIVE, with the actual certificate issuance delegated to infrastructure tooling rather than application code.
- `Domain.hostname` is globally unique (not just per-business) specifically to prevent two different attempted owners from both trying to verify the same hostname — the first to reach VERIFIED holds it; a second attempt on an already-VERIFIED hostname by a different business is rejected outright (a real-world safeguard even in a single-tenant v1, and required scaffolding if the platform ever supports multiple businesses per [ADR-0002](../decisions/0002-single-tenant-vs-multi-tenant.md)).

## 7. Preview & Publish Permissions

- `website:manage` permission required for all draft mutation + preview + publish actions.
- Publishing is a deliberately separate, auditable action (logged to `AuditLog` with the full snapshot diff summary) distinct from the many small draft edits leading up to it — mirrors how a CMS "save draft" vs "publish" distinction is expected by content editors.

## 8. Open Items Flagged for Later Phases

- Section-level A/B testing or scheduled publish (publish-at-a-future-time) is not in v1 scope but the `WebsiteVersion` model accommodates it later (a `scheduledFor` column and a job that flips "latest" at the right time, without any other model change).
- Custom CSS/JS injection for advanced users is explicitly **not** planned, ever, under the current security posture (brief's "do not permit arbitrary executable HTML or JavaScript" is treated as a hard constraint, not a v1-only limitation) — if ever requested, it would need a completely separate sandboxed rendering strategy (e.g., a locked-down iframe with a strict CSP) and its own security review, not a quick addition to the current section-content model.
