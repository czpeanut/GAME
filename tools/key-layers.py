#!/usr/bin/env python3
"""Turn an artist's flat layer exports into rig part images.

Layers often arrive as JPEGs on a white background - no alpha, because the
export dropped it. This keys that background out, crops every layer to one
common box, and writes them where the engine expects:

    assets/characters/<id>/<part>/default.png

The background is whatever white is CONNECTED TO THE BORDER, found by flood
fill, not "every pixel brighter than X". That distinction matters: this
character wears a cream dress and has white highlights in her eyes, and a
brightness threshold punches holes straight through both. White enclosed by
the drawing is not reachable from outside, so it survives.

The crop is shared by every layer, which is what keeps the parts aligned with
each other - the whole rig depends on that. Without --crop it is computed from
all the layers together, with a little margin, and squared up to the aspect the
portrait box wants.

Requires Pillow: pip install pillow

Usage:
    python3 tools/key-layers.py <out_dir> <part>=<file> ... [options]

Example:
    python3 tools/key-layers.py assets/characters/senpai \\
        hair_back=raw/S__2949127_0.jpg torso=raw/S__2949131_0.jpg ...

Options:
    --tolerance N   how far from pure white still counts as background
                    (default 18; JPEG never gives you exactly 255)
    --crop x0,y0,x1,y1   crop box in source pixels, instead of computing one
    --aspect W/H    shape the computed crop to this (default 402/720, the
                    portrait box the engine draws into)
    --margin F      padding around the content, as a fraction of its height
                    (default 0.03)
    --feet F        extra padding BELOW the content (default 0.015) - the
                    renderer anchors a portrait at its feet, so a big empty
                    strip down there makes the character float
    --dry-run       report the crop and write nothing
"""

import os
import sys
from collections import deque

from PIL import Image


def background_mask(im, tolerance):
    """Alpha for one layer: opaque everywhere the white did not reach."""
    w, h = im.size
    gray = im.convert("L")
    px = gray.load()
    limit = 255 - tolerance
    seen = bytearray(w * h)
    queue = deque()

    def consider(x, y):
        i = y * w + x
        if not seen[i] and px[x, y] >= limit:
            seen[i] = 1
            queue.append(i)

    for x in range(w):
        consider(x, 0)
        consider(x, h - 1)
    for y in range(h):
        consider(0, y)
        consider(w - 1, y)

    while queue:
        i = queue.popleft()
        x, y = i % w, i // w
        if x > 0:
            consider(x - 1, y)
        if x < w - 1:
            consider(x + 1, y)
        if y > 0:
            consider(x, y - 1)
        if y < h - 1:
            consider(x, y + 1)

    return Image.frombytes("L", (w, h), bytes(0 if v else 255 for v in seen))


def common_crop(boxes, size, aspect, margin, feet):
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)

    pad = (y1 - y0) * margin
    y0 -= pad
    y1 += (y1 - y0) * feet
    height = y1 - y0
    width = height * aspect
    centre = (x0 + x1) / 2
    # Never crop into the drawing to hit the aspect - widen instead.
    if width < x1 - x0:
        width = x1 - x0
        height = width / aspect
    return (
        round(max(0, centre - width / 2)),
        round(max(0, y0)),
        round(min(size[0], centre + width / 2)),
        round(min(size[1], y1)),
    )


def main():
    args = sys.argv[1:]
    opts = {"tolerance": 18, "crop": None, "aspect": 402 / 720,
            "margin": 0.03, "feet": 0.015, "dry_run": False}
    positional = []

    i = 0
    while i < len(args):
        a = args[i]
        if a == "--dry-run":
            opts["dry_run"] = True
        elif a in ("--tolerance", "--crop", "--aspect", "--margin", "--feet"):
            if i + 1 >= len(args):
                sys.exit(f"! {a} needs a value")
            value = args[i + 1]
            i += 1
            if a == "--tolerance":
                opts["tolerance"] = int(value)
            elif a == "--crop":
                opts["crop"] = tuple(int(v) for v in value.split(","))
            elif a == "--aspect":
                w, h = value.split("/")
                opts["aspect"] = float(w) / float(h)
            elif a == "--margin":
                opts["margin"] = float(value)
            else:
                opts["feet"] = float(value)
        else:
            positional.append(a)
        i += 1

    if len(positional) < 2:
        print(__doc__)
        sys.exit(1)

    out_dir = positional[0]
    layers = []
    for spec in positional[1:]:
        if "=" not in spec:
            sys.exit(f'! expected <part>=<file>, got "{spec}"')
        part, path = spec.split("=", 1)
        layers.append((part, path))

    size = None
    keyed = []
    for part, path in layers:
        im = Image.open(path).convert("RGB")
        if size is None:
            size = im.size
        elif im.size != size:
            sys.exit(f"! {path} is {im.size}, but the first layer is {size}. "
                     "Every layer must be exported on the same canvas.")
        alpha = background_mask(im, opts["tolerance"])
        box = alpha.getbbox()
        if box is None:
            sys.exit(f"! {path} is blank once the background is keyed out")
        keyed.append((part, path, im, alpha, box))
        print(f"  {part:<12} {os.path.basename(path):<22} "
              f"{sum(alpha.histogram()[200:]):>7} opaque px")

    crop = opts["crop"] or common_crop([k[4] for k in keyed], size, opts["aspect"],
                                       opts["margin"], opts["feet"])
    cw, ch = crop[2] - crop[0], crop[3] - crop[1]
    print(f"\n  crop {crop}  -> {cw}x{ch}  (aspect {cw / ch:.4f})")

    for part, _, im, alpha, box in keyed:
        inside = (max(box[0], crop[0]), max(box[1], crop[1]),
                  min(box[2], crop[2]), min(box[3], crop[3]))
        if inside[0] >= inside[2] or inside[1] >= inside[3]:
            print(f"  ! {part} falls entirely outside the crop")
        elif box != inside:
            print(f"  ! {part} is clipped by the crop ({box} -> {inside})")

    if opts["dry_run"]:
        print("  --dry-run: nothing written")
        return

    print()
    for part, _, im, alpha, _ in keyed:
        cropped_alpha = alpha.crop(crop)
        rgb = im.convert("RGB").crop(crop)
        # Black out the colour where nothing is drawn: invisible, but it is
        # most of the file - a part image is a canvas that is nearly all
        # transparent and PNG stores every one of those pixels' colour.
        solid = cropped_alpha.point(lambda v: 255 if v else 0)
        black = Image.new("L", (cw, ch), 0)
        channels = tuple(Image.composite(ch_, black, solid) for ch_ in rgb.split())
        out = Image.merge("RGBA", channels + (cropped_alpha,))

        dest_dir = os.path.join(out_dir, part)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, "default.png")
        out.save(dest)
        print(f"  {part:<12} -> {dest}  ({os.path.getsize(dest) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
