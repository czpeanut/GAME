// Draws a Character's currently-equipped paper-doll layers onto canvas, plus
// the idle-life motion (breathe/sway/tilt/blink/talk-bounce) computed by
// PortraitMotion.
//
// Loading is fire-and-forget, same pattern as the old sprite-sheet loader:
// an <img> starts loading the moment a layer is first requested and `ready`
// flips to true whenever it arrives. Every layer that has not loaded yet (or
// failed, or was never provided) falls back to a labelled placeholder block
// instead of leaving a blank hole - so a script is legible and its layout
// testable in the browser before real art exists, and never crashes if an
// asset is simply missing.
//
// Asset convention: assets/characters/<characterId>/<slot>/<variant>.png
// A blinking "eyes" slot looks for `<variant>_closed.png` next to the open
// variant; a character with no closed-eye art simply never blinks visually.
const DEFAULT_ROOT = 'assets/characters';

export class PortraitRenderer {
  constructor(images, root = DEFAULT_ROOT) {
    this.images = images; // shared ImageCache
    this.root = root;
  }

  // (x, y) is the bottom-center anchor point (feet position) - also the
  // pivot every PortraitMotion signal rotates/scales around, so breathing
  // stretches upward from planted feet instead of growing from the middle.
  // `mirror` flips the portrait horizontally without needing a second set
  // of art.
  draw(ctx, character, motion, { x, y, width = 220, height = 380, scale = 1, mirror = false, dim = false } = {}) {
    if (!character) return;
    const sway = motion?.swayX ?? 0;
    const tilt = motion?.tiltRad ?? 0;
    const breatheY = motion?.breatheScaleY ?? 1;
    const bounce = motion?.talkBounceY ?? 0;
    const blinking = motion?.blinking ?? false;

    // A segmented character (breathingSplit set) keeps the outer transform
    // rigid and applies breathing only to the 'upper' slot below, pivoted at
    // the seam - a plain single-image character has no seam to pivot at, so
    // the whole rigid image breathes together instead (a coarser but
    // zero-extra-art fallback).
    const segmented = character.breathingSplit != null;
    const seamY = segmented ? -height * (1 - character.breathingSplit) : null;

    ctx.save();
    ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.translate(x + sway, y + bounce);
    ctx.rotate(tilt);
    ctx.scale(scale, segmented ? scale : scale * breatheY);

    // Mirroring is applied per image draw, not to the whole transform - it
    // must only flip facing direction in actual art, never the placeholder
    // fallback's box/label, which would otherwise render its name reversed
    // (e.g. "小安" -> "安小") whenever this character stands on the right.
    let drewAny = false;
    for (const slot of character.slots) {
      let variant = character.getLayer(slot);
      if (!variant) continue;
      if (slot === 'eyes' && blinking) variant = `${variant}_closed`;

      const src = `${this.root}/${character.id}/${slot}/${variant}.png`;
      const entry = this.images.get(src);
      if (entry.ready) {
        ctx.save();
        if (slot === 'upper' && seamY != null) {
          // Pivot exactly on the seam: the boundary between the two pieces
          // never moves (no gap/overlap ever appears there), only the
          // content above it stretches - reads as the chest rising from a
          // fixed waist instead of the whole body zooming from its feet.
          ctx.translate(0, seamY);
          ctx.scale(1, breatheY);
          ctx.translate(0, -seamY);
        }
        if (mirror) ctx.scale(-1, 1);
        ctx.drawImage(entry.image, -width / 2, -height, width, height);
        ctx.restore();
        drewAny = true;
      }
    }

    if (!drewAny) this._drawPlaceholder(ctx, character, width, height);
    ctx.restore();
  }

  _drawPlaceholder(ctx, character, width, height) {
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
  }
}
