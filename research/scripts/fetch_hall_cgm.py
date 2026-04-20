"""Fetch the Hall et al 2018 CGM dataset from iglu-R and cache as CSV.

Run once from the repo root:
    python research/scripts/fetch_hall_cgm.py

Requires pyreadr (built with xz headers on macOS; `brew install xz` first).
"""
from __future__ import annotations

import os
import tempfile

import pyreadr
import requests

URL = "https://raw.githubusercontent.com/irinagain/iglu/master/data/example_data_hall.rda"
OUT = os.path.join(os.path.dirname(__file__), "..", "datasets",
                    "_cache", "hall_cgm.csv")


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".rda", delete=False) as tf:
        rda_path = tf.name
    try:
        r = requests.get(URL, timeout=30)
        r.raise_for_status()
        with open(rda_path, "wb") as f:
            f.write(r.content)

        data = pyreadr.read_r(rda_path)
        df = data["example_data_hall"]
        df.to_csv(OUT, index=False)
        print(f"wrote {OUT}")
        print(f"  shape: {df.shape}")
        print(f"  diagnoses: {df['diagnosis'].value_counts().to_dict()}")
    finally:
        if os.path.exists(rda_path):
            os.unlink(rda_path)


if __name__ == "__main__":
    main()
