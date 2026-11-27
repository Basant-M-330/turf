/**
 * Per-deployment branding and feature flags. This app is deployed fresh per client
 * (white-label), so these are the knobs that change between clients — set via env vars,
 * never hardcoded in pages/components.
 */
export const brandName = process.env.BRAND_NAME ?? "Turf Booking";
export const brandLegalName = process.env.BRAND_LEGAL_NAME ?? brandName;
export const supportEmail = process.env.SUPPORT_EMAIL ?? "support@example.com";

/** Whether this deployment manages multiple courts (court picker, admin court list) vs one. */
export const multiCourtEnabled = process.env.MULTI_COURT === "true";
