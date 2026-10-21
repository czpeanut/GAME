import { rand } from '../engine/math.js';

// A weapon lying on the ground. Walking over it equips it immediately (no
// prompt, no button) - consistent with how checkpoints and story triggers
// already work in this game (walk-over, not press-to-interact), which is
// reserved for NPCs where a conversation is a deliberate choice rather than
// something you'd want to trigger by accident mid-fight.
export class WeaponPickup {
  constructor({ id, x, y, weaponId, w = 16, h = 16 }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.weaponId = weaponId;
    this.collected = false;
    this.bob = rand(0, Math.PI * 2);
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
  get centerX() {
    return this.x + this.w / 2;
  }

  update(dt) {
    this.bob += dt * 2.2;
  }

  render(ctx) {
    const floatY = this.y + Math.sin(this.bob) * 2;
    const cx = this.x + this.w / 2;
    const cy = floatY + this.h / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 6;

    switch (this.weaponId) {
      case 'stick':
        ctx.strokeStyle = '#8a6a42';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy + 6);
        ctx.lineTo(cx + 6, cy - 6);
        ctx.stroke();
        break;
      case 'knife':
        ctx.fillStyle = '#c7d0da';
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy + 5);
        ctx.lineTo(cx + 4, cy - 4);
        ctx.lineTo(cx + 6, cy - 2);
        ctx.lineTo(cx - 3, cy + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#5a4632';
        ctx.fillRect(cx - 7, cy + 4, 4, 3);
        break;
      case 'pistol':
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(cx - 6, cy - 2, 10, 4);
        ctx.fillRect(cx - 6, cy + 1, 4, 5);
        ctx.fillStyle = '#c7d0da';
        ctx.fillRect(cx + 3, cy - 1, 3, 2);
        break;
      default:
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
    }
    ctx.restore();
  }
}
