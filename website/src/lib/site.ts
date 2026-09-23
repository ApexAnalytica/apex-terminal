export const SITE = {
  name: "Apex Analytica",
  product: "Manifold",
  tagline: "Ω-Critical AI Systems™",
  platformUrl: "https://manifold.apexanalytica.co",
  loginUrl: "https://manifold.apexanalytica.co/login",
  trialUrl: "https://manifold.apexanalytica.co/trial-signup",
  trustedUrl: "https://manifold.apexanalytica.co/trusted-signup",
  pricingUrl: "https://manifold.apexanalytica.co/pricing",
  email: "info@apexanalytica.co",
};

/**
 * Stripe Payment Link + Tally form placeholders for the time-bound
 * Founding 10 and Mini-Audit offers. Real URLs get swapped in by
 * Junaid after Stripe + Tally are wired. The string literal is
 * deliberately ALL-CAPS-TBD so it's grep-able and obviously fake to
 * anyone reading the code.
 *
 * Until the real URLs are dropped in, all CTAs that would normally
 * route to Stripe instead route to the existing /access form via
 * `offerCheckoutHref()` below. Visitors who try to claim a seat or
 * order an audit get a working form that emails Junaid, with a
 * `?source=...` query param so we can tell which offer they came
 * in on.
 */
export const OFFERS = {
  /** Founding 10: $1,500 year-1 locked at $9,000/yr forever. 10 seats. */
  foundingStripeUrl: "STRIPE_PAYMENT_LINK_FOUNDING_TBD",
  /** Mini-Audit LITE: $1,500 flat. 3-day automated readout — algorithmic
   *  ΩF score, top-3 decisive nodes, 3-page exec summary. */
  auditLiteStripeUrl: "STRIPE_PAYMENT_LINK_AUDIT_LITE_TBD",
  /** Mini-Audit FULL: $5,000 flat. 5-day hand-delivered review signed by
   *  Junaid + Georgios. Lite + counterfactual stress-tests on top-3 +
   *  12-page report with technical narrative + custom recommendations. */
  auditFullStripeUrl: "STRIPE_PAYMENT_LINK_AUDIT_FULL_TBD",
  /** Tally form for post-payment CSV upload (Mini-Audit intake). */
  auditTallyUrl: "TALLY_INTAKE_FORM_TBD",
  /** Hardcoded for MVP. The path to a live counter is documented in the
   *  source spec; do NOT swap to a live counter without that work. */
  foundingSeatsLeft: 6,
  foundingTotalSeats: 10,
};

/**
 * Returns the URL the offer's primary CTA should route to:
 * - if the configured URL is the all-caps placeholder, returns
 *   `/access?source=<source>` so visitors hit the working access
 *   form instead of a dead URL;
 * - if the URL has been swapped to a real Stripe / Tally URL,
 *   returns it unchanged.
 *
 * Use the companion `isPlaceholderUrl()` to decide whether the
 * resulting href should be treated as `external` (real Stripe URL)
 * or internal (the /access fallback).
 */
export function offerCheckoutHref(url: string, source: string): string {
  return isPlaceholderUrl(url)
    ? `/access?source=${encodeURIComponent(source)}`
    : url;
}

export function isPlaceholderUrl(url: string): boolean {
  return url.startsWith("STRIPE_") || url.startsWith("TALLY_");
}

export const NAV = [
  { href: "/product", label: "Product" },
  { href: "/framework", label: "Framework" },
  { href: "/domains", label: "Domains" },
  { href: "/team", label: "Team" },
  { href: "/contact", label: "Contact" },
];
