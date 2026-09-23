#!/usr/bin/env python3
"""Crop the advisor (and Brynna) headshots out of the deck slide images.

The deck slides are full 1920x1080 exports — the headshots live as
sub-rectangles within those slides. We use PIL to crop, then save into
the website's public/team folder.

Crop coordinates were estimated visually from the rendered slides; if a
crop is off, tweak the box and re-run.
"""

from pathlib import Path
from PIL import Image

EXTRACTED = Path(__file__).resolve().parent / "extracted"
OUT = Path(__file__).resolve().parent.parent / "public" / "team"
OUT.mkdir(parents=True, exist_ok=True)

# Coords detected by find-photo-bounds.py.
# Slide 25 = Advisors (1920x1080), 3 photos at y=313–676, ~363px square each.
ADVISOR_SRC = EXTRACTED / "image25.png"
ADVISOR_CROPS = {
    "igusa.png":      (153,  313, 518,  676),
    "pita.png":       (753,  313, 1116, 676),
    "telukdarie.png": (1343, 313, 1706, 676),
}

# Slide 24 = Team (1920x1080), 5 portraits at y=270–571.
# Brynna is 3rd from left.  Detected col-run x=839–1059 (220 wide).
# Crop a centered 220x220 square (y centered around 420).
TEAM_SRC = EXTRACTED / "image24.png"
TEAM_CROPS = {
    "brynna.png": (839, 310, 1059, 530),
}


def crop_one(src: Path, out_name: str, box):
    img = Image.open(src)
    print(f"  {src.name} → {out_name}  box={box}  src={img.size}")
    cropped = img.crop(box)
    target = OUT / out_name
    cropped.save(target, optimize=True)
    print(f"    saved {target}  ({cropped.size[0]}x{cropped.size[1]})")


def main():
    print(f"Output: {OUT}")
    print("Advisors:")
    for name, box in ADVISOR_CROPS.items():
        crop_one(ADVISOR_SRC, name, box)
    print("Team:")
    for name, box in TEAM_CROPS.items():
        crop_one(TEAM_SRC, name, box)
    print("Done.")


if __name__ == "__main__":
    main()
