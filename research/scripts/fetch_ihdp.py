"""Download IHDP benchmark npz bundles to research/datasets/_cache/."""
from __future__ import annotations

import os

import requests

TRAIN_URL = "https://www.fredjo.com/files/ihdp_npci_1-100.train.npz"
TEST_URL = "https://www.fredjo.com/files/ihdp_npci_1-100.test.npz"

CACHE = os.path.join(os.path.dirname(__file__), "..", "datasets", "_cache")


def main() -> None:
    os.makedirs(CACHE, exist_ok=True)
    for url, name in [(TRAIN_URL, "ihdp_train.npz"),
                       (TEST_URL, "ihdp_test.npz")]:
        dst = os.path.join(CACHE, name)
        if os.path.exists(dst):
            print(f"skip {name} (already cached)")
            continue
        r = requests.get(url, timeout=60)
        r.raise_for_status()
        with open(dst, "wb") as f:
            f.write(r.content)
        print(f"wrote {dst} ({len(r.content)/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
