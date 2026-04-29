"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/lib/billing";

export interface UserAccess {
  tier: Tier;
  domains: string[];
  isExpired: boolean;
  current_period_end: string | null;
}

// Module-level cache so multiple components mounting simultaneously
// share one in-flight fetch.
let cached: Promise<UserAccess | null> | null = null;

async function fetchAccess(): Promise<UserAccess | null> {
  try {
    const res = await fetch("/api/me/access", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as UserAccess;
  } catch {
    return null;
  }
}

export function useUserAccess(): {
  loading: boolean;
  access: UserAccess | null;
} {
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cached) cached = fetchAccess();
    let mounted = true;
    cached.then((a) => {
      if (!mounted) return;
      setAccess(a);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { loading, access };
}
