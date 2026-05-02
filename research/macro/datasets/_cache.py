"""Tiny on-disk cache so loaders are network-only on first call."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import requests

CACHE_DIR = Path(__file__).resolve().parents[1] / "output" / "_cache"


def cached_get(url: str, *, force: bool = False, timeout: int = 30) -> bytes:
    """GET ``url`` with caching keyed on the URL hash. Raises on non-200."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256(url.encode()).hexdigest()[:16]
    suffix = ".csv" if url.endswith(".csv") else ".bin"
    path = CACHE_DIR / f"{h}{suffix}"
    if path.exists() and not force:
        return path.read_bytes()
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    path.write_bytes(resp.content)
    return resp.content


def have_cached(url: str) -> bool:
    h = hashlib.sha256(url.encode()).hexdigest()[:16]
    return any((CACHE_DIR / f"{h}{ext}").exists() for ext in (".csv", ".bin"))
