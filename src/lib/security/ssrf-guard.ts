// ─── SSRF guard for server-side URL fetches ────────────────────────
//
// `/api/news/fetch-url` accepts a user-supplied URL and fetches it
// from the server. Without this guard a caller can probe internal
// services and cloud-metadata endpoints — the AWS / GCP metadata IPs
// (169.254.169.254, metadata.google.internal) hand out temporary
// instance credentials in plain JSON. Any internal Supabase / Vercel
// orchestration endpoint reachable from the runtime is also fair game.
//
// Defence has two layers:
//   1. Hostname-string heuristics — block obvious bad names without
//      a DNS roundtrip (localhost, .local, .internal, the GCP / Azure
//      metadata aliases, IPv4 / IPv6 literals in private ranges).
//   2. DNS resolution — for everything else, look up the host and
//      reject if any returned address lands in a private range. This
//      catches public DNS names that resolve to private IPs
//      (e.g. metadata.google.internal → 169.254.169.254, or any
//      service-discovery name behind a corporate split-horizon DNS).
//
// Known TOCTOU window: between dns.lookup and fetch, an attacker
// controlling the DNS server could return a public IP on the lookup
// and a private one on the fetch. Closing that window properly
// requires resolving + fetching by IP + setting the Host header,
// which breaks SNI / virtual-hosting on the upstream. For Manifold's
// threat model (the endpoint is for fetching news articles from the
// public web) the heuristic + DNS check is the right altitude;
// revisit if that endpoint ever processes higher-trust content.

import { isIP } from "node:net";
import dns from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set<string>([
  "localhost",
  "metadata.google.internal", // GCP instance metadata
  "metadata.azure.com", // Azure instance metadata
  "instance-data", // AWS short alias (some VPCs)
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".intranet",
];

/** RFC 1918, loopback, link-local, multicast, "this network", reserved. */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const oct = parts.map((p) => Number(p));
  if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = oct;
  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 10) return true; // 10.0.0.0/8 — RFC 1918
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local (AWS / GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — RFC 1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a >= 224) return true; // 224.0.0.0/3 — multicast + reserved
  return false;
}

/** IPv6 loopback, unique-local, link-local, multicast, IPv4-mapped private. */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true; // fe80::/10 link-local
  }
  if (lower.startsWith("ff")) return true; // ff00::/8 multicast
  const mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export interface SsrfGuardResult {
  /** When non-null, the request must be rejected. Safe to surface to
   *  the user — none of the messages leak which internal service was
   *  probed. */
  reason: string | null;
}

/**
 * Validate a parsed URL against SSRF policy. Returns `{ reason: null }`
 * to allow, or `{ reason: "..." }` to block. Async because non-literal
 * hostnames trigger a DNS lookup.
 */
export async function ssrfGuard(parsed: URL): Promise<SsrfGuardResult> {
  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { reason: "Hostname not allowed" };
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { reason: "Hostname not allowed" };
    }
  }

  // Strip brackets that URL preserves on IPv6 hostnames.
  const stripped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const version = isIP(stripped);
  if (version === 4) {
    return isPrivateIPv4(stripped)
      ? { reason: "Private IP addresses are not allowed" }
      : { reason: null };
  }
  if (version === 6) {
    return isPrivateIPv6(stripped)
      ? { reason: "Private IP addresses are not allowed" }
      : { reason: null };
  }

  // Hostname → DNS lookup. dns.lookup honours /etc/hosts and the
  // platform resolver, so it catches OS-level overrides too.
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address, family } of addresses) {
      if (family === 4 && isPrivateIPv4(address)) {
        return {
          reason: "Hostname resolves to a private IP address",
        };
      }
      if (family === 6 && isPrivateIPv6(address)) {
        return {
          reason: "Hostname resolves to a private IP address",
        };
      }
    }
    if (addresses.length === 0) {
      return { reason: "Hostname did not resolve" };
    }
    return { reason: null };
  } catch {
    // DNS error — the fetch would have failed anyway. Block here so
    // we never reach the network step on something unresolvable
    // (some DNS-error edge cases on certain runtimes get retried as
    // IPv6-only or vice versa, which we'd rather not race).
    return { reason: "Hostname could not be resolved" };
  }
}
