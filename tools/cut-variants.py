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

When the variants are NOT pixel-aligned (each one separately generated or
repainted, so the line work and shading differ slightly all over the figure),
the difference between them is the whole character and the plain-rectangle cut
above is useless - the surrounding skin would flicker at every mouth frame.
--window turns on the second mode for exactly that case: you say roughly where
the feature is, and instead of a rectangle the tool cuts a feathered mask that
hugs only what actually changes there. The swapped area is then a few hundred
pixels of mouth rather than a block of face.

    python3 tools/cut-variants.py assets/characters/hero mouth \
        --window 0.46,0.143,0.557,0.178 --base raw/full.png \
        closed=raw/closed.png half=raw/half.png open=raw/open.png

--base is the image the rest of the character was cut from. The part has to
cover THAT image's mouth too, or the base's lips show through an open mouth,
so its difference from each variant is folded into the mask.

Options:
    --pad N             grow the region by N px on every side (default 6)
    --threshold N       per-channel difference counted as a change (default 12)
    --min-area N        ignore changed blobs smaller than N px (default 24)
    --max-area-frac F   refuse if the region covers more than F of the canvas
                        (default 0.06) - a bigger region means misaligned art
    --box x0,y0,x1,y1   skip detection, use this rectangle (fractions of the
                        image, from the top-left). Only for art that IS aligned
                        but whose feature the detector cannot separate.
    --window x0,y0,x1,y1  feathered-mask mode, for art that is not aligned:
                        search only this region (fractions of the image) and
                        cut a soft mask around what changes inside it.
    --base <image>      the image the rest of the character comes from
                        (--window mode)
    --seed N            difference that counts as "this is the feature, not
                        re-render noise" in --window mode (default 55)
    --feather F         blur radius on the mask edge in --window mode
                        (default 1.6 px)
    --dry-run           report what it found and write nothing
"""

import os
import sys
from collections import deque

from PIL import Image, ImageChops, ImageFilter


def worst_channel(a, b):
    """Per-pixel largest difference across R, G, B and A. Alpha matters: a
    mouth opening into a transparent gap changes alpha, not colour."""
    channels = ImageChops.difference(a, b).split()
    worst = channels[0]
    for ch in channels[1:]:
        worst = ImageChops.lighter(worst, ch)
    return worst


def fit_canvas(im, size, reference):
    """An export that came out a pixel or two larger than the others. The
    padding can be on either side, so try every offset and keep whichever one
    lines the drawing up with the reference - guessing wrong here would shift
    the whole figure."""
    dw, dh = im.size[0] - size[0], im.size[1] - size[1]
    if (dw, dh) == (0, 0):
        return im
    best = None
    for oy in range(dh + 1):
        for ox in range(dw + 1):
            crop = im.crop((ox, oy, ox + size[0], oy + size[1]))
            score = sum(worst_channel(crop, reference).histogram()[12:])
            if best is None or score < best[0]:
                best = (score, ox, oy, crop)
    print(f'  (cropped {im.size[0]}x{im.size[1]} -> {size[0]}x{size[1]}, '
          f'offset {best[1]},{best[2]} - the alignment that matches best)')
    return best[3]


def load_aligned(paths):
    loaded = [(variant, path, Image.open(path).convert('RGBA')) for variant, path in paths]
    # The smallest canvas wins: an export that came out larger has padding to
    # trim, and trimming is safe where inventing rows would not be.
    size = (min(im.size[0] for _, _, im in loaded), min(im.size[1] for _, _, im in loaded))
    slack = max(max(im.size[0] - size[0], im.size[1] - size[1]) for _, _, im in loaded)
    if slack > 4:
        sizes = ', '.join(f'{path} {im.size[0]}x{im.size[1]}' for _, path, im in loaded)
        sys.exit(f'! canvases differ by more than 4 px - too far off to be stray '
                 f'padding. Re-export them on the same canvas.\n  {sizes}')

    reference = next((im for _, _, im in loaded if im.size == size), None)
    images = {}
    for variant, path, im in loaded:
        images[variant] = im if im.size == size else fit_canvas(im, size, reference)
    return images, size


def feathered_mask(images, base, window, size, seed, feather, part='feature'):
    """The mask for art whose variants are not pixel-aligned. Inside `window`,
    take everything that differs strongly between any two states (`base`
    included, so its own mouth gets covered), merge those pixels into one blob,
    keep the largest, and soften the edge. What comes out hugs the feature, so
    swapping variants leaves the surrounding face untouched instead of
    swapping in a block of somebody else's render."""
    w, h = size
    states = list(images.values()) + ([base] if base is not None else [])
    acc = None
    for i in range(len(states)):
        for j in range(i + 1, len(states)):
            d = worst_channel(states[i], states[j])
            acc = d if acc is None else ImageChops.lighter(acc, d)

    frame = Image.new('L', size, 0)
    frame.paste(255, window)
    acc = ImageChops.multiply(acc, frame)

    # Dilate before labelling so the parts of one feature (upper lip, lower
    # lip, the gap between them) come out as a single blob.
    seeds = acc.point(lambda v: 255 if v >= seed else 0)
    seed_px = seeds.tobytes()
    merged = seeds.filter(ImageFilter.MaxFilter(5))
    flags = bytearray(merged.tobytes())
    best = []
    for start in range(w * h):
        if not flags[start]:
            continue
        flags[start] = 0
        queue = deque([start])
        comp = [start]
        while queue:
            idx = queue.popleft()
            x, y = idx % w, idx // w
            for nb, ok in ((idx - 1, x > 0), (idx + 1, x < w - 1),
                           (idx - w, y > 0), (idx + w, y < h - 1)):
                if ok and flags[nb]:
                    flags[nb] = 0
                    queue.append(nb)
                    comp.append(nb)
        if len(comp) > len(best):
            best = comp

    if not best:
        sys.exit(f'! nothing inside the window differs by {seed} or more. Either the '
                 'window is in the wrong place, or --seed is too high.')

    blob = Image.new('L', size, 0)
    px = blob.load()
    for idx in best:
        px[idx % w, idx // w] = 255

    # Report the feature's own extent - the blob is 2 px wider all round from
    # the merge dilation, and measuring that against the window would flag
    # every clean result as touching the edge.
    core = [idx for idx in best if seed_px[idx]]
    xs = [idx % w for idx in core]
    ys = [idx // w for idx in core]
    print(f'  feature found: {len(core)} px, x {min(xs)}-{max(xs)} y {min(ys)}-{max(ys)}'
          f'  (mask grown to {len(best)} px)')
    if min(xs) <= window[0] or max(xs) >= window[2] - 1 or \
       min(ys) <= window[1] or max(ys) >= window[3] - 1:
        print(f'  note: the mask runs into the window edge, so the window is clipping it. '
              f'That is\n        what you want if you drew the window tight around the {part} '
              f'on purpose - it\n        is how the re-render noise on the surrounding skin '
              f'gets cut away. Widen\n        --window if the {part} itself is losing an edge.')
    return blob.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(feather))


def difference_map(images, threshold):
    """Per-pixel mask of where ANY two variants disagree by more than
    `threshold` in any channel (alpha included - a mouth opening into a
    transparent gap changes alpha, not colour)."""
    names = list(images)
    combined = None
    per_pair = []

    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            worst = worst_channel(images[names[i]], images[names[j]])
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


def clear_hidden_colour(im, alpha):
    """Black out the RGB wherever the part is fully transparent. Invisible -
    the browser composites premultiplied, which is why the artist's own layer
    exports do the same - but it is most of the file: a part image is a full
    canvas that is nearly all transparent, and PNG still stores the colour of
    every one of those pixels. Cutting it takes a 250 KB part down to a few
    KB, which is the difference between a fast and a slow load on a phone.
    """
    solid = alpha.point(lambda v: 255 if v else 0)
    black = Image.new('L', im.size, 0)
    return tuple(Image.composite(ch, black, solid) for ch in im.convert('RGB').split())


def write_parts(images, out_dir, part, mask, size):
    blank = Image.new('L', size, 0)
    dest_dir = os.path.join(out_dir, part)
    os.makedirs(dest_dir, exist_ok=True)

    for variant, im in images.items():
        alpha = ImageChops.multiply(im.getchannel('A'), mask)
        cut = Image.merge('RGBA', clear_hidden_colour(im, alpha) + (alpha,))
        dest = os.path.join(dest_dir, f'{variant}.png')
        cut.save(dest)
        print(f'  {variant:<8} -> {dest}  ({os.path.getsize(dest) / 1024:.0f} KB)')


def main():
    args = sys.argv[1:]
    opts = {'pad': 6, 'threshold': 12, 'min_area': 24, 'max_area_frac': 0.06,
            'box': None, 'window': None, 'base': None, 'seed': 55, 'feather': 1.6,
            'dry_run': False}
    positional = []

    i = 0
    while i < len(args):
        a = args[i]
        if a == '--dry-run':
            opts['dry_run'] = True
        elif a in ('--pad', '--threshold', '--min-area', '--max-area-frac', '--box',
                   '--window', '--base', '--seed', '--feather'):
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
            elif a == '--base':
                opts['base'] = value
            elif a == '--seed':
                opts['seed'] = int(value)
            elif a == '--feather':
                opts['feather'] = float(value)
            else:
                opts[a[2:]] = tuple(float(v) for v in value.split(','))
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

    if opts['window']:
        # Art whose variants are not pixel-aligned: a soft mask around what
        # changes inside the window, so nothing but the feature is swapped.
        x0, y0, x1, y1 = opts['window']
        window = (round(x0 * w), round(y0 * h), round(x1 * w), round(y1 * h))
        print(f'  searching inside x {window[0]}-{window[2]} y {window[1]}-{window[3]}')
        base = None
        if opts['base']:
            base = Image.open(opts['base']).convert('RGBA')
            if base.size != size:
                base = fit_canvas(base, size, next(iter(images.values())))
            print(f'  covering the base image\'s own {part} as well: {opts["base"]}')
        mask = feathered_mask(images, base, window, size, opts['seed'], opts['feather'], part)
        if opts['dry_run']:
            print('  --dry-run: nothing written')
            return
        write_parts(images, out_dir, part, mask, size)
        return

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

    # A hard-edged rectangle, and that is not a compromise: outside it every
    # variant is pixel-identical, so both sides of the edge already match.
    mask = Image.new('L', size, 0)
    mask.paste(255, box)
    write_parts(images, out_dir, part, mask, size)


if __name__ == '__main__':
    main()
