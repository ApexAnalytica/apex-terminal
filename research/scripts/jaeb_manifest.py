"""Catalog every file inside each JAEB .zip in research/datasets/_cache/jaeb/.

Read-only introspection. Does not extract permanently, does not modify or move
the raw archives. Writes one JSON manifest to research/datasets/jaeb_manifest.json
so we can decide, per dataset, which tables and columns are worth building
slim/aggregate extracts from in Phase 2.

For every member of every zip we record:
 - file name, extension, uncompressed size
 - if it's a tabular file we can open (csv, txt, sas7bdat, xpt, rds), we record
   column names, row count, and the detected date column's min/max (if any)
 - otherwise we just note the format and size

Run from repo root:
    python research/scripts/jaeb_manifest.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime
from typing import Any

import pandas as pd


CACHE_DIR = os.path.join(
    os.path.dirname(__file__), "..", "datasets", "_cache", "jaeb",
)
OUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "datasets", "jaeb_manifest.json",
)

TABULAR_EXTS = {".csv", ".txt", ".tsv", ".sas7bdat", ".xpt", ".rds"}
MAX_SAMPLE_ROWS = 50_000  # cap per-file row scan to keep manifest runtime bounded


def _detect_date_column(df: pd.DataFrame) -> tuple[str | None, str | None, str | None]:
    """Return (col_name, min_iso, max_iso) for the first parseable date column, else (None, None, None)."""
    for col in df.columns:
        if df[col].dtype == object or "date" in col.lower() or "time" in col.lower() or "dt" in col.lower():
            try:
                parsed = pd.to_datetime(df[col], errors="coerce", utc=False)
                non_null = parsed.dropna()
                if len(non_null) >= max(5, int(0.1 * len(df))):
                    return col, str(non_null.min()), str(non_null.max())
            except Exception:
                continue
    return None, None, None


def _introspect_tabular(name: str, raw: bytes) -> dict[str, Any]:
    ext = os.path.splitext(name)[1].lower()
    info: dict[str, Any] = {"introspection": "attempted"}
    try:
        if ext in (".csv", ".txt", ".tsv"):
            sep = "," if ext == ".csv" else ("\t" if ext == ".tsv" else None)
            df = pd.read_csv(io.BytesIO(raw), sep=sep, nrows=MAX_SAMPLE_ROWS, engine="python")
        elif ext == ".sas7bdat":
            with tempfile.NamedTemporaryFile(suffix=".sas7bdat", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            try:
                df = pd.read_sas(tmp_path, format="sas7bdat", encoding="latin-1")
                if len(df) > MAX_SAMPLE_ROWS:
                    df = df.head(MAX_SAMPLE_ROWS)
            finally:
                os.unlink(tmp_path)
        elif ext == ".xpt":
            with tempfile.NamedTemporaryFile(suffix=".xpt", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            try:
                df = pd.read_sas(tmp_path, format="xport", encoding="latin-1")
                if len(df) > MAX_SAMPLE_ROWS:
                    df = df.head(MAX_SAMPLE_ROWS)
            finally:
                os.unlink(tmp_path)
        elif ext == ".rds":
            import pyreadr  # lazy import; only needed if .rds appears
            with tempfile.NamedTemporaryFile(suffix=".rds", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = tmp.name
            try:
                result = pyreadr.read_r(tmp_path)
                df = next(iter(result.values()))
                if len(df) > MAX_SAMPLE_ROWS:
                    df = df.head(MAX_SAMPLE_ROWS)
            finally:
                os.unlink(tmp_path)
        else:
            info["introspection"] = "skipped"
            return info

        info["row_count_sampled"] = int(len(df))
        info["row_count_is_full"] = len(df) < MAX_SAMPLE_ROWS
        info["columns"] = [str(c) for c in df.columns]
        info["n_columns"] = len(df.columns)
        date_col, date_min, date_max = _detect_date_column(df)
        if date_col is not None:
            info["date_column"] = date_col
            info["date_min"] = date_min
            info["date_max"] = date_max
    except Exception as e:
        info["introspection"] = "failed"
        info["error"] = f"{type(e).__name__}: {e}"
    return info


def catalog_zip(zip_path: str) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    with zipfile.ZipFile(zip_path) as zf:
        for zi in zf.infolist():
            if zi.is_dir():
                continue
            ext = os.path.splitext(zi.filename)[1].lower()
            entry: dict[str, Any] = {
                "name": zi.filename,
                "ext": ext,
                "size_uncompressed": zi.file_size,
                "size_compressed": zi.compress_size,
            }
            if ext in TABULAR_EXTS and zi.file_size <= 500 * 1024 * 1024:
                try:
                    with zf.open(zi) as f:
                        raw = f.read()
                    entry.update(_introspect_tabular(zi.filename, raw))
                except Exception as e:
                    entry["introspection"] = "failed"
                    entry["error"] = f"{type(e).__name__}: {e}"
            else:
                entry["introspection"] = "skipped" if ext not in TABULAR_EXTS else "skipped_too_large"
            entries.append(entry)
    return {
        "zip_path": os.path.basename(zip_path),
        "zip_size_bytes": os.path.getsize(zip_path),
        "n_members": len(entries),
        "members": entries,
    }


def main() -> int:
    if not os.path.isdir(CACHE_DIR):
        print(f"[error] cache dir not found: {CACHE_DIR}", file=sys.stderr)
        return 1
    zips = sorted(f for f in os.listdir(CACHE_DIR) if f.lower().endswith(".zip"))
    if not zips:
        print(f"[error] no zips in {CACHE_DIR}", file=sys.stderr)
        return 1

    manifest: dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "cache_dir": os.path.relpath(CACHE_DIR, os.path.dirname(OUT_PATH)),
        "datasets": [],
    }
    for z in zips:
        full = os.path.join(CACHE_DIR, z)
        print(f"[scan] {z}")
        manifest["datasets"].append(catalog_zip(full))

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(manifest, f, indent=2, default=str)
    print(f"[done] wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
