"""Classify each graph edge into one of three empirical-fit methods.

NOTE on source file: this script reads ``claire_graph_data.json``, which
is a 65-node / 69-edge subset (the GCC-energy / petrochem cluster) of
the live application graph at ``src/lib/graph-data.ts`` (318 edges, 167
nodes). All node and edge IDs we touch are preserved verbatim across
both files, so the per-edge evidence we produce here keys cleanly into
the live graph when consumed by PR-B. See ``../README.md`` for the
follow-up plan to extend the classifier to the full live graph.


Methods
-------

  event_study
      Source is a facility/asset that was disrupted in at least one of
      the recorded events in public/datasets/claire/disruption_events.json,
      AND the target is a price-sensitive node (economic/finance category
      or an export/global-supply node). Weight and lag come from event
      studies on commodity prices around the recorded events.

  capacity_citation
      Source-target pair is a facility-to-facility throughput
      relationship (e.g., pipeline -> refinery, gas plant -> distribution
      system). Weight and lag come from published nameplate capacity and
      operational disclosures (Aramco IR, EIA country briefs, S&P Platts).
      No statistical fitting; the empirical content is auditable
      provenance to a primary source.

  expert_prior
      Neither method directly applies. Weight retained as expert prior
      with low confidence; flagged for follow-up data acquisition.

The classification is deterministic given the inputs. A small `OVERRIDES`
dict at the bottom of this file captures edge IDs whose rule-based
classification we manually correct.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GRAPH = ROOT / "claire_graph_data.json"
EVENTS = ROOT / "public" / "datasets" / "claire" / "disruption_events.json"
OUT = ROOT / "research" / "macro" / "citations" / "edge_classification.json"

PRICE_TARGETS_CATEGORY = {"economic", "finance"}
# Node IDs treated as price-sensitive even if their category isn't economic/finance.
PRICE_TARGETS_ID = {
    "saudi_crude_exports",
    "global_oil_supply",
    "qatar_lng_exports",
}

# Rule-based output may be wrong for a handful of edges. Capture them here
# rather than complicating the rule.
OVERRIDES: dict[str, str] = {
    # populated as needed once the auto-pass is reviewed
}


def main() -> None:
    nodes = {n["id"]: n for n in json.loads(GRAPH.read_text())["nodes"]}
    edges = json.loads(GRAPH.read_text())["edges"]
    events = json.loads(EVENTS.read_text())

    # set of node IDs that have ever been disrupted in our event log
    disrupted_assets: set[str] = set()
    asset_events: dict[str, list[str]] = {}
    for ev in events:
        for asset in ev["affected_assets"]:
            disrupted_assets.add(asset)
            asset_events.setdefault(asset, []).append(ev["event_id"])

    out = []
    counts = {"event_study": 0, "capacity_citation": 0, "expert_prior": 0}

    for e in edges:
        s = nodes.get(e["source"], {})
        t = nodes.get(e["target"], {})

        target_is_price = (
            t.get("category") in PRICE_TARGETS_CATEGORY
            or t["id"] in PRICE_TARGETS_ID
        )
        source_disrupted = e["source"] in disrupted_assets

        if source_disrupted and target_is_price:
            method = "event_study"
        elif (
            s.get("category") in {"infrastructure", "manufacturing", "energy"}
            and t.get("category") in {"infrastructure", "manufacturing"}
        ):
            method = "capacity_citation"
        else:
            method = "expert_prior"

        method = OVERRIDES.get(e["id"], method)
        counts[method] += 1

        out.append({
            "edge_id": e["id"],
            "source": e["source"],
            "target": e["target"],
            "source_label": s.get("label", e["source"]),
            "target_label": t.get("label", e["target"]),
            "source_category": s.get("category"),
            "target_category": t.get("category"),
            "current_weight": e["weight"],
            "current_lag": e["lag"],
            "current_confidence": e["confidence"],
            "fit_method": method,
            "events_for_source": asset_events.get(e["source"], []),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"edges": out, "counts": counts}, indent=2))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"counts: {counts}  total={sum(counts.values())}")


if __name__ == "__main__":
    main()
