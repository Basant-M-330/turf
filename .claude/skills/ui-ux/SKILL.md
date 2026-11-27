---
name: ui-ux
description: Design system and UI patterns for this turf booking app (Next.js App Router + Tailwind CSS v4 + lucide-react). Load this before writing or editing ANY page, component, form, or admin screen in this repo — new feature, redesign, a single button, or a whole page — so new UI matches what's already shipped instead of drifting into a different look. Also use it when the user asks to "make it look nicer", "match the existing style", add a button/card/badge/form, or build an admin screen, even if they don't say "design" or "UI" explicitly.
---

# UI/UX for this app

This app already has a deliberate visual language — established across the customer-facing
booking flow and the admin panel. The point of this skill is to keep extending it, not to
reinvent it per page. Reuse the patterns below directly; don't invent a new color, radius, or
button style for a one-off case unless the existing system genuinely has no answer for it.

## Why this system looks the way it does

The customer side needed to feel more like a real consumer product (energetic, photo-led,
confidence-building — think a booking app, not an internal tool) while the admin side needed to
stay fast and legible for someone running a front desk. That split is intentional: **spend more
visual effort on customer-facing pages, less on admin.** Admin screens get the same color
language and card/button vocabulary, but skip hero banners, big photography, and decorative
icon rows — those are a customer-facing investment, not a general "make it pretty" rule.

## Color palette

- **Primary/brand**: `emerald-600` (buttons, active links, icons), `emerald-700` for hover/text
  emphasis, `emerald-50` for soft backgrounds behind emerald icons or badges.
- **Price / monetary emphasis & "pending" warnings**: `amber` — `bg-amber-50 text-amber-700` for
  a price tag or a status still waiting on something, `bg-amber-400 text-gray-900` for a bold
  badge that needs to pop against a dark photo background (see Hero below).
- **Destructive actions**: `red-600` text (often text-only, no fill — e.g. a "Cancel" link in a
  list), or `border-red-300 text-red-600` for an outlined destructive button.
- **Neutral base**: `white` surfaces on a `gray-50` page background, `gray-200` borders,
  `gray-500`/`gray-600` secondary text, `gray-900` primary text/headings.
- **Status is color-coded, not just labeled.** When showing a booking/order/request status,
  reuse `src/components/status-pill.tsx`'s mapping rather than inventing new colors:
  `HOLD`→amber, `CONFIRMED`→emerald, `PARTIALLY_PAID`→blue, `CANCELLED`/`EXPIRED`→gray,
  `COMPLETED`→deeper emerald (`bg-emerald-100 text-emerald-800`). If a new status/state needs a
  pill, slot it into this same amber/emerald/blue/gray vocabulary rather than adding a new hue.

## Typography

- Font is Geist Sans, loaded once in `src/app/layout.tsx` via `next/font/google` — never add
  another font or inline `font-family`.
- **Hero/page headlines**: `text-3xl sm:text-5xl font-extrabold tracking-tight`.
- **Section headings / card titles**: `font-semibold text-gray-900`, no larger than `text-lg`
  outside of a hero.
- **Small eyebrow/category labels** (a badge above a headline, a sport-type tag): `text-xs
  font-bold uppercase tracking-wide`.
- Body copy: `text-sm text-gray-600` (secondary) or `text-gray-700` (primary paragraph text).

## Cards and surfaces

Default card: `rounded-xl border border-gray-200 bg-white p-5 shadow-sm`. Use `rounded-2xl` for
slightly larger feature cards (e.g. a 3-up grid of callouts) and `rounded-3xl` only for the
full-bleed hero image. If the card is clickable/a link, add
`transition hover:border-emerald-400 hover:shadow-md` (see `src/app/admin/page.tsx`'s dashboard
cards). Don't use plain `shadow` or `shadow-lg` on ordinary cards — `shadow-sm` is the house
weight; reserve anything heavier for the hero banner only.

## Buttons

Pick the variant by how important the action is, not by what looks nice in isolation:

- **Primary** (the one thing you want done on this screen): `bg-emerald-600 text-white
  hover:bg-emerald-700`. Radius depends on context — `rounded-md`/`rounded-lg` for a form
  submit, `rounded-full` for a pill CTA (e.g. "Book a slot" in the hero).
- **Secondary** (a real alternative, still encouraged): `border border-emerald-600
  text-emerald-700 hover:bg-emerald-50`.
- **Tertiary/ghost** (available but not pushed): `border border-gray-300 text-gray-700
  hover:bg-gray-50`.
- **Destructive**: `text-red-600 hover:text-red-800` as a plain text link for low-stakes removes
  (e.g. a list row's "Remove"), or `border border-red-300 text-red-600 hover:bg-red-50` when it
  needs to look like a real button (e.g. "Cancel booking").

Always add `transition` and a `disabled:opacity-50` state on anything that triggers a network
request.

## Icons

`lucide-react` only — don't pull in a second icon set or hand-roll inline SVGs for things
lucide already covers. Typical sizes are `h-4 w-4` inline next to text, `h-5 w-5`/`h-6 w-6` for
a standalone icon. For a feature/step callout (an icon that represents a whole card's idea, not
just decorating a label), put it in a colored circle: `flex h-10 w-10 items-center
justify-center rounded-full bg-emerald-50 text-emerald-700` (see `src/components/how-it-works.tsx`).

## Hero / banner pattern (customer-facing pages only)

For a page that introduces one "thing" (a court, a venue) with a photo, use the pattern in
`src/components/hero.tsx`:

1. `relative overflow-hidden rounded-3xl shadow-lg` wrapper, `aspect-[16/10] sm:aspect-[16/7]`
   image area, image `object-cover`.
2. A dark gradient over the image so white text stays legible:
   `absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10`.
3. Content anchored `absolute inset-x-0 bottom-0 p-6 sm:p-10`: an eyebrow badge
   (`bg-amber-400 text-gray-900 rounded-full px-3 py-1 text-xs font-bold uppercase
   tracking-wide`), the headline (`text-3xl sm:text-5xl font-extrabold tracking-tight
   text-white`), optional description (`text-white/85`), then an emerald pill CTA
   (`bg-emerald-500 hover:bg-emerald-400 rounded-full`, white text).
4. If there's no real photo yet, fall back to a gradient block
   (`bg-gradient-to-br from-emerald-700 via-emerald-800 to-gray-900`) instead of leaving a gap
   or using a generic gray placeholder — it should still feel branded with nothing to show.

Don't reuse this pattern for admin pages or for a page with more than one "subject" (a list of
things) — it's specifically for "here is the one thing this page is about."

## Quick-fact / stat chips

For a few short facts next to each other near the top of a page (price, duration, hours,
rating) use small white pill badges, not a table or a sentence: `inline-flex items-center
gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1
ring-gray-200`, each with a small `text-emerald-600` icon. Only put real, currently-true data in
these — see "Don't fabricate" below.

## Forms

- Label: `block text-sm font-medium text-gray-700`.
- Input: `rounded-md border border-gray-300 px-3 py-2`, with
  `focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500`.
- For a compact, inline control (a date picker next to other controls, not a full-width form
  field), use a pill shape instead: `rounded-full` with a leading icon positioned
  `absolute left-3 top-1/2 -translate-y-1/2`.

## Don't fabricate

Several real decisions were made during this app's design pass that matter more than they
might look:

- **Never invent stats, ratings, or social proof** ("500+ bookings", "4.9★") to fill out a quick
  facts row or a hero — if the data doesn't exist yet, leave the slot out rather than making up
  a number. Only show facts actually sourced from the database (price, duration, hours,
  sport type).
- **Admin/internal screens stay functional, not decorative.** A bookings list, a staff table, an
  audit log — these get the same colors, cards, and buttons as everywhere else, but skip hero
  banners, photography, and icon-badge callouts. Those are a deliberate customer-facing
  investment, not a baseline every screen needs.
- **Don't add a decorative element that isn't carrying real information.** If you're reaching
  for a gradient blob, an extra icon, or a stat chip just to make a section feel fuller, that's
  a sign to stop rather than push through.
