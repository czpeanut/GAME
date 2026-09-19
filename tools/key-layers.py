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

That alone is not enough, though. Loose hair encloses page background between
its strands, and those pockets are not reachable from the border either - they
come out as opaque white blobs, invisible against a white page and glaring
against anything else. So a second pass clears enclosed regions that are
NEARLY PURE white, on a much tighter threshold than the border flood: measured
on this character, the hair's trapped pockets are 250+, while the cream dress
never exceeds 237 and the eye highlights never exceed 247. Art that really does
contain large pure-white areas needs --enclosed-white raised or set to 0.

The crop is shared by every layer, which is what keeps the parts aligned with
each other - the whole rig depends on that. Without --crop it is computed from
all the layers together, with a little margin, and squared up to the aspect the
portrait box wants.

Requires Pillow: pip install pillow

Usage:
    python3 tools/key-layers.py <out_dir> <part>[/<variant>]=<file> ... [options]

A part with no variant is written as `default.png`. Name the variant when a
part has several - the animation picks between them:
    eyes/open= eyes/closed=            blink
    mouth/closed= mouth/half= mouth/open=   lip sync

Example:
    python3 tools/key-layers.py assets/characters/senpai \\
        hair_back=raw/S__2949127_0.jpg torso=raw/S__2949131_0.jpg ...

Options:
    --tolerance N   how far from pure white still counts as background
                    (default 18; JPEG never gives you exactly 255)
    --enclosed-white N   a region the flood could not reach is cleared too if
                    every channel is at least this bright (default 250) and it
                    is at least --enclosed-min px. 0 turns the pass off.
    --enclosed-min N     smallest enclosed pocket worth clearing (default 12)
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


def clear_enclosed_white(im, alpha, white, min_area):
    """Pockets of page background the border flood could not get to - the gaps
    between strands of hair, most often. Returns how many pixels were cleared."""
    if not white:
        return 0
    w, h = im.size
    rgb = im.convert("RGB").load()
    ap = alpha.load()
    seen = bytearray(w * h)
    cleared = 0

    def is_white(x, y):
        r, g, b = rgb[x, y]
        return min(r, g, b) >= white

    for start in range(w * h):
        sx, sy = start % w, start // w
        if seen[start] or ap[sx, sy] < 40 or not is_white(sx, sy):
            continue
        queue = deque([start])
        seen[start] = 1
        region = [start]
        while queue:
            i = queue.popleft()
            x, y = i % w, i // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and ap[nx, ny] >= 40 and is_white(nx, ny):
                        seen[j] = 1
                        queue.append(j)
                        region.append(j)
        if len(region) >= min_area:
            for i in region:
                ap[i % w, i // w] = 0
            cleared += len(region)
    return cleared


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
            "margin": 0.03, "feet": 0.015, "dry_run": False,
            "enclosed_white": 250, "enclosed_min": 12}
    positional = []

    i = 0
    while i < len(args):
        a = args[i]
        if a == "--dry-run":
            opts["dry_run"] = True
        elif a in ("--tolerance", "--crop", "--aspect", "--margin", "--feet",
                   "--enclosed-white", "--enclosed-min"):
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
            elif a == "--enclosed-white":
                opts["enclosed_white"] = int(value)
            elif a == "--enclosed-min":
                opts["enclosed_min"] = int(value)
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
        variant = "default"
        if "/" in part:
            part, variant = part.split("/", 1)
        layers.append((part, variant, path))

    size = None
    keyed = []
    for part, variant, path in layers:
        im = Image.open(path).convert("RGB")
        if size is None:
            size = im.size
        elif im.size != size:
            sys.exit(f"! {path} is {im.size}, but the first layer is {size}. "
                     "Every layer must be exported on the same canvas.")
        alpha = background_mask(im, opts["tolerance"])
        pockets = clear_enclosed_white(im, alpha, opts["enclosed_white"], opts["enclosed_min"])
        box = alpha.getbbox()
        if box is None:
            sys.exit(f"! {path} is blank once the background is keyed out")
        keyed.append((part, variant, im, alpha, box))
        note = f"  (+{pockets} px of trapped background cleared)" if pockets else ""
        print(f"  {part}/{variant:<16} {os.path.basename(path):<22} "
              f"{sum(alpha.histogram()[200:]):>7} opaque px{note}")

    crop = opts["crop"] or common_crop([k[4] for k in keyed], size, opts["aspect"],
                                       opts["margin"], opts["feet"])
    cw, ch = crop[2] - crop[0], crop[3] - crop[1]
    print(f"\n  crop {crop}  -> {cw}x{ch}  (aspect {cw / ch:.4f})")

    for part, variant, im, alpha, box in keyed:
        box = alpha.getbbox()
        inside = (max(box[0], crop[0]), max(box[1], crop[1]),
                  min(box[2], crop[2]), min(box[3], crop[3]))
        if inside[0] >= inside[2] or inside[1] >= inside[3]:
            print(f"  ! {part}/{variant} falls entirely outside the crop")
        elif box != inside:
            print(f"  ! {part}/{variant} is clipped by the crop ({box} -> {inside})")

    if opts["dry_run"]:
        print("  --dry-run: nothing written")
        return

    print()
    for part, variant, im, alpha, _ in keyed:
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
        dest = os.path.join(dest_dir, f"{variant}.png")
        out.save(dest)
        print(f"  {part}/{variant:<16} -> {dest}  ({os.path.getsize(dest) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
