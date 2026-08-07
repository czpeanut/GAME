import { Scene } from '../../engine/scene.js';
import { VIEW, TILE, PLAYER } from '../constants.js';
import { Player } from '../player.js';
import { Bullet } from '../bullet.js';
import { ENEMY_TYPES } from '../enemy.js';
import { StoryTrigger, Npc } from '../trigger.js';
import { Background } from '../background.js';
import { TileRenderer } from '../tilerender.js';
import { Camera } from '../../engine/camera.js';
import { Particles } from '../../engine/particles.js';
import { aabb } from '../../engine/math.js';

// The gameplay world: level geometry, the player, enemies, bullets,
// checkpoints, story triggers and NPCs. Sits at the bottom of the scene
// stack for the whole game session - it is never popped, only ever paused
// behind whatever is currently on top of it.
//
// Three flags, set by whichever overlay scene is currently on top (Title,
// Pause, Death, Win, Dialogue, Cutscene), decide how much of this scene
// actually runs on a given frame:
//
//   frozen    - hard stop: nothing updates, not even ambient particles or the
//               camera. Used only by PauseScene, matching "pause" meaning
//               pause.
//   simulate  - when false, physics/enemies/bullets/collisions are skipped,
//               but particles, background and the camera keep animating so
//               the scene underneath a dialogue box or a title screen still
//               feels alive rather than looking like a freeze-frame.
//   showHud   - when false, the persistent health/dash/score chrome is
//               hidden. Only the title screen turns this off.
export class WorldScene extends Scene {
  constructor(game) {
    super(game);
    this.simulate = true;
    this.frozen = false;
    this.showHud = true;
    this.freezeT = 0;
    this.goalPulse = 0;
    this.nearNpc = null;
  }

  loadLevel(level, factory) {
    this.level = level;
    if (factory) this.levelFactory = factory;

    this.tiles = new TileRenderer(level.map);
    this.background = new Background(level.map.width, level.map.height, VIEW.width, VIEW.height);
    this.camera = this.camera ?? new Camera(VIEW.width, VIEW.height);
    this.camera.setBounds(0, 0, level.map.width, level.map.height);
    this.particles = this.particles ?? new Particles();

    this.player = new Player(level.playerStart.x, level.playerStart.y, this.game);
    this.bullets = [];
    this.enemies = [];
    this._spawnEnemies();

    this.checkpoints = level.checkpoints.map((c) => ({ ...c, active: false }));
    this.triggers = (level.triggers ?? []).map((t) => new StoryTrigger(t));
    this.npcs = (level.npcs ?? []).map((n) => new Npc(n));
    this.activeCheckpoint = { x: level.playerStart.x, y: level.playerStart.y };
    this.goal = level.goal ?? null;
    this.goalPulse = 0;
    this.nearNpc = null;

    this.camera.snapTo(this.player.body);
    this.particles.clear();
    this.score = 0;
    this.deaths = 0;
    this.elapsed = 0;
    this.flash = 0;
    this.freezeT = 0;
  }

  // Reloads whatever level builder function was last passed to loadLevel -
  // used by WinScene's "play again" and available to story content that wants
  // to restart the current level from scratch.
  reload() {
    if (this.levelFactory) this.loadLevel(this.levelFactory(), this.levelFactory);
  }

  _spawnEnemies() {
    for (const s of this.level.spawns) {
      const Type = ENEMY_TYPES[s.type];
      if (!Type) continue;
      const e = new Type(s.x, s.y, this.game);
      // Spawn rows name the tile the enemy occupies, so drop the body until
      // its feet rest on the bottom of that tile.
      e.body.y = s.y - e.body.h + TILE;
      if (e.homeX !== undefined) {
        e.homeX = e.body.centerX;
        e.homeY = e.body.centerY;
      }
      this.enemies.push(e);
    }
  }

  freeze(seconds) {
    this.freezeT = Math.max(this.freezeT, seconds);
  }

  spawnBullet(x, y, dx, dy) {
    this.bullets.push(new Bullet(x, y, dx, dy, { fromPlayer: true }));
  }

  respawn() {
    const cp = this.activeCheckpoint;
    this.player.respawn(cp.x, cp.y);
    this.bullets.length = 0;
    this.freezeT = 0;

    // Every enemy is restored on death, so a retry always starts from a known
    // state rather than a half-cleared level the player can no longer survive.
    this.enemies = [];
    this._spawnEnemies();

    this.camera.snapTo(this.player.body);
    this.game.hud.showMessage('');
  }

  update(dt, input) {
    this.goalPulse += dt;

    if (this.frozen) return; // hard pause: nothing moves at all

    if (!this.simulate) {
      // Ambient life behind an overlay (title/dead/won/dialogue/cutscene).
      this.particles.update(dt);
      this.background.update(dt);
      this.camera.update(dt, this.player.body);
      return;
    }

    if (input.pressed('restart')) {
      this.respawn();
      return;
    }

    // Hit-stop: hold gameplay still but keep particles/camera/background alive
    // so the freeze reads as impact rather than a dropped frame.
    if (this.freezeT > 0) {
      this.freezeT -= dt;
      this.particles.update(dt * 0.35);
      this.background.update(dt);
      this.camera.update(dt, this.player.body);
      return;
    }

    this.elapsed += dt;
    this.flash = Math.max(0, this.flash - dt * 4);

    const map = this.level.map;

    this.player.update(dt, input, map);
    for (const e of this.enemies) e.update(dt, this.player, map);
    for (const b of this.bullets) b.update(dt, map);

    this._resolveCollisions();
    this._checkCheckpoints();
    this._checkTriggers();
    this._checkNpcs(input);
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
    this.game.hud.update(dt);
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
    // damage instead of hurting the player - stomping is too satisfying to
    // omit.
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
        this.game.audio.tone({ freq: 520, endFreq: 180, type: 'square', dur: 0.1, gain: 0.14 });
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
      this.game.audio.checkpoint();
      this.game.hud.showMessage('CHECKPOINT');
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

  _checkTriggers() {
    for (const t of this.triggers) t.update(this.player.rect, this, this.game);
  }

  _checkNpcs(input) {
    this.nearNpc = null;
    for (const n of this.npcs) {
      n.update(1 / 60);
      if (n.isNear(this.player)) this.nearNpc = n;
    }
    if (this.nearNpc && input.pressed('interact')) {
      this.nearNpc.interact(this, this.game);
    }
  }

  // Only ever called from the full-simulation branch of update(), which stops
  // running the instant onLevelWon() below flips `simulate` to false - so
  // there is no need to separately guard against firing twice.
  _checkGoal() {
    if (!this.goal) return;
    if (!aabb(this.player.rect, this.goal)) return;

    this.game.onLevelWon();
    this.particles.burst(this.goal.x + this.goal.w / 2, this.goal.y + this.goal.h / 2, 70, {
      color: ['#9af0ff', '#ffffff', '#ffe9a8'],
      speedMin: 60,
      speedMax: 330,
      lifeMin: 0.5,
      lifeMax: 1.3,
      gravity: 120,
      shape: 'circle',
      sizeMin: 2,
      sizeMax: 6,
    });
  }

  // -------------------------------------------------------------------------
  render(ctx) {
    const camX = this.camera.renderX;
    const camY = this.camera.renderY;

    this.background.render(ctx, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);

    this.tiles.render(ctx, camX, camY, VIEW.width, VIEW.height);
    this._renderCheckpoints(ctx);
    this._renderNpcs(ctx);
    this._renderGoal(ctx);

    for (const e of this.enemies) {
      if (this.camera.isVisible(e)) e.render(ctx);
    }
    for (const b of this.bullets) b.render(ctx);

    this.player.render(ctx);
    this.particles.render(ctx);

    ctx.restore();

    this._vignette(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,60,90,${this.flash * 0.25})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }

    if (this.showHud) this.game.hud.render(ctx, this.game);
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

  _renderNpcs(ctx) {
    for (const n of this.npcs) {
      if (!this.camera.isVisible(n)) continue;
      n.render(ctx);
      if (n === this.nearNpc) {
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText('E', n.centerX, n.y - 6);
      }
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
}
