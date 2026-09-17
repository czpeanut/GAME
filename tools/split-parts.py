#!/usr/bin/env python3
"""Cut one flat character illustration into horizontal bands, one per rig
part (see src/vn/rig.js).

Every output is the SAME full canvas size as the source, with everything
outside its own band made transparent - not cropped or resized - so the
parts line up with each other by construction and reassemble into the
original image exactly when nothing is moving.

This is a stopgap, not the real thing. A straight horizontal cut can only
produce stacked bands (head / torso / hips), which is enough for breathing
and head tilt. It CANNOT separate arms, hair or facial features, because
those overlap other parts: cutting an arm out of a flat illustration leaves
a hole in the torso behind it, and only a person (or an inpainting tool) can
paint in what was hidden there. Parts that need that treatment have to be
authored as real layers.

Requires Pillow: pip install pillow

Usage:
    python3 tools/split-parts.py <source.png> <out_dir> <name>:<top>:<bottom> ...

`top`/`bottom` are fractions of the image height, measured from the top.
Each part is written to <out_dir>/<name>/default.png.

Example (what generated this repo's stopgap demo parts):
    python3 tools/split-parts.py raw/teacher.png assets/characters/teacher \\
        head:0:0.25 torso:0.25:0.47 lower:0.47:1
"""

import os
import sys

from PIL import Image


def split(src_path, out_dir, bands):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    alpha = im.getchannel('A')
    blank = Image.new('L', (w, h), 0)

    for name, top, bottom in bands:
        top_row = round(h * top)
        bottom_row = round(h * bottom)

        mask = Image.new('L', (w, h), 0)
        mask.paste(255, (0, top_row, w, bottom_row))

        part = im.copy()
        part.putalpha(Image.composite(alpha, blank, mask))

        dest_dir = os.path.join(out_dir, name)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, 'default.png')
        part.save(dest)
        print(f'  {name:<10} rows {top_row:>4}-{bottom_row:<4} -> {dest}')


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    src_path, out_dir = sys.argv[1:3]
    bands = []
    for spec in sys.argv[3:]:
        name, top, bottom = spec.split(':')
        bands.append((name, float(top), float(bottom)))

    print(f'{src_path} -> {out_dir}')
    split(src_path, out_dir, bands)


if __name__ == '__main__':
    main()
