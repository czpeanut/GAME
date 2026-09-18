// Draws a rigged character: each part's image, transformed by its own pose
// plus every ancestor's, in back-to-front draw order.
//
// Loading is fire-and-forget: an <img> starts loading the moment a part is
// first requested and `ready` flips to true whenever it arrives. A character
// whose parts have not loaded (or were never provided) falls back to a
// labelled placeholder block rather than a blank hole, so a script stays
// legible and its layout testable before any art exists.
//
// Asset convention: assets/characters/<characterId>/<part>/<variant>.png
// Every part image is the same full canvas size, with everything outside
// that part transparent - so parts line up with each other by construction
// and only their pivots need to be specified. See tools/split-parts.py.
const DEFAULT_ROOT = 'assets/characters';
const MOUTH_VARIANTS = ['closed', 'half', 'open'];

export class PortraitRenderer {
  constructor(images, root = DEFAULT_ROOT) {
    this.images = images; // shared ImageCache
    this.root = root;
  }

  // (x, y) is the bottom-center anchor point (the character's feet). Parts
  // are drawn into a `width` x `height` box rising from there, which is also
  // the space every part pivot is expressed in.
  draw(ctx, character, rig, motion, { x, y, width = 300, height = 540, mirror = false, dim = false } = {}) {
    if (!character) return;

    ctx.save();
    ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.translate(x, y);
    // Mirroring wraps everything below so a character can face the other
    // way without a second set of art. It is applied here, around the whole
    // rig, rather than per part - flipping parts individually would mirror
    // each one about its own centre and tear the character apart.
    if (mirror) ctx.scale(-1, 1);

    let drewAny = false;
    const parts = rig?.parts ?? [];
    for (const part of parts) {
      const variant = this._variantFor(character, part, motion);
      if (!variant) continue;

      const entry = this.images.get(`${this.root}/${character.id}/${part.name}/${variant}.png`);
      if (!entry.ready) continue;

      ctx.save();
      const chain = rig.chainTo(part.name);
      chain.forEach((node, i) => this._applyPose(ctx, node, width, height, i === chain.length - 1));
      ctx.drawImage(entry.image, -width / 2, -height, width, height);
      ctx.restore();
      drewAny = true;
    }

    if (!drewAny) this._drawPlaceholder(ctx, character, width, height, mirror);
    ctx.restore();
  }

  // Rotate/scale around the part's own pivot, then offset. Pivots arrive as
  // fractions of the box (x from the left, y from the top); the drawing
  // origin is the feet, so y has to be re-based onto that.
  //
  // `isSelf` marks the part actually being drawn, as opposed to an ancestor
  // being replayed to position it. Ancestors apply their scale in full, so
  // a breathing chest still lifts the head and arms riding on it - but the
  // part itself divides that inherited scale back out, so it is *moved* by
  // the breath without being *stretched* by it. Without this the whole
  // upper body, face included, elongates every time the chest expands,
  // which reads as rubber rather than breathing.
  _applyPose(ctx, part, width, height, isSelf) {
    const t = part.transform;
    const pivotX = (part.pivot[0] - 0.5) * width;
    const pivotY = (part.pivot[1] - 1) * height;
    const scaleY = isSelf ? t.scaleY / (part.parentScaleY || 1) : t.scaleY;

    ctx.translate(pivotX, pivotY);
    ctx.rotate(t.angle);
    ctx.scale(t.scaleX, scaleY);
    ctx.translate(-pivotX, -pivotY);
  }

  _variantFor(character, part, motion) {
    if (part.blink) return motion?.blinking ? 'closed' : 'open';
    if (part.talk) return MOUTH_VARIANTS[motion?.mouthIndex ?? 0] ?? 'closed';
    return character.getLayer(part.name);
  }

  _drawPlaceholder(ctx, character, width, height, mirror) {
    ctx.save();
    // Undo the rig-wide mirror so the name label is never drawn reversed
    // (e.g. "小安" as "安小") for a character standing on the right.
    if (mirror) ctx.scale(-1, 1);

    ctx.fillStyle = 'rgba(127, 212, 255, 0.14)';
    ctx.strokeStyle = 'rgba(127, 212, 255, 0.55)';
    ctx.lineWidth = 2;
    const r = 18;
    const x0 = -width / 2;
    const y0 = -height;
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x0 + width, y0, x0 + width, y0 + height, r);
    ctx.arcTo(x0 + width, y0 + height, x0, y0 + height, r);
    ctx.arcTo(x0, y0 + height, x0, y0, r);
    ctx.arcTo(x0, y0, x0 + width, y0, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#eaf3ff';
    ctx.textAlign = 'center';
    ctx.font = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillText(character.name, 0, -height / 2);
    ctx.restore();
  }
}
