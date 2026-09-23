"""Probe FRED reachability and report which path is available.

Run before assuming FRED data is available in your environment:

    python -m research.macro.scripts.probe_fred

Prints a per-path verdict + a sample of the data on the working path.
Useful when running on a new machine, in CI, or in a sandbox where
network policy may block specific endpoints.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research.macro.datasets.fred import (  # noqa: E402
    fetch_fred_series,
    FREDUnreachableError,
    GRAPH_SERIES,
)


PROBE_SERIES = "CPIENGSL"  # CPI Energy — small, well-known series


def main() -> int:
    print(f"=== FRED probe (series={PROBE_SERIES}) ===\n")
    api_key = os.environ.get("FRED_API_KEY")
    print(f"FRED_API_KEY env var: {'present' if api_key else 'absent'}\n")

    # Path 1: API
    if api_key:
        try:
            url = (
                f"https://api.stlouisfed.org/fred/series/observations"
                f"?series_id={PROBE_SERIES}&api_key={api_key}&file_type=json&limit=1"
            )
            r = requests.get(url, timeout=8)
            r.raise_for_status()
            print(f"[PASS] FRED API reachable (status {r.status_code})")
        except Exception as exc:
            print(f"[FAIL] FRED API: {exc}")
    else:
        print("[SKIP] FRED API path (no key set; register free at "
              "https://fred.stlouisfed.org/docs/api/api_key.html)")

    # Path 2: CSV
    try:
        url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={PROBE_SERIES}"
        r = requests.get(url, timeout=8)
        r.raise_for_status()
        print(f"[PASS] FRED public CSV reachable (status {r.status_code})")
    except Exception as exc:
        print(f"[FAIL] FRED public CSV: {exc}")

    # End-to-end: actually fetch via the production code path.
    print("\n=== End-to-end fetch via fetch_fred_series() ===")
    try:
        df = fetch_fred_series(PROBE_SERIES)
        print(f"[PASS] got {len(df)} obs, range {df.index.min().date()} → {df.index.max().date()}")
        print("\nlatest 3:")
        print(df.tail(3).to_string())
        print(f"\n{len(GRAPH_SERIES)} graph-node mappings available; ready to use in fits.")
        return 0
    except FREDUnreachableError as exc:
        print(f"[FAIL] {exc}")
        print(
            "\nNeither FRED path worked from this environment. To fix:\n"
            "  1. Get a free API key at https://fred.stlouisfed.org/docs/api/api_key.html\n"
            "  2. export FRED_API_KEY=...\n"
            "  3. Re-run.\n"
            "If FRED is firewalled here entirely, fitters will fall back to the\n"
            "IMF Pink Sheet mirror (already used in the existing edge_fits)."
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
