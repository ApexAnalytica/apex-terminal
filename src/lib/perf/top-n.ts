// ─── Partial top-N selection ────────────────────────────────────────
//
// Returns the n items with the highest `key(item)` in O(N · k) for
// small k — strictly cheaper than [...arr].sort().slice(0, n) which
// is O(N log N) and (worse) allocates a fresh array of length N just
// to discard most of it. Used for top-Ω rankings (k=5..6) on graphs
// with hundreds of nodes.
//
// Result is returned in descending key order. Ties keep insertion
// (first-seen) order — matches what stable sort would produce for the
// same data, so swapping `sort().slice` callsites is behaviour-preserving.

export function topByKey<T>(
  items: readonly T[],
  key: (item: T) => number,
  n: number,
): T[] {
  if (n <= 0 || items.length === 0) return [];
  if (items.length <= n) {
    // Tiny inputs: sort directly — at this size the overhead of a
    // bounded-buffer scan isn't worth it.
    return [...items].sort((a, b) => key(b) - key(a));
  }

  // Bounded-buffer scan: keep `top` sorted descending, length ≤ n.
  // For each item, drop it if it can't beat the current floor; else
  // insert at the right position and pop the floor if we exceed n.
  const top: { item: T; k: number }[] = [];
  let floor = -Infinity;
  for (const item of items) {
    const k = key(item);
    if (top.length === n && k <= floor) continue;
    // Linear insert is fine for small n (n ≤ ~10); for larger n a
    // proper binary-heap would beat this, but our callsites are k≤6.
    let i = top.length;
    while (i > 0 && top[i - 1].k < k) i--;
    top.splice(i, 0, { item, k });
    if (top.length > n) top.pop();
    floor = top[top.length - 1].k;
  }
  return top.map((t) => t.item);
}
