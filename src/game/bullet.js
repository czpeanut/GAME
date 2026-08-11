import { BULLET, ENEMY_BULLET, COLORS } from './constants.js';
import { isSolidTile } from '../engine/tilemap.js';

// Projectiles are simple point-ish movers. They sub-step their collision check
// so a 720px/s bullet cannot pass through a 32px wall in a single frame.
export class Bullet {
  constructor(x, y, dx, dy, opts = {}) {
    this.x = x;
    this.y = y;
    this.w = opts.w ?? BULLET.w;
    this.h = opts.h ?? BULLET.h;
    this.speed = opts.speed ?? BULLET.speed;
    this.vx = dx * this.speed;
    this.vy = dy * this.speed;
    this.life = opts.life ?? BULLET.life;
    this.damage = opts.damage ?? BULLET.damage;
    this.knockback = opts.knockback ?? 130;
    this.fromPlayer = opts.fromPlayer ?? true;
    this.dead = false;
    this.angle = Math.atan2(dy, dx);
    this.color = opts.color ?? COLORS.bullet;
    this.glow = opts.glow ?? COLORS.bulletGlow;
    this.radius = opts.radius ?? 0;
    this.age = 0;
  }

  // Bullets use a centred box for hit tests, unlike bodies which use top-left.
  get rect() {
    const size = this.radius || Math.max(this.w, this.h) * 0.6;
    return { x: this.x - size / 2, y: this.y - size / 2, w: size, h: size };
  }

  update(dt, map) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }

    const dist = Math.hypot(this.vx, this.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 0; i < steps; i++) {
      this.x += (this.vx / steps) * dt;
      this.y += (this.vy / steps) * dt;
      if (isSolidTile(map.atPixel(this.x, this.y))) {
        this.dead = true;
        this.hitWall = true;
        return;
      }
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = 10;

    if (this.radius) {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(this.angle);
      // A soft tail behind a bright head reads as motion even at 60fps.
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = this.glow;
      ctx.fillRect(-this.w, -this.h / 2 - 1, this.w * 1.6, this.h + 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

export function makeEnemyBullet(x, y, dx, dy) {
  return new Bullet(x, y, dx, dy, {
    speed: ENEMY_BULLET.speed,
    life: ENEMY_BULLET.life,
    damage: ENEMY_BULLET.damage,
    fromPlayer: false,
    radius: ENEMY_BULLET.r,
    color: COLORS.enemyBullet,
    glow: '#ff4d7d',
  });
}
