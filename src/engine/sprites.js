// Sprite sheet loading and frame blitting.
//
// Loading is fire-and-forget: the game starts immediately and `ready` flips to
// true whenever the image arrives. Every caller is expected to have a drawing
// fallback, so a missing or broken PNG degrades to the procedural art instead
// of crashing or showing nothing.

export class SpriteSheet {
  constructor({ src, frameW, frameH }) {
    this.src = src;
    this.frameW = frameW;
    this.frameH = frameH;
    this.ready = false;
    this.failed = false;
    this.image = null;
    this.load();
  }

  load() {
    if (typeof Image === 'undefined') return; // non-browser (tests)
    const img = new Image();
    img.onload = () => {
      this.image = img;
      this.ready = true;
      const cols = Math.floor(img.width / this.frameW);
      const rows = Math.floor(img.height / this.frameH);
      if (cols < 1 || rows < 1) {
        // The sheet loaded but does not fit the declared grid; refusing it here
        // keeps the fallback art rather than drawing garbage frames.
        this.ready = false;
        this.failed = true;
        console.warn(
          `[sprites] ${this.src} is ${img.width}x${img.height}, too small for ` +
            `${this.frameW}x${this.frameH} frames - using fallback art`
        );
      }
      this.cols = cols;
      this.rows = rows;
    };
    img.onerror = () => {
      this.failed = true;
      console.warn(`[sprites] could not load ${this.src} - using fallback art`);
    };
    img.src = this.src;
  }

  // Draws one cell of the grid with its top-left corner at (x, y).
  drawFrame(ctx, col, row, x, y) {
    if (!this.ready) return false;
    ctx.drawImage(
      this.image,
      col * this.frameW,
      row * this.frameH,
      this.frameW,
      this.frameH,
      x,
      y,
      this.frameW,
      this.frameH
    );
    return true;
  }
}
