"""Apply graph_updates.json to src/lib/graph-data.ts.

Edits weight, lag, and confidence on each named edge. Each edge is
expected to be on its own line in `graph-data.ts` (verified at the time
of writing) — we match by `id: "<edge_id>"` substring and replace the
three numeric fields on that line.

Refuses to apply if any update target edge_id is not found in
graph-data.ts: that prevents silent typos from being missed.

Idempotent: running twice produces the same file as running once.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UPDATES = ROOT / "research" / "macro" / "output" / "graph_updates.json"
GRAPH_TS = ROOT / "src" / "lib" / "graph-data.ts"


def _replace_field(line: str, field: str, value) -> str:
    """Replace `<field>: <number>` on the given line."""
    pattern = re.compile(rf"({field}:\s*)(-?\d+(?:\.\d+)?)")
    return pattern.sub(rf"\g<1>{value}", line, count=1)


def main() -> None:
    plan = json.loads(UPDATES.read_text())
    updates_by_id = {u["edge_id"]: u for u in plan["updates"]}

    src_lines = GRAPH_TS.read_text().splitlines(keepends=True)
    out_lines: list[str] = []
    matched: set[str] = set()

    edge_id_pattern = re.compile(r'id:\s*"([\w]+__[\w]+)"')

    for line in src_lines:
        m = edge_id_pattern.search(line)
        if m and m.group(1) in updates_by_id:
            edge_id = m.group(1)
            u = updates_by_id[edge_id]
            new = line
            new = _replace_field(new, "weight", u["new_weight"])
            new = _replace_field(new, "lag", u["new_lag"])
            new = _replace_field(new, "confidence", u["new_confidence"])
            out_lines.append(new)
            matched.add(edge_id)
        else:
            out_lines.append(line)

    missing = sorted(set(updates_by_id) - matched)
    if missing:
        raise SystemExit(
            f"refused to write: {len(missing)} edge_id(s) in update plan "
            f"not found in graph-data.ts:\n  " + "\n  ".join(missing)
        )

    GRAPH_TS.write_text("".join(out_lines))
    print(f"applied {len(matched)} updates to {GRAPH_TS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
