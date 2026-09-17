#!/usr/bin/env python3
"""Split one flat character illustration into the two pieces a
`breathingSplit` rig needs (see src/vn/character.js and
src/vn/portrait-renderer.js): an `upper` piece (head/torso/arms) that gets
the idle breathing motion, and a `lower` piece (hips down) that stays put.

Both outputs are the SAME full canvas size as the source image, just with
everything outside their own horizontal band made transparent - not
separately cropped/resized - so at rest they reconstruct the original
artwork exactly, with no visible seam. This needs no new drawing: it is a
straight horizontal cut through the existing image, so pick a seam that
falls on a natural, roughly-horizontal clothing line (a jacket hem, a
waistband) where a straight cut through solid-colored fabric won't be
noticeable - not through a hand, face, or patterned detail.

Requires Pillow: pip install pillow

Usage:
    python3 tools/split-breathing-seam.py <source.png> <seam_fraction> <upper_out.png> <lower_out.png>

Example (what generated this repo's demo art):
    python3 tools/split-breathing-seam.py \\
        raw/teacher.png 0.46 \\
        assets/characters/teacher/upper/default.png \\
        assets/characters/teacher/lower/default.png
"""

import sys

from PIL import Image


def split(src_path, seam_fraction, upper_out, lower_out):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size
    seam_row = round(h * seam_fraction)

    alpha = im.getchannel('A')
    zero = Image.new('L', (w, h), 0)

    upper_mask = Image.new('L', (w, h), 0)
    upper_mask.paste(255, (0, 0, w, seam_row))
    upper = im.copy()
    upper.putalpha(Image.composite(alpha, zero, upper_mask))

    lower_mask = Image.new('L', (w, h), 0)
    lower_mask.paste(255, (0, seam_row, w, h))
    lower = im.copy()
    lower.putalpha(Image.composite(alpha, zero, lower_mask))

    upper.save(upper_out)
    lower.save(lower_out)
    print(f'seam at row {seam_row} of {h} ({seam_fraction:.0%} from the top)')
    print(f'  upper -> {upper_out}')
    print(f'  lower -> {lower_out}')


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    src_path, seam_str, upper_out, lower_out = sys.argv[1:5]
    split(src_path, float(seam_str), upper_out, lower_out)


if __name__ == '__main__':
    main()
