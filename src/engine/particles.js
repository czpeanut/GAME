import { rand, randInt } from './math.js';

// Pooled particle system. Particles are recycled from a fixed-size pool so a
// heavy firefight never triggers a garbage-collection hitch mid-jump.
const POOL_SIZE = 900;

class Particle {
  constructor() {
    this.active = false;
    this.x = this.y = this.vx = this.vy = 0;
    this.life = this.maxLife = 0;
    this.size = 2;
    this.color = '#fff';
    this.gravity = 0;
    this.drag = 1;
    this.shape = 'square';
    this.spin = 0;
    this.angle = 0;
    this.fade = true;
  }
}

export class Particles {
  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => new Particle());
    this.cursor = 0;
  }

  _next() {
    // Ring buffer: if everything is busy we steal the oldest slot. Dropping one
    // stale spark is better than dropping the new effect the player just caused.
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_SIZE;
      if (!p.active) return p;
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    return p;
  }

  spawn(opts) {
    const p = this._next();
    p.active = true;
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.maxLife = p.life = opts.life ?? 0.4;
    p.size = opts.size ?? 3;
    p.color = opts.color ?? '#fff';
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0.98;
    p.shape = opts.shape ?? 'square';
    p.spin = opts.spin ?? 0;
    p.angle = opts.angle ?? 0;
    p.fade = opts.fade ?? true;
    return p;
  }

  burst(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = opts.angle !== undefined
        ? opts.angle + rand(-(opts.spread ?? Math.PI), opts.spread ?? Math.PI)
        : rand(0, Math.PI * 2);
      const speed = rand(opts.speedMin ?? 40, opts.speedMax ?? 220);
      this.spawn({
        ...opts,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(opts.lifeMin ?? 0.2, opts.lifeMax ?? 0.55),
        size: randInt(opts.sizeMin ?? 2, opts.sizeMax ?? 4),
        color: Array.isArray(opts.color)
          ? opts.color[randInt(0, opts.color.length - 1)]
          : opts.color,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
    }
  }

  render(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = p.fade ? Math.min(1, t * 1.4) : 1;
      ctx.fillStyle = p.color;

      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.fade ? t : 1), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'streak') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-p.size * 2, -p.size / 2, p.size * 4 * t, p.size);
        ctx.restore();
      } else {
        const s = p.size * (p.fade ? t : 1);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const p of this.pool) p.active = false;
  }

  get activeCount() {
    return this.pool.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }
}
