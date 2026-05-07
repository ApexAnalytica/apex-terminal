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
 */
export const OFFERS = {
  /** Founding 10: $1,500 year-1 locked at $9,000/yr forever. 10 seats. */
  foundingStripeUrl: "STRIPE_PAYMENT_LINK_FOUNDING_TBD",
  /** Mini-Audit: $1,500 flat, single price, 5-day causal-fragility readout. */
  auditStripeUrl: "STRIPE_PAYMENT_LINK_AUDIT_TBD",
  /** Tally form for post-payment CSV upload (Mini-Audit intake). */
  auditTallyUrl: "TALLY_INTAKE_FORM_TBD",
  /** Hardcoded for MVP. The path to a live counter is documented in the
   *  source spec; do NOT swap to a live counter without that work. */
  foundingSeatsLeft: 6,
  foundingTotalSeats: 10,
};

export const NAV = [
  { href: "/product", label: "Product" },
  { href: "/framework", label: "Framework" },
  { href: "/domains", label: "Domains" },
  { href: "/team", label: "Team" },
  { href: "/contact", label: "Contact" },
];
