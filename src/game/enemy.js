import { Body } from './body.js';
import { PHYS, COLORS, TILE } from './constants.js';
import { clamp, sign, rand, damp, approach } from '../engine/math.js';
import { makeEnemyBullet } from './bullet.js';
import { isSolidTile } from '../engine/tilemap.js';
import { walkerSheet, WALKER_ANIMS } from './art.js';

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
  // The area that hurts the player on touch. Most enemies are harmful to
  // touch anywhere; ones with a real attack override this.
  harmRect() {
    return this.rect;
  }

  // How far above the hitbox the health bar floats; sprites taller than
  // their hitbox raise it so it clears the head.
  get barLift() { return 7; }

  update(dt, player, map) {
    this.hitFlash -= dt;
    this.wobble += dt;
    this.think(dt, player, map);
  }

  hurt(amount, knockDir, force = 130) {
    if (this.dead) return;
    this.health -= amount;
    this.hitFlash = 0.12;
    this.body.vx += knockDir * force;

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
    const y = this.y - this.barLift;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#3a2030';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = COLORS.enemy;
    ctx.fillRect(x, y, w * clamp(this.health / this.maxHealth, 0, 1), 3);
  }
}

// ---------------------------------------------------------------------------
// Walker: a knife-wielding looter, and the primary early threat - meant to be
// fought with whatever melee weapon is at hand before firearms enter the
// story. Every attack is telegraphed so a careful player can read and punish
// it:
//
//   patrol   -> walks its platform, turning at walls and ledges
//   alert    -> spotted the player: stops dead, "!" over its head
//   approach -> walks (not runs) toward the player - slower than the player
//               can run, so backing off is always an option
//   windup   -> knife drawn back, glinting: the cue to dodge or strike first
//   stab     -> a short lunge; the ONLY moment the knife can hurt
//   recover  -> overextended and open after the stab
//   stagger  -> any hit interrupts whatever it was doing
//
// Bumping into a looter that is not mid-stab does no damage - the threat is
// the blade, not the body.
export const WALKER = {
  patrolSpeed: 45,
  approachSpeed: 85,
  sightX: 200,
  sightY: 60,
  alertTime: 0.55,
  loseTime: 1.6, // out of sight this long -> back to patrolling
  stabRange: 46, // centre-to-centre distance that starts the wind-up
  windupTime: 0.45,
  stabTime: 0.16,
  stabSpeed: 260,
  reach: 16, // how far the blade extends past the body during the stab
  recoverTime: 0.75,
  staggerTime: 0.4,
};

export class Walker extends Enemy {
  constructor(x, y, game) {
    super(x, y, 22, 26, game);
    this.maxHealth = this.health = 3;
    this.state = 'patrol';
    this.stateT = 0;
    this.unseenT = 0;
    this.legPhase = rand(0, Math.PI * 2);
  }

  _enter(state, time = 0) {
    this.state = state;
    this.stateT = time;
    if (state === 'windup') {
      this.game.audio.tone?.({ freq: 260, endFreq: 620, type: 'triangle', dur: 0.14, gain: 0.07 });
    }
  }

  hurt(amount, knockDir, force) {
    super.hurt(amount, knockDir, force);
    // Getting hit always breaks the attack - landing the first blow matters.
    if (!this.dead) this._enter('stagger', WALKER.staggerTime);
  }

  // Only the stab hurts, and only within the blade's reach in front.
  harmRect() {
    if (this.state !== 'stab') return null;
    const r = this.rect;
    return this.facing > 0
      ? { x: r.x, y: r.y, w: r.w + WALKER.reach, h: r.h }
      : { x: r.x - WALKER.reach, y: r.y, w: r.w + WALKER.reach, h: r.h };
  }

  think(dt, player, map) {
    const b = this.body;
    const W = WALKER;
    const dx = player.centerX - this.centerX;
    const dy = player.centerY - this.centerY;
    const sees = player.alive && Math.abs(dx) < W.sightX && Math.abs(dy) < W.sightY;
    this.unseenT = sees ? 0 : this.unseenT + dt;
    this.stateT -= dt;

    let targetVx = 0;
    let accel = 900;
    switch (this.state) {
      case 'patrol':
        targetVx = this.facing * W.patrolSpeed;
        accel = 500;
        if (sees) {
          this.facing = sign(dx) || this.facing;
          this._enter('alert', W.alertTime);
        }
        break;
      case 'alert':
        this.facing = sign(dx) || this.facing;
        if (this.stateT <= 0) this._enter('approach');
        break;
      case 'approach':
        this.facing = sign(dx) || this.facing;
        if (this.unseenT > W.loseTime) this._enter('patrol');
        else if (Math.abs(dx) < W.stabRange && Math.abs(dy) < 30) this._enter('windup', W.windupTime);
        else if (!this._ledgeAhead(map)) targetVx = this.facing * W.approachSpeed;
        accel = 600;
        break;
      case 'windup':
        // Committed to its direction from here: a player who steps behind it
        // during the wind-up gets a free hit.
        if (this.stateT <= 0) {
          this._enter('stab', W.stabTime);
          b.vx = this.facing * W.stabSpeed;
        }
        break;
      case 'stab':
        targetVx = this.facing * W.stabSpeed;
        accel = 2000;
        if (this.stateT <= 0) this._enter('recover', W.recoverTime);
        break;
      case 'recover':
        accel = 700;
        if (this.stateT <= 0) this._enter(sees ? 'approach' : 'patrol');
        break;
      case 'stagger':
        accel = 400; // let the knockback carry
        if (this.stateT <= 0) this._enter(sees ? 'approach' : 'patrol');
        break;
    }
    b.vx = approach(b.vx, targetVx, accel * dt);

    b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxFall);
    b.move(map, dt);

    if (this.state === 'patrol') {
      if (b.wallLeft && this.facing < 0) this.facing = 1;
      else if (b.wallRight && this.facing > 0) this.facing = -1;
      else if (this._ledgeAhead(map)) this.facing *= -1;
    }

    this.legPhase += Math.abs(b.vx) * dt * 0.09;
  }

  _ledgeAhead(map) {
    const b = this.body;
    if (!b.grounded) return false;
    const probeX = this.facing > 0 ? b.right + 2 : b.x - 2;
    return !isSolidTile(map.atPixel(probeX, b.bottom + 4));
  }

  // Which sheet cell is showing. Driven by legPhase, which already advances
  // with actual ground speed, so the feet never slide.
  _spriteCell() {
    const A = WALKER_ANIMS.attack;
    switch (this.state) {
      case 'alert': return { col: 0, row: A.row };
      case 'windup': return { col: 1, row: A.row };
      case 'stab': return { col: 2, row: A.row };
      case 'recover':
        // Still overextended for the first moment, then back on its feet.
        return this.stateT > WALKER.recoverTime - 0.2 ? { col: 2, row: A.row } : { col: 0, row: WALKER_ANIMS.walk.row };
      case 'stagger': return { col: 3, row: A.row };
      default: {
        const anim = WALKER_ANIMS.walk;
        return { col: Math.floor(this.legPhase / (Math.PI / 2)) % anim.frames, row: anim.row };
      }
    }
  }

  // Telegraph overlays, drawn on top of either art set: a "!" when it spots
  // the player, and a blinking glint on the blade during the wind-up.
  _drawTells(ctx) {
    const top = this.y - (walkerSheet?.ready ? 18 : 6);
    if (this.state === 'alert') {
      ctx.fillStyle = '#ffe14d';
      ctx.fillRect(this.centerX - 1, top - 9, 3, 6);
      ctx.fillRect(this.centerX - 1, top - 2, 3, 2);
    } else if (this.state === 'windup' && Math.floor(this.stateT * 16) % 2 === 0) {
      const gx = this.centerX - this.facing * 12;
      const gy = this.y + this.h - 12;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff6d0';
      ctx.fillRect(gx - 4, gy, 9, 1);
      ctx.fillRect(gx, gy - 4, 1, 9);
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.fillRect(this.centerX - 1, top - 9, 3, 6);
      ctx.fillRect(this.centerX - 1, top - 2, 3, 2);
      ctx.restore();
    }
  }

  // Sprite drawn feet-on-hitbox-bottom, centred, flipped by facing. The
  // sheet's art faces right. The figure is taller than the 22x26 hitbox,
  // like the player's - the head overhangs it.
  _drawSprite(ctx, silhouette) {
    const { col, row } = this._spriteCell();
    const fw = walkerSheet.frameW;
    const fh = walkerSheet.frameH;
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h);
    ctx.scale(this.facing, 1);
    if (silhouette) walkerSheet.drawFrameSilhouette(ctx, col, row, -fw / 2, -fh + 1);
    else walkerSheet.drawFrame(ctx, col, row, -fw / 2, -fh + 1);
    ctx.restore();
  }

  get barLift() { return walkerSheet?.ready ? 24 : 7; }

  drawSilhouette(ctx) {
    if (walkerSheet?.ready) this._drawSprite(ctx, true);
    else super.drawSilhouette(ctx);
  }

  draw(ctx) {
    if (walkerSheet?.ready) {
      this._drawSprite(ctx, false);
      this._drawTells(ctx);
      return;
    }
    this._drawTells(ctx);
    const { x, y, w, h } = this;
    const charging = this.state === 'windup' || this.state === 'stab';
    const cx = x + w / 2;
    const bodyColor = charging ? '#ff7089' : this.color;
    const stride = Math.sin(this.legPhase) * 2;

    // Legs: a simple walk cycle, opposed.
    ctx.fillStyle = COLORS.enemyDark;
    ctx.fillRect(cx - 5, y + h - 8 + stride, 3, 8 - stride);
    ctx.fillRect(cx + 2, y + h - 8 - stride, 3, 8 + stride);

    // Torso.
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x + 3, y + 9, w - 6, h - 17);

    // Head.
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx, y + 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eyes, biased toward facing - the only readable "expression" at this
    // size, brighter and wider-set while charging to read as aggressive.
    ctx.fillStyle = charging ? '#fff3a0' : '#1a0a10';
    const eyeX = cx + this.facing * 2;
    ctx.fillRect(eyeX - 2, y + 5, 2, 2);
    ctx.fillRect(eyeX + 1, y + 5, 2, 2);

    // The knife: held low at rest, thrust out ahead of the lunge while
    // charging - the clearest possible telegraph that contact with this
    // enemy is a blade, not a shove.
    const reach = charging ? 11 : 4;
    const knifeY = y + h - 13;
    const tipX = cx + this.facing * (w / 2 + reach);
    ctx.save();
    ctx.strokeStyle = '#0c0608';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + this.facing * (w / 2 - 2), knifeY + 2);
    ctx.lineTo(cx + this.facing * (w / 2 + reach * 0.4), knifeY);
    ctx.stroke();
    // Blade.
    ctx.fillStyle = charging ? '#f4f7ff' : '#c7d0da';
    ctx.beginPath();
    ctx.moveTo(cx + this.facing * (w / 2 + reach * 0.3), knifeY - 2);
    ctx.lineTo(tipX, knifeY - 1);
    ctx.lineTo(cx + this.facing * (w / 2 + reach * 0.3), knifeY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
