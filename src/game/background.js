import { COLORS } from './constants.js';
import { rand } from '../engine/math.js';

// Parallax backdrop. Each layer scrolls at a fraction of the camera speed, so
// distant layers barely move and near layers almost keep up - the cheapest and
// most effective way to sell depth in a 2D scroller.
//
// Layers are generated once from a seeded-ish random and then only translated,
// so scrolling costs nothing beyond the draw calls.
export class Background {
  constructor(levelW, levelH, viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.levelW = levelW;
    this.levelH = levelH;
    this.time = 0;

    this.layers = [
      this._makeSpires(0.12, levelW, COLORS.bg1, 0.55, 260, 30),
      this._makeSpires(0.28, levelW, COLORS.bg2, 0.7, 200, 46),
      this._makeSpires(0.5, levelW, COLORS.bg3, 0.85, 150, 62),
    ];

    // Slow drifting motes in front of the far layers.
    this.motes = Array.from({ length: 70 }, () => ({
      x: rand(0, viewW),
      y: rand(0, viewH),
      r: rand(0.6, 2.1),
      speed: rand(4, 18),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.15, 0.5),
    }));
  }

  _makeSpires(factor, levelW, color, alpha, maxH, spacing) {
    const shapes = [];
    // Generate across the parallax-compressed width, plus a screen of slack.
    const span = levelW * factor + this.viewW * 2;
    for (let x = -spacing; x < span; x += rand(spacing * 0.6, spacing * 1.5)) {
      shapes.push({
        x,
        w: rand(spacing * 0.8, spacing * 2.4),
        h: rand(maxH * 0.4, maxH),
      });
    }
    return { factor, color, alpha, shapes };
  }

  update(dt) {
    this.time += dt;
  }

  render(ctx, camX, camY) {
    const { viewW, viewH } = this;

    // Vertical gradient sky.
    const grad = ctx.createLinearGradient(0, 0, 0, viewH);
    grad.addColorStop(0, COLORS.bg0);
    grad.addColorStop(0.65, COLORS.bg1);
    grad.addColorStop(1, '#161d33');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, viewH);

    // Motes drift up and wrap around, independent of the camera.
    ctx.save();
    for (const m of this.motes) {
      const y = ((m.y - this.time * m.speed) % viewH + viewH) % viewH;
      const x = ((m.x - camX * 0.06 + Math.sin(this.time * 0.4 + m.phase) * 12) % viewW + viewW) % viewW;
      ctx.globalAlpha = m.alpha * (0.6 + 0.4 * Math.sin(this.time * 2 + m.phase));
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Spire layers, drawn far to near.
    for (const layer of this.layers) {
      const ox = -camX * layer.factor;
      // Vertical parallax is much weaker than horizontal, which keeps the
      // horizon steady while jumping.
      const oy = -camY * layer.factor * 0.35;
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = layer.color;
      for (const s of layer.shapes) {
        const x = s.x + ox;
        if (x + s.w < 0 || x > this.viewW) continue; // cull off-screen spires
        const baseY = viewH + oy + 40;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.lineTo(x + s.w * 0.5, baseY - s.h);
        ctx.lineTo(x + s.w, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
