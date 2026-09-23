"use client";

/**
 * Domain card icons — small monochrome line-art SVGs that replace the
 * platform's previous emoji set on the Domain Workspace modal. Emojis
 * (⚡ 🏭 🔗 🏦 🌍 …) rendered as full-colour OS glyphs that fought the
 * dark-terminal aesthetic of the rest of the app; these icons render as
 * 1.5px stroke line-art in the domain's accent colour, matching the
 * minimal-monochrome treatment used throughout the canvas, the node
 * inspector, and the tour.
 *
 * Each icon is hand-drawn against a 24×24 viewBox with stroke set via
 * `currentColor`, so the caller controls colour via `style={{ color }}`
 * — the same pattern used by other inline-SVG icons in the codebase
 * (TTSControls, the speaker glyph). No new dep.
 *
 * To add a new icon, append a `case` to the switch and extend
 * `DomainIconName` below. Keep stroke / viewBox conventions consistent
 * so the grid stays visually uniform.
 */

import type { CSSProperties } from "react";

export type DomainIconName =
  | "bolt"        // energy
  | "factory"     // manufacturing / fertilizer
  | "chain"       // supply chain
  | "bank"        // financial contagion / finance category
  | "globe"       // sovereign risk / geopolitical category
  | "cable"       // undersea infrastructure
  | "shield"      // defense / ISR
  | "chart-bar"   // labor / growth / housing / economic category
  | "trending"    // inflation / policy
  | "dna"         // β-cell biology
  | "syringe"     // VX-880 stem-cell transplant
  | "brain"       // AI safety
  | "atom"        // frontier science
  | "wheat"       // agriculture category
  | "antenna"     // communications category
  | "flask"       // science category (broader than `atom` which is frontier-physics-specific)
  | "tower";      // infrastructure category (transmission-tower silhouette; distinct from `cable` which is undersea-specific)

interface DomainIconProps {
  name: DomainIconName;
  size?: number;
  /** Stroke colour. Defaults to currentColor so callers can drive it via
   *  `style={{ color }}` or a Tailwind text-* class. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

const STROKE_WIDTH = 1.5;

export default function DomainIcon({
  name,
  size = 20,
  color,
  className,
  style,
  title,
}: DomainIconProps) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color ?? "currentColor",
    strokeWidth: STROKE_WIDTH,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    style,
    role: "img" as const,
    "aria-label": title ?? name,
  };

  switch (name) {
    case "bolt":
      // Classic lightning bolt — angular, asymmetric. Energy.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M13 2 L4 14 L11 14 L10 22 L20 9 L13 9 Z" />
        </svg>
      );

    case "factory":
      // Building silhouette with two stepped smokestacks. Manufacturing.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M3 21 V11 L9 14 V11 L15 14 V11 L21 14 V21 Z" />
          <path d="M7 17 H8 M11 17 H12 M15 17 H16 M19 17 H20" />
          <path d="M6 11 V5 H8 V11" />
        </svg>
      );

    case "chain":
      // Two interlocked link ovals — supply chain.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M9.5 8 H8 a4 4 0 0 0 0 8 H10" />
          <path d="M14.5 16 H16 a4 4 0 0 0 0 -8 H14" />
          <path d="M8.5 12 H15.5" />
        </svg>
      );

    case "bank":
      // Classical bank facade — pediment, columns, base. Financial.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M3 9 L12 4 L21 9 Z" />
          <path d="M5 9 V18 M9 9 V18 M15 9 V18 M19 9 V18" />
          <path d="M3 20 H21" />
        </svg>
      );

    case "globe":
      // Sphere with two longitude curves + equator. Sovereign / world.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12 H21" />
          <path d="M12 3 C8 7 8 17 12 21" />
          <path d="M12 3 C16 7 16 17 12 21" />
        </svg>
      );

    case "cable":
      // Wavy undersea cable + two terminations. Infrastructure.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <circle cx="4" cy="12" r="1.5" />
          <circle cx="20" cy="12" r="1.5" />
          <path d="M5.5 12 C7 8 9 16 11 12 C13 8 15 16 17 12 L18.5 12" />
        </svg>
      );

    case "shield":
      // Heater-shield silhouette with a central vertical mark. Defense.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M12 2 L4 6 V12 C4 17 8 21 12 22 C16 21 20 17 20 12 V6 Z" />
          <path d="M12 8 V14" />
        </svg>
      );

    case "chart-bar":
      // Three rising vertical bars + baseline. Labor / growth.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M3 21 H21" />
          <rect x="5" y="13" width="3" height="7" />
          <rect x="10.5" y="9" width="3" height="11" />
          <rect x="16" y="5" width="3" height="15" />
        </svg>
      );

    case "trending":
      // Rising line + small arrowhead. Inflation / policy.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M3 17 L9 11 L13 15 L21 7" />
          <path d="M15 7 H21 V13" />
        </svg>
      );

    case "dna":
      // Two intertwined helical strands + rungs. β-cell biology.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M7 3 C7 9 17 9 17 15 C17 21 7 21 7 15" />
          <path d="M17 3 C17 9 7 9 7 15" />
          <path d="M9 6 H15 M9 10 H15 M9 14 H15 M9 18 H15" />
        </svg>
      );

    case "syringe":
      // Angled syringe — barrel, plunger, needle. VX-880 transplant.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M14 4 L20 10" />
          <path d="M9 9 L15 15" />
          <path d="M5 13 L11 19" />
          <path d="M3 21 L7 17 L10 14 L14 18 L11 21 Z" />
          <path d="M16 6 L18 8" />
        </svg>
      );

    case "brain":
      // Two cerebral hemispheres meeting at a central sulcus. AI safety.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M12 5 C10 3 6 4 6 8 C4 9 4 13 6 14 C6 18 10 19 12 17 Z" />
          <path d="M12 5 C14 3 18 4 18 8 C20 9 20 13 18 14 C18 18 14 19 12 17 Z" />
          <path d="M12 5 V17" />
        </svg>
      );

    case "atom":
      // Nucleus + three rotated orbital ellipses. Frontier physics.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <circle cx="12" cy="12" r="1.2" fill={color ?? "currentColor"} stroke="none" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" />
        </svg>
      );

    case "wheat":
      // Central stalk + three pairs of angled grain heads. Agriculture.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M12 22 V4" />
          <path d="M12 18 L8 16 M12 18 L16 16" />
          <path d="M12 13 L8 11 M12 13 L16 11" />
          <path d="M12 8 L8 6 M12 8 L16 6" />
          <path d="M12 4 L10 5.5 M12 4 L14 5.5" />
        </svg>
      );

    case "antenna":
      // Vertical mast with three concentric broadcast arcs. Communications.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M12 21 V11" />
          <path d="M9 22 H15" />
          <circle cx="12" cy="9" r="1.2" fill={color ?? "currentColor"} stroke="none" />
          <path d="M9.5 7 A 3 3 0 0 1 14.5 7" />
          <path d="M7 5 A 6 6 0 0 1 17 5" />
          <path d="M4.5 3 A 9 9 0 0 1 19.5 3" />
        </svg>
      );

    case "flask":
      // Erlenmeyer flask — narrow neck + flared body + fluid line. Science.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M9 3 H15" />
          <path d="M10 3 V10 L5 20 H19 L14 10 V3" />
          <path d="M7.5 15 H16.5" />
        </svg>
      );

    case "tower":
      // Transmission-tower silhouette — flared base, narrow top, two cross-braces.
      // Infrastructure category. Distinct from `cable` which is specifically the
      // undersea-cable iconography used by the infrastructure-resilience domain.
      return (
        <svg {...commonProps}>
          {title && <title>{title}</title>}
          <path d="M5 22 L10 3 L14 3 L19 22" />
          <path d="M7.2 14 H16.8" />
          <path d="M8.7 8 H15.3" />
          <path d="M5 22 H19" />
        </svg>
      );
  }
}
