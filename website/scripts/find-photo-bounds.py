#!/usr/bin/env python3
"""Find the exact bounding boxes of the headshot photos in slides 24 and 25
by looking for non-pale-blue regions (the photos are grayscale, the slide
background is pale blue ~RGB(220,232,247)).
"""
from pathlib import Path
from PIL import Image
import numpy as np

EXTRACTED = Path(__file__).resolve().parent / "extracted"


def find_photo_columns(img_arr):
    """For each column, return whether it contains photo content (non-pale)."""
    # Pale blue background pixel ~(220, 232, 247).  A photo (grayscale) has
    # R ≈ G ≈ B (within 5).  Non-photo background has B > R + 10.
    r = img_arr[:, :, 0].astype(int)
    g = img_arr[:, :, 1].astype(int)
    b = img_arr[:, :, 2].astype(int)
    # photo pixel: roughly grayscale (channels close to each other) AND not white
    is_photo = (np.abs(r - g) < 8) & (np.abs(r - b) < 8) & (r < 240)
    col_density = is_photo.sum(axis=0)
    return col_density


def find_photo_rows(img_arr):
    r = img_arr[:, :, 0].astype(int)
    g = img_arr[:, :, 1].astype(int)
    b = img_arr[:, :, 2].astype(int)
    is_photo = (np.abs(r - g) < 8) & (np.abs(r - b) < 8) & (r < 240)
    row_density = is_photo.sum(axis=1)
    return row_density


def runs(arr, threshold):
    """Find runs of indices where arr > threshold; return list of (start, end)."""
    above = arr > threshold
    out = []
    i = 0
    while i < len(above):
        if above[i]:
            j = i
            while j < len(above) and above[j]:
                j += 1
            out.append((i, j - 1))
            i = j
        else:
            i += 1
    return out


for name in ("image24.png", "image25.png"):
    img = Image.open(EXTRACTED / name).convert("RGB")
    arr = np.array(img)
    print(f"\n=== {name}  {img.size} ===")
    cols = find_photo_columns(arr)
    rows = find_photo_rows(arr)
    # Find column runs that are >50% photo
    col_runs = runs(cols, threshold=arr.shape[0] * 0.15)
    row_runs = runs(rows, threshold=arr.shape[1] * 0.10)
    print(f"  Column runs (x ranges with photo content):")
    for s, e in col_runs:
        if e - s > 50:  # filter tiny runs
            print(f"    x={s} → {e}  ({e - s + 1}px wide)")
    print(f"  Row runs (y ranges with photo content):")
    for s, e in row_runs:
        if e - s > 50:
            print(f"    y={s} → {e}  ({e - s + 1}px tall)")
