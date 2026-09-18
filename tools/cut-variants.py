#!/usr/bin/env python3
"""Cut one animated part (mouth, eyes) out of several whole-portrait images
that differ ONLY in that part.

Give it the same character drawn three times - mouth closed, half open, open -
and it finds what changed between them and writes one part image per variant:

    assets/characters/<id>/mouth/closed.png
    assets/characters/<id>/mouth/half.png
    assets/characters/<id>/mouth/open.png

Why this works, and why it is exact rather than approximate: the engine draws
the `mouth` part ON TOP of the `head` part, and outside the region that
changed, every input image is pixel-identical. So a plain rectangle around the
changed region, taken from one variant, composites back to that variant
exactly - no feathering, no seam, nothing for the eye to catch. (mouth and
eyes share the head's pivot in the rig, so they turn and scale with the face
and stay registered while it moves. See src/vn/rig.js.)

The whole approach rests on the inputs being pixel-aligned everywhere except
the part in question. Three separate AI generations of "the same" character
are NOT aligned - the body shifts, the shading re-rolls, and the difference
then covers the entire figure. Hence the report below and the sanity gate:
the tool prints every region that changed, and refuses to write if the change
is too large or too scattered to be one facial feature.

Requires Pillow: pip install pillow

Usage:
    python3 tools/cut-variants.py <out_dir> <part> <variant>=<image> ...

Examples:
    python3 tools/cut-variants.py assets/characters/hero mouth \\
        closed=raw/mouth-closed.png half=raw/mouth-half.png open=raw/mouth-open.png

    python3 tools/cut-variants.py assets/characters/hero eyes \\
        open=raw/eyes-open.png closed=raw/eyes-shut.png

Options:
    --pad N             grow the region by N px on every side (default 6)
    --threshold N       per-channel difference counted as a change (default 12)
    --min-area N        ignore changed blobs smaller than N px (default 24)
    --max-area-frac F   refuse if the region covers more than F of the canvas
                        (default 0.06) - a bigger region means misaligned art
    --box x0,y0,x1,y1   skip detection, use this rectangle (fractions of the
                        image, from the top-left). Last resort for art the
                        detector cannot separate; the seam is only invisible
                        if the images still agree just outside the box.
    --dry-run           report what it found and write nothing
"""

import os
import sys
from collections import deque

from PIL import Image, ImageChops


def load_aligned(paths):
    images = {}
    size = None
    for variant, path in paths:
        im = Image.open(path).convert('RGBA')
        if size is None:
            size = im.size
        elif im.size != size:
            sys.exit(f'! {path} is {im.size}, but {paths[0][1]} is {size}. '
                     'Every variant must be the same canvas, uncropped.')
        images[variant] = im
    return images, size


def difference_map(images, threshold):
    """Per-pixel mask of where ANY two variants disagree by more than
    `threshold` in any channel (alpha included - a mouth opening into a
    transparent gap changes alpha, not colour)."""
    names = list(images)
    combined = None
    per_pair = []

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            diff = ImageChops.difference(images[names[i]], images[names[j]])
            channels = diff.split()
            worst = channels[0]
            for ch in channels[1:]:
                worst = ImageChops.lighter(worst, ch)
            per_pair.append((names[i], names[j], worst))
            combined = worst if combined is None else ImageChops.lighter(combined, worst)

    mask = combined.point(lambda v: 255 if v >= threshold else 0)
    pair_counts = [
        (a, b, sum(ch.histogram()[threshold:]))
        for a, b, ch in per_pair
    ]
    return mask, pair_counts


def components(mask, size, min_area):
    """Connected blobs of changed pixels, largest first, as
    (area, (x0, y0, x1, y1)). 4-connected flood fill; a few hundred thousand
    pixels is nothing, and it keeps the tool free of numpy/scipy."""
    w, h = size
    flags = bytearray(mask.tobytes())  # 0 or 255 per pixel
    found = []

    for start in range(w * h):
        if not flags[start]:
            continue
        flags[start] = 0
        queue = deque([start])
        area = 0
        x0 = x1 = start % w
        y0 = y1 = start // w

        while queue:
            idx = queue.popleft()
            x, y = idx % w, idx // w
            area += 1
            x0, x1 = min(x0, x), max(x1, x)
            y0, y1 = min(y0, y), max(y1, y)
            if x > 0 and flags[idx - 1]:
                flags[idx - 1] = 0
                queue.append(idx - 1)
            if x < w - 1 and flags[idx + 1]:
                flags[idx + 1] = 0
                queue.append(idx + 1)
            if y > 0 and flags[idx - w]:
                flags[idx - w] = 0
                queue.append(idx - w)
            if y < h - 1 and flags[idx + w]:
                flags[idx + w] = 0
                queue.append(idx + w)

        if area >= min_area:
            found.append((area, (x0, y0, x1 + 1, y1 + 1)))

    found.sort(reverse=True, key=lambda c: c[0])
    return found


def union_box(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def write_parts(images, out_dir, part, box, size):
    w, h = size
    mask = Image.new('L', size, 0)
    mask.paste(255, box)
    blank = Image.new('L', size, 0)
    dest_dir = os.path.join(out_dir, part)
    os.makedirs(dest_dir, exist_ok=True)

    for variant, im in images.items():
        cut = im.copy()
        cut.putalpha(Image.composite(im.getchannel('A'), blank, mask))
        dest = os.path.join(dest_dir, f'{variant}.png')
        cut.save(dest)
        print(f'  {variant:<8} -> {dest}')


def main():
    args = sys.argv[1:]
    opts = {'pad': 6, 'threshold': 12, 'min_area': 24, 'max_area_frac': 0.06,
            'box': None, 'dry_run': False}
    positional = []

    i = 0
    while i < len(args):
        a = args[i]
        if a == '--dry-run':
            opts['dry_run'] = True
        elif a in ('--pad', '--threshold', '--min-area', '--max-area-frac', '--box'):
            if i + 1 >= len(args):
                sys.exit(f'! {a} needs a value')
            value = args[i + 1]
            i += 1
            if a == '--pad':
                opts['pad'] = int(value)
            elif a == '--threshold':
                opts['threshold'] = int(value)
            elif a == '--min-area':
                opts['min_area'] = int(value)
            elif a == '--max-area-frac':
                opts['max_area_frac'] = float(value)
            else:
                opts['box'] = tuple(float(v) for v in value.split(','))
        else:
            positional.append(a)
        i += 1

    if len(positional) < 3:
        print(__doc__)
        sys.exit(1)

    out_dir, part = positional[:2]
    paths = []
    for spec in positional[2:]:
        if '=' not in spec:
            sys.exit(f'! expected <variant>=<image>, got "{spec}"')
        variant, path = spec.split('=', 1)
        paths.append((variant, path))

    images, size = load_aligned(paths)
    w, h = size
    print(f'{len(images)} variants of "{part}", {w}x{h}')

    if opts['box']:
        x0, y0, x1, y1 = opts['box']
        box = (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))
        print(f'  using the box given on the command line: {box}')
    else:
        mask, pair_counts = difference_map(images, opts['threshold'])
        for a, b, count in pair_counts:
            print(f'  {a} vs {b}: {count} px differ ({count / (w * h):.2%} of canvas)')

        blobs = components(mask, size, opts['min_area'])
        if not blobs:
            sys.exit('! the variants are identical (within the threshold). '
                     'Wrong files, or the difference is subtler than --threshold.')

        print(f'  {len(blobs)} changed region(s) of >= {opts["min_area"]} px:')
        for area, b in blobs[:8]:
            print(f'    {area:>7} px  x {b[0]:>4}-{b[2]:<4} y {b[1]:>4}-{b[3]:<4}'
                  f'   (y {b[1] / h:.3f}-{b[3] / h:.3f} of height)')
        if len(blobs) > 8:
            print(f'    ... and {len(blobs) - 8} more')

        box = union_box([b for _, b in blobs])
        covered = ((box[2] - box[0]) * (box[3] - box[1])) / (w * h)
        print(f'  region covering all of them: x {box[0]}-{box[2]} y {box[1]}-{box[3]}'
              f'  = {covered:.2%} of the canvas')

        if covered > opts['max_area_frac']:
            sys.exit(
                f'! that is more than --max-area-frac ({opts["max_area_frac"]:.2%}), so these '
                'images are not\n'
                '  three versions of one drawing with only the ' + part + ' repainted - the\n'
                '  whole figure moved or was re-rendered. Cutting a ' + part + ' out of them\n'
                '  would make the face jump on every frame. Either supply variants exported\n'
                '  from the same file with only the ' + part + ' layer changed, or pass an\n'
                '  explicit --box and accept the seam.')

    box = (max(0, box[0] - opts['pad']), max(0, box[1] - opts['pad']),
           min(w, box[2] + opts['pad']), min(h, box[3] + opts['pad']))
    print(f'  padded by {opts["pad"]} px -> {box}')

    if opts['dry_run']:
        print('  --dry-run: nothing written')
        return
    write_parts(images, out_dir, part, box, size)


if __name__ == '__main__':
    main()
