import { clamp, damp, lerp } from './math.js';

// Scrolling camera with a dead zone, velocity look-ahead, level clamping and
// trauma-based screen shake.
//
// The dead zone is what makes small hops feel calm: the camera ignores the
// player entirely until they leave a box in the middle of the screen. Look-ahead
// then biases the view in the direction of travel so the player can see what
// they are running into rather than what they just left.
export class Camera {
  constructor(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.lookAhead = 0;
    this.bounds = { x: 0, y: 0, w: viewW, h: viewH };

    this.deadzoneW = 90;
    this.deadzoneH = 60;

    this.trauma = 0; // 0..1, decays every frame
    this.shakeX = 0;
    this.shakeY = 0;
    this.time = 0;
  }

  resize(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  setBounds(x, y, w, h) {
    this.bounds = { x, y, w, h };
  }

  // Snap instantly - used on spawn and after respawning at a checkpoint so the
  // camera doesn't sail across the level.
  snapTo(target) {
    this.lookAhead = 0;
    const { cx, cy } = this._focus(target, 0);
    this.targetX = cx;
    this.targetY = cy;
    this.x = cx;
    this.y = cy;
    this._clamp();
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  _focus(target, lookAhead) {
    return {
      cx: target.x + target.w / 2 - this.viewW / 2 + lookAhead,
      cy: target.y + target.h / 2 - this.viewH / 2,
    };
  }

  update(dt, target) {
    this.time += dt;

    // Look-ahead eases in with horizontal speed and eases back out when idle.
    const desiredLook = clamp((target.vx || 0) * 0.28, -140, 140);
    this.lookAhead = damp(this.lookAhead, desiredLook, 2.4, dt);

    const { cx, cy } = this._focus(target, this.lookAhead);

    // Horizontal dead zone: only move once the focus point escapes the box.
    const dx = cx - this.targetX;
    if (Math.abs(dx) > this.deadzoneW) {
      this.targetX += dx - Math.sign(dx) * this.deadzoneW;
    }

    // Vertical dead zone is tighter, and it snaps harder when the player is
    // grounded so falling doesn't leave the camera trailing behind.
    const dy = cy - this.targetY;
    const zoneH = target.grounded ? this.deadzoneH * 0.5 : this.deadzoneH;
    if (Math.abs(dy) > zoneH) {
      this.targetY += dy - Math.sign(dy) * zoneH;
    }

    this.x = damp(this.x, this.targetX, 7, dt);
    this.y = damp(this.y, this.targetY, target.grounded ? 8 : 5, dt);
    this._clamp();

    // Shake: trauma^2 gives a punchy falloff, so a big hit reads clearly while
    // small ones stay subtle.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const mag = this.trauma * this.trauma * 16;
    if (mag > 0.01) {
      const t = this.time * 46;
      this.shakeX = (Math.sin(t * 1.7) + Math.sin(t * 3.1)) * 0.5 * mag;
      this.shakeY = (Math.sin(t * 2.3) + Math.sin(t * 4.7)) * 0.5 * mag;
    } else {
      this.shakeX = lerp(this.shakeX, 0, 0.3);
      this.shakeY = lerp(this.shakeY, 0, 0.3);
    }
  }

  _clamp() {
    const b = this.bounds;
    // If the level is smaller than the view, centre it instead of clamping to 0.
    if (b.w <= this.viewW) this.targetX = this.x = b.x + (b.w - this.viewW) / 2;
    else {
      this.targetX = clamp(this.targetX, b.x, b.x + b.w - this.viewW);
      this.x = clamp(this.x, b.x, b.x + b.w - this.viewW);
    }
    if (b.h <= this.viewH) this.targetY = this.y = b.y + (b.h - this.viewH) / 2;
    else {
      this.targetY = clamp(this.targetY, b.y, b.y + b.h - this.viewH);
      this.y = clamp(this.y, b.y, b.y + b.h - this.viewH);
    }
  }

  // Final render offset, rounded to whole pixels to avoid shimmering edges.
  get renderX() {
    return Math.round(this.x + this.shakeX);
  }
  get renderY() {
    return Math.round(this.y + this.shakeY);
  }

  // Frustum test so we skip drawing anything off-screen.
  isVisible(e, margin = 64) {
    return (
      e.x + e.w > this.x - margin &&
      e.x < this.x + this.viewW + margin &&
      e.y + e.h > this.y - margin &&
      e.y < this.y + this.viewH + margin
    );
  }
}
