"""Transform per-edge evidence + capacity citations into a graph-update plan.

Reads
  research/macro/output/edge_fits.json
  research/macro/citations/capacity_citations.json

Writes
  research/macro/output/graph_updates.json

Each row in the output names an edge_id and the new (weight, lag,
confidence) plus the reason. apply_graph_update.py consumes this and
edits src/lib/graph-data.ts in place.

Transform rules (kept simple and explicit so they can be reviewed and
revised without touching the application code):

  Capacity-cited edges
  --------------------
  weight, lag, confidence come directly from capacity_citations.json.
  No statistical interpretation; the citation is the empirical content.

  Event-study edges with significant evidence
  -------------------------------------------
  Pick the highest-quality supporting evidence row (significant > not).
  Translate |CAR| onto a frequency-typical [0.3, 0.9] strength scale:

      weight = clip(0.3 + 0.6 * min(|CAR| / scale, 1), 0.3, 0.9)

  where scale is the magnitude of a "strong but typical" event for that
  data frequency:

      daily commodity:    0.15  (15% log-return = strong daily move)
      monthly commodity:  0.40  (40% over months = strong supply shock)
      monthly macro:      0.05  (5% CPI/PPI move = strong pass-through)

  lag in graph epochs (the simulator's discrete time unit) follows the
  observed offset:

      daily, offset <= 5     -> lag = 1
      monthly, offset 1-3    -> lag = 2
      monthly, offset >= 4   -> lag = 3

  confidence:  0.85 if significant and n_estimation >= 27, else 0.75.

  Event-study edges with null evidence
  ------------------------------------
  Significant evidence with CI overlapping zero says: the empirical
  effect is smaller than the prior assumed. We DO NOT reduce the
  weight to zero (negative result is not the same as "no effect"); we
  set a soft floor:

      weight = min(current_weight, 0.4)
      confidence = 0.5

  Edges with no evidence at all
  -----------------------------
  Untouched. Existing weight/lag/confidence pass through unchanged.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EDGE_FITS = ROOT / "research" / "macro" / "output" / "edge_fits.json"
CAPACITY = ROOT / "research" / "macro" / "citations" / "capacity_citations.json"
OUT = ROOT / "research" / "macro" / "output" / "graph_updates.json"

FREQUENCY_SCALES = {
    "daily": 0.15,
    "monthly": 0.40,
    "macro": 0.05,
}


def _pick_evidence(rows: list[dict]) -> dict | None:
    """Return the strongest evidence row from a list."""
    if not rows:
        return None
    sig_rows = [r for r in rows if r.get("significant")]
    if sig_rows:
        # Among significant rows, pick the largest |CAR|
        return max(sig_rows, key=lambda r: abs(r.get("car") or 0))
    # No significant rows: fall back to largest |CAR| (could still be null)
    return max(rows, key=lambda r: abs(r.get("car") or 0))


def _weight_from_car(car: float, frequency: str) -> float:
    scale = FREQUENCY_SCALES.get(frequency, 0.20)
    relative = abs(car) / scale
    return round(min(0.3 + 0.6 * min(relative, 1.0), 0.9), 2)


def _lag_from_offset(offset: int, frequency: str) -> int:
    if frequency == "daily":
        return 1 if offset <= 5 else 2
    # monthly / macro
    if offset <= 3:
        return 2
    return 3


def _confidence(significant: bool, n_estimation: int | None) -> float:
    if not significant:
        return 0.5
    return 0.85 if (n_estimation or 0) >= 27 else 0.75


def main() -> None:
    fits = json.loads(EDGE_FITS.read_text())
    capacity = json.loads(CAPACITY.read_text())

    updates = []

    # 1) Capacity-cited edges (audit-grade, highest priority)
    capacity_ids = set()
    for c in capacity["citations"]:
        capacity_ids.add(c["edge_id"])
        updates.append({
            "edge_id": c["edge_id"],
            "method": "capacity_citation",
            "new_weight": c["weight"],
            "new_lag": c["lag_days"] if c["lag_days"] in (1, 2, 3) else 1,
            "new_confidence": c["confidence"],
            "reason": f"Capacity citation: {c['primary_source']['publisher']} ({c['primary_source']['year']})",
        })

    # 2) Event-study edges with empirical evidence
    for edge in fits["edges"]:
        if edge["edge_id"] in capacity_ids:
            continue  # capacity citation takes precedence
        if edge.get("fit_method") != "event_study":
            continue
        chosen = _pick_evidence(edge.get("evidence", []))
        if chosen is None:
            continue

        car = chosen.get("car")
        freq = chosen.get("frequency")
        offset = chosen.get("offset", 0)
        sig = bool(chosen.get("significant"))
        n_est = chosen.get("n_estimation")
        cur_weight = edge.get("current_weight")

        if sig and car is not None and freq is not None:
            new_weight = _weight_from_car(car, freq)
            reason = (
                f"Significant {freq} CAR={car:+.4f} @ offset {offset} "
                f"(event {chosen['event_id']}, series {chosen.get('target_series')})"
            )
        else:
            # null evidence: cap weight at 0.4 if currently higher
            new_weight = min(cur_weight, 0.4) if cur_weight is not None else 0.4
            new_weight = round(new_weight, 2)
            reason = (
                f"Null {freq} CAR={car:+.4f} @ offset {offset} "
                f"(CI overlaps zero; weight capped)"
                if car is not None
                else "No usable evidence row"
            )

        new_lag = _lag_from_offset(offset, freq) if freq else 1
        new_conf = _confidence(sig, n_est)

        updates.append({
            "edge_id": edge["edge_id"],
            "method": "event_study",
            "new_weight": new_weight,
            "new_lag": new_lag,
            "new_confidence": new_conf,
            "reason": reason,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "rules_doc": "see scripts/build_graph_update.py docstring",
        "frequency_scales": FREQUENCY_SCALES,
        "updates": updates,
    }, indent=2))

    by_method = {}
    for u in updates:
        by_method[u["method"]] = by_method.get(u["method"], 0) + 1
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"updates: {len(updates)} ({by_method})")


if __name__ == "__main__":
    main()
