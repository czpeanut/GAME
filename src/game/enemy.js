import { Body } from './body.js';
import { PHYS, COLORS, TILE } from './constants.js';
import { clamp, sign, rand, damp, approach } from '../engine/math.js';
import { makeEnemyBullet } from './bullet.js';
import { isSolidTile } from '../engine/tilemap.js';

// Shared enemy behaviour: health, hit flash, knockback, death.
// Subclasses implement `think(dt, player, map)` and `draw(ctx)`.
class Enemy {
  constructor(x, y, w, h, game) {
    this.game = game;
    this.body = new Body(x, y, w, h);
    this.maxHealth = 3;
    this.health = 3;
    this.dead = false;
    this.hitFlash = 0;
    this.facing = -1;
    this.contactDamage = 1;
    this.scoreValue = 100;
    this.color = COLORS.enemy;
    this.wobble = rand(0, Math.PI * 2);
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get w() { return this.body.w; }
  get h() { return this.body.h; }
  get rect() { return this.body.rect; }
  get centerX() { return this.body.centerX; }
  get centerY() { return this.body.centerY; }

  update(dt, player, map) {
    this.hitFlash -= dt;
    this.wobble += dt;
    this.think(dt, player, map);
  }

  hurt(amount, knockDir) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 0.12;
    this.body.vx += knockDir * 130;

    this.game.audio.hitEnemy();
    this.game.freeze(0.03);
    this.game.particles.burst(this.centerX, this.centerY, 8, {
      color: ['#ffffff', COLORS.enemy],
      speedMin: 60,
      speedMax: 220,
      angle: knockDir > 0 ? 0 : Math.PI,
      spread: 1.0,
      lifeMin: 0.1,
      lifeMax: 0.3,
      sizeMin: 2,
      sizeMax: 4,
    });

    if (this.health <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.game.audio.enemyDie();
    this.game.camera.addTrauma(0.18);
    this.game.onEnemyKilled(this);
    this.game.particles.burst(this.centerX, this.centerY, 26, {
      color: [COLORS.enemy, COLORS.enemyDark, '#ffffff'],
      speedMin: 50,
      speedMax: 300,
      lifeMin: 0.25,
      lifeMax: 0.7,
      gravity: 380,
      shape: 'circle',
      sizeMin: 2,
      sizeMax: 6,
    });
  }

  render(ctx) {
    ctx.save();
    if (this.hitFlash > 0) {
      // Draw the silhouette pure white on a hit - the clearest possible
      // feedback that damage registered.
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      this.drawSilhouette(ctx);
    } else {
      this.draw(ctx);
    }
    ctx.restore();

    if (this.health < this.maxHealth && !this.dead) this._healthBar(ctx);
  }

  drawSilhouette(ctx) {
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  _healthBar(ctx) {
    const w = this.w;
    const x = this.x;
    const y = this.y - 7;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#3a2030';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(x, y, w * clamp(this.health / this.maxHealth, 0, 1), 3);
  }
}

// ---------------------------------------------------------------------------
// Walker: patrols a platform, turns at walls and ledges, charges when it sees
// the player.
export class Walker extends Enemy {
  constructor(x, y, game) {
    super(x, y, 26, 26, game);
    this.maxHealth = this.health = 3;
    this.speed = 62;
    this.chargeSpeed = 175;
    this.aggro = 0;
    this.legPhase = rand(0, Math.PI * 2);
  }

  think(dt, player, map) {
    const b = this.body;

    // Aggro when the player is close and roughly level with us.
    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    const sees = Math.abs(dx) < 220 && Math.abs(dy) < 70 && player.alive;
    if (sees) this.aggro = 1.6;
    this.aggro -= dt;

    if (this.aggro > 0) {
      this.facing = sign(dx) || this.facing;
      b.vx = approach(b.vx, this.facing * this.chargeSpeed, 900 * dt);
    } else {
      b.vx = approach(b.vx, this.facing * this.speed, 500 * dt);
    }

    b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxFall);
    b.move(map, dt);

    // Turn at a wall.
    if (b.wallLeft && this.facing < 0) this.facing = 1;
    else if (b.wallRight && this.facing > 0) this.facing = -1;

    // Turn at a ledge, but only while patrolling - a charging walker will
    // happily run off an edge, which makes the charge feel committed.
    if (b.grounded && this.aggro <= 0) {
      const probeX = this.facing > 0 ? b.right + 2 : b.x - 2;
      if (!isSolidTile(map.atPixel(probeX, b.bottom + 4))) this.facing *= -1;
    }

    this.legPhase += Math.abs(b.vx) * dt * 0.09;
  }

  draw(ctx) {
    const { x, y, w, h } = this;
    const charging = this.aggro > 0;
    ctx.fillStyle = charging ? '#ff7089' : this.color;

    // Legs
    ctx.fillStyle = COLORS.enemyDark;
    for (let i = 0; i < 3; i++) {
      const off = Math.sin(this.legPhase + i * 2.1) * 3;
      ctx.fillRect(x + 3 + i * 8, y + h - 4, 4, 5 + off);
    }

    // Shell
    ctx.fillStyle = charging ? '#ff7089' : this.color;
    ctx.beginPath();
    ctx.moveTo(x, y + h - 2);
    ctx.lineTo(x + 2, y + 6);
    ctx.quadraticCurveTo(x + w / 2, y - 4, x + w - 2, y + 6);
    ctx.lineTo(x + w, y + h - 2);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = charging ? '#fff3a0' : '#2a0f18';
    ctx.fillRect(x + (this.facing > 0 ? w - 10 : 5), y + 8, 5, 5);
  }
}

// ---------------------------------------------------------------------------
// Flyer: drifts on a sine path and swoops toward the player when close.
export class Flyer extends Enemy {
  constructor(x, y, game) {
    super(x, y, 24, 20, game);
    this.maxHealth = this.health = 2;
    this.color = COLORS.flyer;
    this.homeX = x;
    this.homeY = y;
    this.body.useOneWay = false;
    this.diveCd = rand(1, 2.5);
    this.diving = false;
    this.flap = rand(0, Math.PI * 2);
  }

  think(dt, player, map) {
    const b = this.body;
    this.flap += dt * 18;

    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    const dist = Math.hypot(dx, dy);

    this.diveCd -= dt;
    if (!this.diving && dist < 190 && this.diveCd <= 0 && player.alive) {
      this.diving = true;
      this.diveTime = 0.9;
    }

    if (this.diving) {
      this.diveTime -= dt;
      const len = dist || 1;
      b.vx = damp(b.vx, (dx / len) * 230, 4, dt);
      b.vy = damp(b.vy, (dy / len) * 230, 4, dt);
      if (this.diveTime <= 0) {
        this.diving = false;
        this.diveCd = rand(1.4, 2.8);
      }
    } else {
      // Return to a hover around the spawn point with a lazy sine bob.
      const targetY = this.homeY + Math.sin(this.wobble * 1.6) * 26;
      const targetX = this.homeX + Math.cos(this.wobble * 0.8) * 40;
      b.vx = damp(b.vx, (targetX - this.centerX) * 2.4, 3, dt);
      b.vy = damp(b.vy, (targetY - this.centerY) * 2.4, 3, dt);
    }

    this.facing = sign(dx) || this.facing;
    b.move(map, dt);
    // Bouncing off geometry instead of grinding along it keeps flyers lively.
    if (b.wallLeft || b.wallRight) b.vx *= -0.6;
    if (b.grounded || b.ceiling) b.vy *= -0.6;
  }

  draw(ctx) {
    const { x, y, w, h } = this;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const wingSpan = 8 + Math.sin(this.flap) * 5;

    ctx.fillStyle = '#8d55a0';
    ctx.beginPath();
    ctx.ellipse(cx - w / 2, cy - 2, wingSpan, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + w / 2, cy - 2, wingSpan, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.diving ? '#e59cf5' : this.color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.diving ? '#fff3a0' : '#33103d';
    ctx.fillRect(cx + this.facing * 4 - 2, cy - 3, 4, 4);
  }

  drawSilhouette(ctx) {
    ctx.beginPath();
    ctx.ellipse(this.centerX, this.centerY, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Turret: stationary, fires aimed volleys with a visible wind-up.
export class Turret extends Enemy {
  constructor(x, y, game) {
    super(x, y, 28, 28, game);
    this.maxHealth = this.health = 4;
    this.color = COLORS.turret;
    this.cooldown = rand(0.6, 1.6);
    this.charge = 0;
    this.range = 300;
    this.aimAngle = Math.PI;
  }

  think(dt, player, map) {
    const b = this.body;
    b.vx = approach(b.vx, 0, 400 * dt); // absorb knockback
    b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxFall);
    b.move(map, dt);

    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    const dist = Math.hypot(dx, dy);
    const inRange = dist < this.range && player.alive;

    if (inRange) {
      this.aimAngle = damp(this.aimAngle, Math.atan2(dy, dx), 6, dt);
      this.facing = sign(dx) || this.facing;
      this.cooldown -= dt;

      // Wind-up: the barrel glows for a beat before firing so the shot is
      // always telegraphed and therefore dodgeable.
      if (this.cooldown <= 0.35) this.charge = clamp(1 - this.cooldown / 0.35, 0, 1);

      if (this.cooldown <= 0) {
        this._fire();
        this.cooldown = rand(1.5, 2.3);
        this.charge = 0;
      }
    } else {
      this.charge = 0;
      this.cooldown = Math.max(this.cooldown, 0.5);
    }
  }

  _fire() {
    const dx = Math.cos(this.aimAngle);
    const dy = Math.sin(this.aimAngle);
    const mx = this.centerX + dx * 18;
    const my = this.centerY + dy * 18;
    this.game.bullets.push(makeEnemyBullet(mx, my, dx, dy));
    this.game.audio.tone({ freq: 300, endFreq: 120, type: 'sawtooth', dur: 0.14, gain: 0.12 });
    this.game.particles.burst(mx, my, 6, {
      color: [COLORS.enemyBullet, '#fff'],
      speedMin: 40,
      speedMax: 150,
      angle: this.aimAngle,
      spread: 0.5,
      lifeMin: 0.08,
      lifeMax: 0.22,
    });
  }

  draw(ctx) {
    const cx = this.centerX;
    const cy = this.centerY;

    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(this.x + 2, this.y + this.h - 8, this.w - 4, 8);

    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(cx, cy, this.w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    // Barrel
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.aimAngle);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(0, -4, 20, 8);
    if (this.charge > 0) {
      ctx.fillStyle = '#ff8fb0';
      ctx.shadowColor = '#ff4d7d';
      ctx.shadowBlur = 14 * this.charge;
      ctx.beginPath();
      ctx.arc(20, 0, 2 + this.charge * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#2a1608';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSilhouette(ctx) {
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const ENEMY_TYPES = { Walker, Flyer, Turret };
