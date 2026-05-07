/**
 * SiteBackground — site-wide ambient causal-graph backdrop.
 *
 * Mounts the HeroBackground SVG once at the layout level inside a
 * fixed full-viewport container so the network sits behind every
 * page and doesn't scroll with the content. Lower opacity than the
 * homepage hero version since it has to coexist with all page
 * surfaces, not just the hero.
 */

import HeroBackground from "@/components/visuals/HeroBackground";

export default function SiteBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none opacity-[0.28]"
    >
      <HeroBackground />
    </div>
  );
}
