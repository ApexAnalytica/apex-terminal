"""Join edge classification + edge->event mapping + event-study results
into a single per-edge evidence table.

The output (research/macro/output/edge_fits.json) is the artifact that
PR-B will eventually read to update graph weights and confidences in
claire_graph_data.json. We do NOT modify the graph file in this PR.

Each row contains the edge metadata, the assigned fit method, and (for
event_study edges) the supporting evidence pulled from
events_x_series.json: empirical CAR, CI, lag in source-data units, and
significance flag at the chosen horizon.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CLASSIFICATION = ROOT / "research" / "macro" / "citations" / "edge_classification.json"
EDGE_EVENT_MAP = ROOT / "research" / "macro" / "citations" / "edge_event_map.json"
EVENTS_X_SERIES = ROOT / "research" / "macro" / "output" / "events_x_series.json"
OUT = ROOT / "research" / "macro" / "output" / "edge_fits.json"


def _ev_lookup(events_rows: list[dict]) -> dict[tuple[str, str, str], dict]:
    return {
        (r["event_id"], r["frequency"], r["series"]): r
        for r in events_rows
        if "car_short" in r  # skip rows that errored
    }


def _evidence_for_edge(edge_id: str, mapping: dict, events_idx: dict) -> dict:
    entry = mapping.get(edge_id)
    if entry is None or entry.get("applies") is False:
        return {"evidence": [], "evidence_summary": None}

    evidence = []
    for sup in entry.get("supporting_events", []):
        key = (sup["event_id"], sup["frequency"], sup["target_series"])
        row = events_idx.get(key)
        if row is None:
            evidence.append({**sup, "missing_in_results": True})
            continue
        horizon = sup["horizon"]
        if horizon == "immediate":
            car = row["car_immediate"]
            offset = 0
            ci_lo, ci_hi = None, None  # immediate AR doesn't have a separate CI
            sig = None
        elif horizon == "short":
            car, offset = row["car_short"], row["short_offset"]
            ci_lo, ci_hi = row["ci_low_short"], row["ci_high_short"]
            sig = row["significant_short"]
        elif horizon == "peak":
            car, offset = row["car_peak"], row["peak_offset"]
            ci_lo, ci_hi = row["ci_low_peak"], row["ci_high_peak"]
            sig = row["significant_peak"]
        else:
            raise ValueError(f"unknown horizon {horizon!r}")
        evidence.append({
            **sup,
            "car": car,
            "offset": offset,
            "ci_low": ci_lo,
            "ci_high": ci_hi,
            "significant": sig,
            "patell_t": row.get("patell_t"),
            "n_estimation": row.get("n_estimation"),
        })

    if not evidence:
        return {"evidence": [], "evidence_summary": None}

    cars = [e["car"] for e in evidence if "car" in e and e["car"] is not None]
    sigs = [e.get("significant") for e in evidence]
    summary = {
        "n_supporting_events": len(evidence),
        "mean_abs_car": (sum(abs(c) for c in cars) / len(cars)) if cars else None,
        "any_significant": any(s for s in sigs if s is not None),
    }
    return {"evidence": evidence, "evidence_summary": summary}


def main() -> None:
    classification = json.loads(CLASSIFICATION.read_text())
    events_x = json.loads(EVENTS_X_SERIES.read_text())
    edge_event_map_raw = json.loads(EDGE_EVENT_MAP.read_text())
    edge_event_map = {e["edge_id"]: e for e in edge_event_map_raw["edge_to_fit"]}

    events_idx = _ev_lookup(events_x["results"])

    rows = []
    method_counts = {"event_study": 0, "capacity_citation": 0, "expert_prior": 0}
    evidence_counts = {"with_evidence": 0, "without_evidence": 0}

    # The rule-based classifier in classify_edges.py uses ID matching
    # against the disruption-event asset list, but the graph node IDs
    # don't match the event-asset names. The hand-curated edge_event_map
    # is therefore the authoritative source for which edges have
    # event-study evidence; if an edge is in the map (and applies==true
    # by default), we promote it to event_study here.
    for entry in classification["edges"]:
        edge_id = entry["edge_id"]
        map_entry = edge_event_map.get(edge_id)

        if map_entry and map_entry.get("applies", True):
            method = "event_study"
            ev = _evidence_for_edge(edge_id, edge_event_map, events_idx)
        else:
            method = entry["fit_method"]
            ev = {"evidence": [], "evidence_summary": None}

        # event_study edges with no usable evidence rows fall back to
        # expert_prior so downstream consumers don't think evidence exists.
        if method == "event_study" and not ev["evidence"]:
            method = "expert_prior"

        if ev["evidence"]:
            evidence_counts["with_evidence"] += 1
        else:
            evidence_counts["without_evidence"] += 1

        method_counts[method] += 1
        rows.append({**entry, "fit_method": method, **ev})

    # Add edges from edge_event_map that are not in classification
    # (sanity: there shouldn't be any, but flag it).
    classified_ids = {e["edge_id"] for e in classification["edges"]}
    orphans = [eid for eid in edge_event_map if eid not in classified_ids]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "method_counts": method_counts,
        "evidence_counts": evidence_counts,
        "orphan_mappings": orphans,
        "edges": rows,
    }, indent=2))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"method_counts: {method_counts}")
    print(f"evidence_counts: {evidence_counts}")
    if orphans:
        print(f"WARN: orphan mapping entries (no graph edge): {orphans}")


if __name__ == "__main__":
    main()
