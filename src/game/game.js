import { VIEW, COLORS, TILE, PLAYER } from './constants.js';
import { Player } from './player.js';
import { Bullet } from './bullet.js';
import { ENEMY_TYPES } from './enemy.js';
import { buildLevel1 } from './level.js';
import { Background } from './background.js';
import { TileRenderer } from './tilerender.js';
import { HUD } from './hud.js';
import { Camera } from '../engine/camera.js';
import { Particles } from '../engine/particles.js';
import { Audio } from '../engine/audio.js';
import { aabb, clamp } from '../engine/math.js';

// Owns the world, the update order and the render order.
//
// Update order matters: input -> player -> enemies -> bullets -> collisions.
// Resolving collisions last means everything is at its final position for the
// frame, so a bullet can never register a hit against a stale enemy position.
export class Game {
  constructor(ctx, input, loop) {
    this.ctx = ctx;
    this.input = input;
    this.loop = loop;

    this.camera = new Camera(VIEW.width, VIEW.height);
    this.particles = new Particles();
    this.audio = new Audio();
    this.hud = new HUD();

    this.state = 'title'; // title | playing | paused | dead | won
    this.showDebug = false;
    this.freezeT = 0;
    this.score = 0;
    this.deaths = 0;
    this.elapsed = 0;
    this.deathT = 0;
    this.flash = 0;

    this.loadLevel(buildLevel1());
  }

  get loopFrame() {
    return this.loop.frame;
  }

  loadLevel(level) {
    this.level = level;
    this.tiles = new TileRenderer(level.map);
    this.background = new Background(
      level.map.width,
      level.map.height,
      VIEW.width,
      VIEW.height
    );
    this.camera.setBounds(0, 0, level.map.width, level.map.height);

    this.player = new Player(level.playerStart.x, level.playerStart.y, this);
    this.bullets = [];
    this.enemies = [];
    this.spawnEnemies();

    this.checkpoints = level.checkpoints.map((c) => ({ ...c, active: false }));
    this.activeCheckpoint = { x: level.playerStart.x, y: level.playerStart.y };
    this.goal = level.goal;
    this.goalPulse = 0;

    this.camera.snapTo(this.player.body);
    this.particles.clear();
    this.score = 0;
    this.deaths = 0;
    this.elapsed = 0;
  }

  spawnEnemies() {
    for (const s of this.level.spawns) {
      const Type = ENEMY_TYPES[s.type];
      if (!Type) continue;
      // Spawn coordinates are the tile the enemy stands *on*, so shift the body
      // up by its own height to sit on that surface.
      const e = new Type(s.x, s.y, this);
      // Spawn rows name the tile the enemy occupies, so drop the body until its
      // feet rest on the bottom of that tile.
      e.body.y = s.y - e.body.h + TILE;
      // Hovering enemies anchor to their spawn point, which must be re-read
      // after the offset above or they drift toward the wrong altitude.
      if (e.homeX !== undefined) {
        e.homeX = e.body.centerX;
        e.homeY = e.body.centerY;
      }
      this.enemies.push(e);
    }
  }

  // Brief hit-stop. Freezing the simulation for a few frames on impact is what
  // makes hits feel like they connect with something solid.
  freeze(seconds) {
    this.freezeT = Math.max(this.freezeT, seconds);
  }

  start() {
    this.state = 'playing';
    this.hud.showMessage('ARROWS / WASD to move  -  J to fire  -  SHIFT to dash', 4);
  }

  update(dt) {
    this.input.poll();

    if (this.input.pressed('debug')) this.showDebug = !this.showDebug;
    if (this.input.pressed('mute')) {
      this.audio.unlock();
      this.hud.showMessage(this.audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1.2);
    }

    // Drives every ambient pulse in the game, including the title screen's
    // blinking prompt, so it has to advance in all states.
    this.goalPulse += dt;

    if (this.state === 'title') {
      if (this.input.pressed('jump') || this.input.pressed('fire') || this.input.pressed('pause')) {
        this.audio.unlock();
        this.start();
      }
      this.background.update(dt);
      this.hud.update(dt);
      return;
    }

    if (this.input.pressed('pause') && (this.state === 'playing' || this.state === 'paused')) {
      this.state = this.state === 'playing' ? 'paused' : 'playing';
      return;
    }

    if (this.state === 'paused') return;

    if (this.state === 'dead') {
      this.deathT += dt;
      this.particles.update(dt);
      this.camera.update(dt, this.player.body);
      // Allow a respawn once the death animation has had a moment to land.
      if (this.input.pressed('restart') && this.deathT > 0.5) this.respawn();
      return;
    }

    if (this.state === 'won') {
      this.particles.update(dt);
      this.camera.update(dt, this.player.body);
      if (this.input.pressed('restart')) {
        this.loadLevel(buildLevel1());
        this.state = 'playing';
      }
      return;
    }

    if (this.input.pressed('restart')) {
      this.respawn();
      return;
    }

    // Hit-stop: hold the world still but keep particles and the camera alive so
    // the freeze reads as impact rather than a dropped frame.
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.particles.update(dt * 0.35);
      this.camera.update(dt, this.player.body);
      return;
    }

    this.elapsed += dt;
    this.flash = Math.max(0, this.flash - dt * 4);

    const map = this.level.map;

    this.player.update(dt, this.input, map);

    for (const e of this.enemies) e.update(dt, this.player, map);
    for (const b of this.bullets) b.update(dt, map);

    this._resolveCollisions();
    this._checkCheckpoints();
    this._checkGoal();

    // Sweep dead entities once per frame rather than splicing mid-iteration.
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => {
      if (b.dead && b.hitWall) this._wallSpark(b);
      return !b.dead;
    });

    this.particles.update(dt);
    this.background.update(dt);
    this.camera.update(dt, this.player.body);
    this.hud.update(dt);
  }

  _wallSpark(b) {
    this.particles.burst(b.x, b.y, 5, {
      color: [b.color, '#ffffff'],
      speedMin: 30,
      speedMax: 130,
      angle: Math.atan2(-b.vy, -b.vx),
      spread: 0.9,
      lifeMin: 0.08,
      lifeMax: 0.24,
      sizeMin: 1,
      sizeMax: 3,
    });
  }

  _resolveCollisions() {
    const p = this.player;

    for (const b of this.bullets) {
      if (b.dead) continue;

      if (b.fromPlayer) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (aabb(b.rect, e.rect)) {
            e.hurt(b.damage, Math.sign(b.vx) || 1);
            b.dead = true;
            this.camera.addTrauma(0.06);
            break;
          }
        }
      } else if (p.alive && !p.invulnerable && aabb(b.rect, p.rect)) {
        p.hurt(b.damage, Math.sign(b.vx) || 1);
        b.dead = true;
      }
    }

    if (!p.alive) return;

    // Contact damage. Landing on an enemy from above bounces off it and deals
    // damage instead of hurting the player - stomping is too satisfying to omit.
    for (const e of this.enemies) {
      if (e.dead || !aabb(p.rect, e.rect)) continue;

      const falling = p.body.vy > 60;
      const above = p.body.bottom - e.body.y < 16;

      if (falling && above) {
        e.hurt(2, Math.sign(p.body.vx) || 1);
        p.body.vy = -430;
        p.airJumps = Math.max(p.airJumps, 1); // reward the stomp
        this.freeze(0.05);
        this.camera.addTrauma(0.14);
        this.audio.tone({ freq: 520, endFreq: 180, type: 'square', dur: 0.1, gain: 0.14 });
      } else if (!p.invulnerable) {
        p.hurt(e.contactDamage, Math.sign(p.centerX - e.centerX) || 1);
        this.flash = 0.6;
      }
    }
  }

  _checkCheckpoints() {
    for (const c of this.checkpoints) {
      if (c.active || !aabb(this.player.rect, c)) continue;
      c.active = true;
      // Respawn standing on the floor of the checkpoint's opening rather than
      // floating at its top corner.
      this.activeCheckpoint = { x: c.x, y: c.y + c.h - PLAYER.h };
      this.audio.checkpoint();
      this.hud.showMessage('CHECKPOINT');
      this.particles.burst(c.x + c.w / 2, c.y + c.h / 2, 24, {
        color: ['#7fd4ff', '#ffffff'],
        speedMin: 40,
        speedMax: 190,
        lifeMin: 0.3,
        lifeMax: 0.8,
        gravity: -60,
        shape: 'circle',
        sizeMin: 2,
        sizeMax: 4,
      });
    }
  }

  _checkGoal() {
    if (!this.goal || this.state === 'won') return;
    if (!aabb(this.player.rect, this.goal)) return;

    this.state = 'won';
    this.audio.win();
    this.camera.addTrauma(0.4);
    this.particles.burst(
      this.goal.x + this.goal.w / 2,
      this.goal.y + this.goal.h / 2,
      70,
      {
        color: ['#9af0ff', '#ffffff', '#ffe9a8'],
        speedMin: 60,
        speedMax: 330,
        lifeMin: 0.5,
        lifeMax: 1.3,
        gravity: 120,
        shape: 'circle',
        sizeMin: 2,
        sizeMax: 6,
      }
    );
  }

  spawnBullet(x, y, dx, dy) {
    this.bullets.push(new Bullet(x, y, dx, dy, { fromPlayer: true }));
  }

  onEnemyKilled(e) {
    this.score += e.scoreValue;
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.deaths++;
    this.deathT = 0;
    this.flash = 1;
  }

  respawn() {
    const cp = this.activeCheckpoint;
    this.player.respawn(cp.x, cp.y);
    this.bullets.length = 0;
    this.state = 'playing';
    this.freezeT = 0;

    // Every enemy is restored on death, so a retry always starts from a known
    // state rather than a half-cleared level the player can no longer survive.
    this.enemies = [];
    this.spawnEnemies();

    this.camera.snapTo(this.player.body);
    this.hud.showMessage('');
  }

  // -------------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);

    const camX = this.camera.renderX;
    const camY = this.camera.renderY;

    this.background.render(ctx, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);

    this.tiles.render(ctx, camX, camY, VIEW.width, VIEW.height);
    this._renderCheckpoints(ctx);
    this._renderGoal(ctx);

    for (const e of this.enemies) {
      if (this.camera.isVisible(e)) e.render(ctx);
    }
    for (const b of this.bullets) b.render(ctx);

    this.player.render(ctx);
    this.particles.render(ctx);

    ctx.restore();

    // Vignette + damage flash, both screen-space.
    this._vignette(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,60,90,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    if (this.state === 'title') this._renderTitle(ctx);
    else this.hud.render(ctx, this);
  }

  _renderCheckpoints(ctx) {
    for (const c of this.checkpoints) {
      if (!this.camera.isVisible(c)) continue;
      const cx = c.x + c.w / 2;
      const pulse = 0.6 + 0.4 * Math.sin(this.goalPulse * 3 + c.x);

      ctx.fillStyle = c.active ? '#7fd4ff' : '#44557f';
      if (c.active) {
        ctx.shadowColor = '#7fd4ff';
        ctx.shadowBlur = 14 * pulse;
      }
      ctx.fillRect(cx - 2, c.y, 4, c.h);
      ctx.beginPath();
      ctx.arc(cx, c.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _renderGoal(ctx) {
    const g = this.goal;
    if (!g || !this.camera.isVisible(g)) return;
    const cx = g.x + g.w / 2;
    const cy = g.y + g.h / 2;
    const pulse = 0.7 + 0.3 * Math.sin(this.goalPulse * 2.5);

    ctx.save();
    ctx.shadowColor = '#9af0ff';
    ctx.shadowBlur = 26 * pulse;
    ctx.strokeStyle = '#9af0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 16 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 24 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e8ffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _vignette(ctx) {
    const g = ctx.createRadialGradient(
      VIEW.width / 2,
      VIEW.height / 2,
      VIEW.height * 0.35,
      VIEW.width / 2,
      VIEW.height / 2,
      VIEW.height * 0.85
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  _renderTitle(ctx) {
    ctx.fillStyle = 'rgba(6,8,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf3ff';
    ctx.font = '26px monospace';
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 18;
    ctx.fillText('HOLLOW RUNNER', VIEW.width / 2, 120);
    ctx.shadowBlur = 0;

    ctx.font = '9px monospace';
    ctx.fillStyle = '#8fa7d8';
    ctx.fillText('a 2D action shooter', VIEW.width / 2, 142);

    const rows = [
      'MOVE      A D  /  arrows',
      'JUMP      SPACE  /  K        (hold higher, tap lower)',
      'FIRE      J  /  Z            (hold up or down to aim)',
      'DASH      SHIFT  /  L        (8 directions, i-frames)',
      'WALL      slide and jump off walls',
    ];
    ctx.font = '8px monospace';
    rows.forEach((r, i) => {
      ctx.fillStyle = '#7f93c0';
      ctx.fillText(r, VIEW.width / 2, 186 + i * 14);
    });

    const blink = Math.sin(this.goalPulse * 4) > -0.3;
    if (blink) {
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9af0ff';
      ctx.fillText('press SPACE to begin', VIEW.width / 2, 286);
    }
  }
}
