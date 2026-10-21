import { Body } from './body.js';
import { PLAYER, PHYS, COLORS } from './constants.js';
import { clamp, approach, sign, rand, damp, lerp } from '../engine/math.js';
import { Animator } from '../engine/animator.js';
import { SpriteSheet } from '../engine/sprites.js';
import { getWeapon } from './weapons.js';
import { ATTACK_TIPS } from './attack-tips.js';
import {
  ANIMS,
  SHEETS,
  ART_SET,
  FRAME_W,
  FRAME_H,
  pickPlayerAnimation,
  animTimeScale,
} from './player-anims.js';

// Used only when `game.story` is absent (every existing test constructs a
// Player this way via the harness's stubGame()). A level with no story layer
// - level1, and every test - gets the full moveset from frame one, exactly as
// before ability gating existed. Only a real Game wired to a StoryState can
// restrict this, by unlocking abilities one at a time as the story progresses.
//
// Weapons are not part of this table: whether the player can shoot or swing
// something is answered entirely by which weapon they are holding
// (player.weaponId), not by an ability flag. There would be nothing left to
// gate once fists are always available.
const FULL_ABILITIES = { dash: true, doubleJump: true, wallJump: true };

// Shared by every Player instance. Loading is asynchronous and non-blocking;
// until it finishes (or if it fails) the procedural art is drawn instead.
const playerSheet = new SpriteSheet(SHEETS[ART_SET]);

// The player character. Almost every line here exists to make control feel
// immediate: buffered input, forgiving ground checks, asymmetric gravity,
// cancelable dashes and squash/stretch feedback.
export class Player {
  constructor(x, y, game) {
    this.game = game;
    this.body = new Body(x, y, PLAYER.w, PLAYER.h);
    this.facing = 1;

    this.health = PLAYER.maxHealth;
    this.alive = true;

    // Timers. All count down in seconds; >0 means "still active".
    this.coyote = 0;
    this.jumpBufferT = 0;
    this.airJumps = PLAYER.maxAirJumps;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;
    this.hasDash = true;
    this.invuln = 0;
    this.wallJumpLock = 0;
    this.wallStick = 0;
    this.hurtT = 0;

    // Weapon state. Fists are always available so an attack press is never a
    // silent no-op; anything better is found in the world and equipped by
    // walking over it (see WeaponPickup / WorldScene._checkPickups).
    this.weaponId = 'fists';
    this.attackCd = 0;
    // Firearm state. `spread` is the half-angle of the fan every shot is
    // drawn from - the whole "unpracticed shooter" mechanic lives in how it
    // narrows while aiming and blooms with every shot (see _updateSpread).
    this.spread = 0;
    this.aimAngle = 0; // radians, where the gun is pointing
    this.isAiming = false;
    this.fireBufferT = 0; // a trigger pull slightly early still fires
    this.gunKick = 0; // 1 right after a shot, decays - visual recoil
    this.fanFlash = 0; // briefly shows the fan after a hip-fired shot
    // Melee attack in progress: seconds since it started (-1 = none), the
    // direction it was thrown in, the weapon that threw it, and whether its
    // strike has already resolved (each swing hits once).
    this.meleeT = -1;
    this.meleeDir = 1;
    this.meleeWeaponId = 'fists';
    this.meleeHit = false;

    this.wallSliding = false;
    this.aimY = 0;
    // Tracked so the landing impact knows how hard the fall was. Must start at
    // a number: the first landing reads it before any update has written it.
    this._lastFallSpeed = 0;

    // Visual-only state, never read by physics.
    this.squashX = 1;
    this.squashY = 1;
    this.runAnim = 0;
    this.muzzleFlash = 0;
    this.trail = [];
    this.sheet = playerSheet;
    this.animator = new Animator(ANIMS, 'idle');
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get w() { return this.body.w; }
  get h() { return this.body.h; }
  get vx() { return this.body.vx; }
  get grounded() { return this.body.grounded; }
  get rect() { return this.body.rect; }
  get centerX() { return this.body.centerX; }
  get centerY() { return this.body.centerY; }

  get invulnerable() {
    return this.invuln > 0 || this.dashT > 0;
  }

  // Read live from story state every time rather than cached at construction,
  // so an ability granted mid-scene (a cutscene finishing, a pickup) takes
  // effect on the very next frame instead of needing a respawn to pick it up.
  get abilities() {
    return this.game.story ? this.game.story.abilities : FULL_ABILITIES;
  }

  get weapon() {
    return getWeapon(this.weaponId);
  }

  equipWeapon(id) {
    if (id === this.weaponId) return;
    this.weaponId = id;
    this.attackCd = 0;
    this._resetAim();
  }

  // A freshly drawn gun starts at its widest fan: steadiness is earned by
  // aiming, never carried over from a previous weapon or life.
  _resetAim() {
    const w = this.weapon;
    this.spread = w.type === 'ranged' ? w.spreadMax : 0;
    this.isAiming = false;
    this.fireBufferT = 0;
  }

  // 0 = the widest fan, 1 = fully steadied. Read by the fan renderer and the
  // HUD, so what the player sees is exactly what the next shot is drawn from.
  steadiness(w = this.weapon) {
    if (w.type !== 'ranged') return 0;
    return clamp((w.spreadMax - this.spread) / (w.spreadMax - w.spreadMin), 0, 1);
  }

  update(dt, input, map) {
    if (!this.alive) {
      this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall);
      this.body.move(map, dt);
      return;
    }

    this._tickTimers(dt);

    // Planted while swinging on the ground: a punch thrown while sliding
    // forward reads as floaty, and committing to an attack should cost
    // something. In the air the swing doesn't stop the drift.
    const striking = this.meleeT >= 0;
    const wantX = striking && this.grounded ? 0 : input.axisX;
    if (this.dashT <= 0 && wantX !== 0 && this.wallJumpLock <= 0 && !striking) {
      this.facing = wantX;
    }
    this.aimY = input.axisY;

    this._updateGroundState(map);
    this._handleDash(dt, input);

    if (this.dashT > 0) {
      this._dashMovement(dt);
    } else {
      this._horizontal(dt, wantX);
      this._wallSlide(dt, input, wantX);
      this._gravity(dt);
      this._handleJump(input, map);
    }

    this._handleAttack(dt, input);

    this.body.move(map, dt);
    this._postMove(dt, map);
    this._visuals(dt, wantX);
  }

  _tickTimers(dt) {
    this.coyote -= dt;
    this.jumpBufferT -= dt;
    this.dashCd -= dt;
    this.invuln -= dt;
    this.attackCd -= dt;
    this.wallJumpLock -= dt;
    this.hurtT -= dt;
    this.muzzleFlash -= dt;
    this.fireBufferT -= dt;
    this.gunKick = Math.max(0, this.gunKick - dt * 7);
    this.fanFlash -= dt;
    if (this.dashT > 0) this.dashT -= dt;
    if (this.wallStick > 0) this.wallStick -= dt;
  }

  _updateGroundState(map) {
    // A separate 1px probe rather than the collision flag: standing still on
    // flat ground never produces a collision, but the player is still grounded.
    const onGround = this.body.isOnGround(map);
    if (onGround) {
      this.coyote = PLAYER.coyoteTime;
      this.airJumps = PLAYER.maxAirJumps;
      if (this.dashCd <= 0) this.hasDash = true;
    }
    this.body.grounded = onGround;
  }

  _horizontal(dt, wantX) {
    const b = this.body;
    const grounded = b.grounded;

    if (wantX !== 0 && this.wallJumpLock <= 0) {
      let accel = grounded ? PLAYER.accelGround : PLAYER.accelAir;
      // Reversing direction gets extra bite so turns feel crisp.
      if (sign(b.vx) !== 0 && sign(b.vx) !== wantX) accel *= PLAYER.turnBoost;
      b.vx = approach(b.vx, wantX * PLAYER.runSpeed, accel * dt);
    } else {
      const friction = grounded ? PLAYER.frictionGround : PLAYER.frictionAir;
      b.vx = approach(b.vx, 0, friction * dt);
    }
  }

  _gravity(dt) {
    const b = this.body;
    let g = PHYS.gravity;

    if (b.vy > 0) {
      g *= PHYS.fallGravityMult; // fall faster than you rose
    } else if (Math.abs(b.vy) < PHYS.apexThreshold) {
      g *= PHYS.apexGravityMult; // brief hang time at the peak
    }

    b.vy = Math.min(b.vy + g * dt, PHYS.maxFall);

    if (this.wallSliding && b.vy > PLAYER.wallSlideSpeed) {
      b.vy = PLAYER.wallSlideSpeed;
    }
  }

  _wallSlide(dt, input, wantX) {
    const b = this.body;
    const touching =
      (b.wallLeft && wantX < 0) || (b.wallRight && wantX > 0);

    // Without the ability, a wall is just a wall: it blocks movement, but does
    // not slow the fall or refund jumps. Sliding down it at 1/4 speed before
    // the story has explained why would look like a bug, not a held-back
    // reward.
    this.wallSliding = this.abilities.wallJump && !b.grounded && touching && b.vy > 0;

    if (this.wallSliding) {
      this.wallStick = PLAYER.wallStickTime;
      // Wall contact refunds the air jump and the dash, which is what makes
      // vertical shafts climbable.
      this.airJumps = PLAYER.maxAirJumps;
      if (this.dashCd <= 0) this.hasDash = true;

      if (this.game.loopFrame % 5 === 0) {
        this.game.particles.spawn({
          x: b.wallLeft ? b.x : b.right,
          y: b.y + rand(6, b.h - 4),
          vx: rand(-12, 12),
          vy: rand(-50, -10),
          life: rand(0.2, 0.4),
          size: 2,
          color: '#8fa7d8',
        });
      }
    }
  }

  _handleJump(input, map) {
    const b = this.body;

    if (input.pressed('jump')) this.jumpBufferT = PLAYER.jumpBuffer;

    if (this.jumpBufferT > 0) {
      // Wall jump takes priority: pushing off a wall is what the player means
      // when they hit jump while sliding.
      const canWallJump =
        this.abilities.wallJump &&
        !b.grounded && (this.wallSliding || this.wallStick > 0) &&
        (b.wallLeft || b.wallRight);

      if (canWallJump) {
        const away = b.wallLeft ? 1 : -1;
        b.vx = away * PLAYER.wallJumpVX;
        b.vy = -PLAYER.wallJumpVY;
        this.facing = away;
        this.wallJumpLock = PLAYER.wallJumpLockout;
        this.wallStick = 0;
        this.jumpBufferT = 0;
        this.coyote = 0;
        this._jumpFx(1.25);
        this.game.audio.jump();
      } else if (this.coyote > 0) {
        b.vy = -PLAYER.jumpVelocity;
        this.jumpBufferT = 0;
        this.coyote = 0;
        b.grounded = false;
        this._jumpFx(1);
        this.game.audio.jump();
      } else if (this.abilities.doubleJump && this.airJumps > 0) {
        b.vy = -PLAYER.jumpVelocity * 0.92;
        this.airJumps--;
        this.jumpBufferT = 0;
        this._jumpFx(1.4);
        this.game.audio.doubleJump();
        // A ring of particles sells the mid-air jump as a deliberate move.
        this.game.particles.burst(this.centerX, b.bottom, 12, {
          color: ['#7fd4ff', '#c8e9ff'],
          speedMin: 60,
          speedMax: 170,
          lifeMin: 0.2,
          lifeMax: 0.45,
          gravity: 320,
          shape: 'circle',
          sizeMin: 2,
          sizeMax: 4,
        });
      }
    }

    // Variable jump height: cut the rise the moment jump is released.
    if (input.released('jump') && b.vy < 0) {
      b.vy *= PLAYER.jumpCutMult;
    }
  }

  _jumpFx(strength) {
    this.squashX = 0.75;
    this.squashY = 1.3;
    this.game.particles.burst(this.centerX, this.body.bottom, 6 * strength, {
      color: '#9fb6e8',
      speedMin: 30,
      speedMax: 120,
      angle: -Math.PI / 2,
      spread: Math.PI / 2.2,
      lifeMin: 0.15,
      lifeMax: 0.35,
      gravity: 400,
    });
  }

  _handleDash(dt, input) {
    if (this.abilities.dash && input.pressed('dash') && this.hasDash && this.dashCd <= 0) {
      let dx = input.axisX;
      let dy = input.axisY;
      // No direction held means dash the way you are facing.
      if (dx === 0 && dy === 0) dx = this.facing;

      // Normalise so a diagonal dash is not faster than a straight one.
      const len = Math.hypot(dx, dy) || 1;
      this.dashDirX = dx / len;
      this.dashDirY = dy / len;

      this.dashT = PLAYER.dashDuration;
      this.dashCd = PLAYER.dashCooldown;
      this.hasDash = false;
      this.invuln = Math.max(this.invuln, PLAYER.dashInvuln);
      if (dx !== 0) this.facing = sign(dx);

      this.game.audio.dash();
      this.game.camera.addTrauma(0.12);
      this.game.freeze(0.04);
      this.game.particles.burst(this.centerX, this.centerY, 16, {
        color: [COLORS.playerDash, '#ffffff'],
        speedMin: 60,
        speedMax: 260,
        angle: Math.atan2(-this.dashDirY, -this.dashDirX),
        spread: 0.7,
        lifeMin: 0.15,
        lifeMax: 0.4,
        shape: 'streak',
        sizeMin: 2,
        sizeMax: 5,
      });
    }
  }

  _dashMovement(dt) {
    const b = this.body;
    b.vx = this.dashDirX * PLAYER.dashSpeed;
    b.vy = this.dashDirY * PLAYER.dashSpeed;

    // Afterimages are captured during the dash and faded out afterwards.
    this.trail.push({ x: b.x, y: b.y, life: 0.28, max: 0.28 });

    if (this.dashT <= 0) {
      // Bleed off speed on exit so the dash doesn't fling the player.
      b.vx *= 0.55;
      b.vy *= this.dashDirY < 0 ? 0.5 : 0.25;
    }
  }

  // Dispatches to melee or ranged handling based on the currently equipped
  // weapon. This is the only place that branches on weapon.type - everything
  // downstream (WorldScene.meleeAttack, Bullet) just resolves whatever it is
  // handed.
  _handleAttack(dt, input) {
    const w = this.weapon;
    if (this.meleeT >= 0) this._advanceMelee(dt);
    if (w.type === 'melee') {
      this.isAiming = false;
      this._handleMelee(input, w);
    } else {
      this._handleRanged(dt, input, w);
    }
  }

  // Starts an attack; _advanceMelee plays it out. Holding the button chains
  // attacks at the weapon's own pace.
  _handleMelee(input, w) {
    if (!input.down('fire') || this.attackCd > 0 || this.meleeT >= 0) return;
    this.attackCd = w.cooldown;
    this.meleeT = 0;
    this.meleeDir = this.facing;
    this.meleeWeaponId = w.id;
    this.meleeHit = false;
  }

  get meleeWeapon() {
    return getWeapon(this.meleeWeaponId);
  }

  // 0 wind-up, 1 strike, 2 recovery, -1 not attacking - also the index of
  // the animation frame on screen.
  get meleePhase() {
    if (this.meleeT < 0) return -1;
    const w = this.meleeWeapon;
    if (this.meleeT < w.windup) return 0;
    return this.meleeT < w.windup + w.active ? 1 : 2;
  }

  _advanceMelee(dt) {
    const w = this.meleeWeapon;
    this.meleeT += dt;
    if (!this.meleeHit && this.meleeT >= w.windup) {
      this.meleeHit = true;
      this._strike(w);
    }
    if (this.meleeT >= w.windup + w.active + w.recover) this.meleeT = -1;
  }

  // The strike frame: step in, and everything inside the weapon's reach is
  // hit at once.
  _strike(w) {
    const dir = this.meleeDir;
    this.body.vx = dir * w.lunge;
    const range = w.range;
    const arcH = this.body.h * 0.75;
    const rect = {
      x: dir > 0 ? this.body.right : this.body.x - range,
      y: this.centerY - arcH / 2,
      w: range,
      h: arcH,
    };
    this.game.meleeAttack(rect, w, dir);

    // The swoosh comes off the fist / club end / blade tip exactly where the
    // strike frame draws it. Without attack frames (classic art) there is no
    // drawn tip to match, so it sits at the far edge of the reach.
    const tip = SHEETS[ART_SET].hasAttacks ? ATTACK_TIPS[w.anim] : null;
    const fx = tip ? this.body.centerX + dir * tip.x : dir > 0 ? rect.x + rect.w : rect.x;
    const fy = tip ? this.body.bottom + tip.y : this.centerY;

    this.game.audio.swing();
    this.game.camera.addTrauma(0.04);
    this.game.particles.burst(fx, fy, 6, {
      color: ['#ffffff', '#c7d0da'],
      speedMin: 60,
      speedMax: 180,
      angle: dir > 0 ? 0 : Math.PI,
      spread: 0.6,
      lifeMin: 0.08,
      lifeMax: 0.2,
      shape: 'streak',
      sizeMin: 2,
      sizeMax: 4,
    });
  }

  // Aim and trigger are separate: `aim` (right mouse button) steadies the
  // fan, `fire` (left button) pulls the trigger - semi-automatic, one shot
  // per pull. The shot itself is hitscan: it lands the instant it is fired,
  // drawn as a tracer streak rather than a projectile you could watch fly.
  _handleRanged(dt, input, w) {
    this.isAiming = input.down('aim');
    this.aimAngle = this._aimAngle(input);

    // While aiming or shooting, the body turns to face the gun.
    const dirX = Math.cos(this.aimAngle);
    if ((this.isAiming || input.down('fire')) && Math.abs(dirX) > 0.05 && this.dashT <= 0) {
      this.facing = dirX > 0 ? 1 : -1;
    }

    this._updateSpread(dt, w);

    if (input.pressed('fire')) this.fireBufferT = 0.12;
    if (this.fireBufferT <= 0 || this.attackCd > 0) return;
    this.fireBufferT = 0;
    this.attackCd = w.fireRate;
    this._shoot(w);
  }

  // Mouse: straight at the cursor. Otherwise the same eight directions the
  // keyboard/pad always had - facing, with up/down overriding.
  _aimAngle(input) {
    const cam = this.game.camera;
    if (input.pointerActive && cam && cam.x !== undefined) {
      const tx = cam.x + input.pointerX;
      const ty = cam.y + input.pointerY;
      return Math.atan2(ty - this.gunY, tx - this.centerX);
    }
    let dx = this.facing;
    let dy = 0;
    if (this.aimY !== 0) {
      dy = this.aimY;
      dx = input.axisX !== 0 ? this.facing : 0;
    }
    return Math.atan2(dy, dx);
  }

  // Shoulder height: where the gun is held and every shot starts from.
  get gunY() {
    return this.centerY - 2;
  }

  // The fan drifts toward a target half-angle: tight while aiming, wide from
  // the hip, wider still on the move or in the air. Narrowing takes the full
  // `aimRampTime`; widening is three times faster - losing your aim is quick,
  // earning it back is not. Each shot's bloom is added on top in _shoot().
  _updateSpread(dt, w) {
    const moving = clamp(Math.abs(this.body.vx) / PLAYER.runSpeed, 0, 1);
    const target = Math.min(
      w.spreadMax,
      (this.isAiming ? w.spreadMin : w.spreadMax) + w.moveSpread * moving + (this.grounded ? 0 : w.moveSpread)
    );
    const rate = (w.spreadMax - w.spreadMin) / w.aimRampTime;
    if (this.spread > target) this.spread = Math.max(target, this.spread - rate * dt);
    else this.spread = Math.min(target, this.spread + rate * 3 * dt);
  }

  _shoot(w) {
    const angle = this.aimAngle + rand(-this.spread, this.spread);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const muzzleX = this.centerX + Math.cos(this.aimAngle) * 16;
    const muzzleY = this.gunY + Math.sin(this.aimAngle) * 16;

    this.game.fireHitscan(muzzleX, muzzleY, angle, w);

    // Recoil: the fan blooms, the shooter is shoved back (more in the air,
    // where nothing braces them), and firing downward mid-air lifts a little.
    this.spread = Math.min(w.spreadMax, this.spread + w.bloom);
    this.body.vx -= cos * w.recoil * (this.grounded ? 0.35 : 1);
    if (sin > 0.5 && !this.grounded) this.body.vy -= sin * 140;

    // Felt in the whole frame: a directional kick opposite the muzzle plus
    // rattling trauma - far beyond anything a melee swing produces.
    this.game.camera.kick?.(-cos * w.kick, -sin * w.kick);
    this.game.camera.addTrauma(w.trauma);
    this.gunKick = 1;
    this.muzzleFlash = 0.07;
    this.fanFlash = 0.5;
    this.game.audio.shoot();

    this.game.particles.burst(muzzleX, muzzleY, 10, {
      color: ['#ffffff', '#ffe08a', '#ff9a3c'],
      speedMin: 80,
      speedMax: 260,
      angle,
      spread: 0.35,
      lifeMin: 0.05,
      lifeMax: 0.14,
      shape: 'streak',
      sizeMin: 1,
      sizeMax: 3,
    });
    // A puff of gun smoke that lingers after the flash is gone.
    this.game.particles.burst(muzzleX, muzzleY, 4, {
      color: ['rgba(200,190,175,0.5)', 'rgba(150,140,130,0.4)'],
      speedMin: 10,
      speedMax: 40,
      angle: -Math.PI / 2,
      spread: 1.2,
      lifeMin: 0.3,
      lifeMax: 0.6,
      sizeMin: 2,
      sizeMax: 4,
    });
  }

  _postMove(dt, map) {
    const b = this.body;

    // Re-derive grounded from a 1px probe rather than trusting the collision
    // result. At rest, gravity accumulates less than a pixel per frame, so the
    // body only actually collides with the floor every other frame - leaving
    // `grounded` flickering on/off and the animation snapping between idle and
    // fall. The probe is stable.
    b.grounded = b.isOnGround(map);

    // Standing still should not keep building downward speed into the floor;
    // this removes the matching sub-pixel sink/snap jitter. Upward velocity is
    // left alone so the first frame of a jump is not cancelled.
    if (b.grounded && b.vy > 0) b.vy = 0;

    // Landing: squash, dust and a little shake proportional to impact speed.
    if (b.grounded && !b.wasGrounded) {
      const impact = clamp(this._lastFallSpeed / PHYS.maxFall, 0, 1);
      this.squashX = 1 + impact * 0.35;
      this.squashY = 1 - impact * 0.3;
      if (impact > 0.18) {
        this.game.audio.land();
        this.game.camera.addTrauma(impact * 0.22);
        this.game.particles.burst(this.centerX, b.bottom, Math.floor(4 + impact * 12), {
          color: '#7f92c0',
          speedMin: 40,
          speedMax: 60 + impact * 220,
          angle: -Math.PI / 2,
          spread: Math.PI / 2,
          lifeMin: 0.15,
          lifeMax: 0.4,
          gravity: 500,
        });
      }
    }
    this._lastFallSpeed = Math.max(0, b.vy);

    // Spikes knock the player back the way they came in.
    if (map.overlapsHazard(b.x, b.y, b.w, b.h)) {
      this.hurt(1, -sign(b.vx) || -this.facing, true);
    }

    // Falling out of the level is fatal regardless of health.
    if (b.y > map.height + 200) this.kill();
  }

  _visuals(dt, wantX) {
    this.squashX = damp(this.squashX, 1, 12, dt);
    this.squashY = damp(this.squashY, 1, 12, dt);

    // Drive the sprite animation from the same state the physics just produced.
    const state = {
      dashT: this.dashT,
      hurtT: this.hurtT,
      wallSliding: this.wallSliding,
      grounded: this.grounded,
      vy: this.body.vy,
      vx: this.body.vx,
    };
    const next = pickPlayerAnimation(state);
    this.animator.play(next);
    this.animator.update(dt, animTimeScale(next, state, PLAYER.runSpeed));

    if (this.grounded && Math.abs(this.body.vx) > 20) {
      this.runAnim += dt * Math.abs(this.body.vx) * 0.045;
      // Footstep dust on the contact frames of the run cycle.
      if (Math.floor(this.runAnim) !== Math.floor(this.runAnim - dt * Math.abs(this.body.vx) * 0.045)) {
        this.game.particles.spawn({
          x: this.centerX - this.facing * 6,
          y: this.body.bottom - 1,
          vx: -this.facing * rand(20, 70),
          vy: rand(-40, -5),
          life: rand(0.15, 0.3),
          size: 2,
          color: '#6d7fa8',
          gravity: 300,
        });
      }
    } else {
      this.runAnim = 0;
    }

    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
  }

  hurt(amount, knockDir = 0, fromHazard = false) {
    if (this.invulnerable || !this.alive) return false;

    this.health -= amount;
    this.invuln = PLAYER.invulnOnHit;
    this.hurtT = 0.3;

    const dir = knockDir || -this.facing;
    this.body.vx = dir * PLAYER.hurtKnockbackX;
    this.body.vy = -PLAYER.hurtKnockbackY;
    // Being hurt cancels a dash, otherwise the dash carries you back in.
    this.dashT = 0;

    this.game.camera.addTrauma(0.5);
    this.game.freeze(0.1);
    this.game.particles.burst(this.centerX, this.centerY, 18, {
      color: ['#ff6b8a', '#ffd0dc', '#ffffff'],
      speedMin: 60,
      speedMax: 280,
      lifeMin: 0.2,
      lifeMax: 0.6,
      gravity: 260,
      shape: 'circle',
      sizeMin: 2,
      sizeMax: 5,
    });

    if (this.health <= 0) this.kill();
    else this.game.audio.playerHurt();
    return true;
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.body.vy = -320;
    this.game.audio.playerDie();
    this.game.camera.addTrauma(0.8);
    this.game.freeze(0.18);
    this.game.onPlayerDeath();
    this.game.particles.burst(this.centerX, this.centerY, 40, {
      color: ['#7fd4ff', '#ffffff', '#ff6b8a'],
      speedMin: 80,
      speedMax: 380,
      lifeMin: 0.3,
      lifeMax: 0.9,
      gravity: 420,
      shape: 'circle',
      sizeMin: 2,
      sizeMax: 6,
    });
  }

  respawn(x, y) {
    const b = this.body;
    b.x = x;
    b.y = y;
    b.vx = 0;
    b.vy = 0;
    this.alive = true;
    this.health = PLAYER.maxHealth;
    this.invuln = 1.2;
    this.dashT = 0;
    this.dashCd = 0;
    this.hasDash = true;
    this.airJumps = PLAYER.maxAirJumps;
    this.trail.length = 0;
    // The weapon itself is not reset here - dying does not make you drop
    // whatever you picked up. Only the in-progress aim state is cleared, so a
    // death mid-aim does not carry a phantom steadied fan into the respawn.
    this._resetAim();
    this.attackCd = 0;
    this.meleeT = -1;
  }

  // True when the current art set has drawn attack frames, so the swing is
  // the sprite itself rather than a shape layered over a standing pose.
  get _spriteAttacking() {
    return this.meleeT >= 0 && this.sheet.ready && SHEETS[ART_SET].hasAttacks;
  }

  _spriteCell() {
    if (this._spriteAttacking) {
      return { col: this.meleePhase, row: ANIMS[this.meleeWeapon.anim].row };
    }
    return { col: this.animator.frame, row: this.animator.row };
  }

  render(ctx) {
    const b = this.body;
    const useSprite = this.sheet.ready;

    // Dash afterimages first, so they sit behind the character.
    for (const t of this.trail) {
      const a = t.life / t.max;
      ctx.globalAlpha = a * 0.45;
      if (useSprite) {
        ctx.save();
        ctx.translate(t.x + b.w / 2, t.y + b.h);
        ctx.scale(this.facing, 1);
        this.sheet.drawFrame(
          ctx,
          this.animator.frame,
          this.animator.row,
          -FRAME_W / 2,
          -FRAME_H + 1
        );
        ctx.restore();
      } else {
        ctx.fillStyle = COLORS.playerDash;
        ctx.fillRect(t.x, t.y, b.w, b.h);
      }
    }
    ctx.globalAlpha = 1;

    // Blink while invulnerable, but never while dashing (the dash reads better
    // as a solid streak).
    if (this.invuln > 0 && this.dashT <= 0 && Math.floor(this.invuln * 20) % 2 === 0) {
      return;
    }

    ctx.save();

    if (this.dashT > 0) {
      ctx.shadowColor = COLORS.playerDash;
      ctx.shadowBlur = 18;
    }

    if (useSprite) this._renderSprite(ctx);
    else this._renderShapes(ctx);

    this._renderWeapon(ctx);
    this._renderMuzzleFlash(ctx);

    ctx.restore();

    // Outside the dash-glow save/restore - the aim fan is a world-space
    // indicator, not part of the character's own shadow/glow treatment.
    this._renderAimFan(ctx);
  }

  // Sprite path. The transform pivots on the feet so squash/stretch — which is
  // pure physics feedback, not part of the artwork — still applies on top of
  // whatever frame is showing.
  _renderSprite(ctx) {
    const b = this.body;
    ctx.save();
    ctx.translate(b.centerX, b.bottom);
    ctx.scale((this.meleeT >= 0 ? this.meleeDir : this.facing) * this.squashX, this.squashY);

    // The sprite's feet sit on its bottom row, so shifting up by one frame
    // height lands them on the collision box's bottom edge.
    const { col, row } = this._spriteCell();
    this.sheet.drawFrame(ctx, col, row, -FRAME_W / 2, -FRAME_H + 1);

    // Flash white on the hit frames by overlaying the same silhouette.
    if (this.hurtT > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(-FRAME_W / 2, -FRAME_H + 1, FRAME_W, FRAME_H);
    }
    ctx.restore();
  }

  // Fallback path: the original procedural character, used until the sheet
  // loads and permanently if it fails to.
  _renderShapes(ctx) {
    const b = this.body;
    const cx = b.centerX;
    const w = b.w * this.squashX;
    const h = b.h * this.squashY;
    const x = cx - w / 2;
    const y = b.bottom - h; // squash pivots on the feet

    ctx.fillStyle = this.hurtT > 0 ? '#ffffff' : COLORS.player;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = this.hurtT > 0 ? '#ffffff' : COLORS.playerCore;
    const coreW = w * 0.46;
    ctx.fillRect(cx - coreW / 2 + this.facing * w * 0.1, y + h * 0.26, coreW, h * 0.4);

    ctx.fillStyle = '#0b1020';
    const eyeX = cx + this.facing * w * 0.14;
    ctx.fillRect(eyeX - 4, y + h * 0.16, 3, 4);
    ctx.fillRect(eyeX + 1, y + h * 0.16, 3, 4);
  }

  // A short star of light at the muzzle - two crossed spikes plus a core,
  // brighter and larger than anything else the player emits.
  _renderMuzzleFlash(ctx) {
    if (this.muzzleFlash <= 0) return;
    const a = this.aimAngle;
    const x = this.centerX + Math.cos(a) * 18;
    const y = this.gunY + Math.sin(a) * 18;
    const k = this.muzzleFlash / 0.07;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#ffb44d';
    ctx.shadowBlur = 16;
    ctx.fillStyle = `rgba(255,190,90,${0.9 * k})`;
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.lineTo(16 * k + 6, 0);
    ctx.lineTo(-2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(1, -7 * k, 2, 14 * k);
    ctx.fillStyle = `rgba(255,255,255,${k})`;
    ctx.beginPath();
    ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draws whatever is currently in hand. Fists draw nothing extra (the
  // sprite's own hands are the weapon); everything else is a small
  // procedural shape layered on top, independent of which sprite frame is
  // showing, so swapping weapons never needs new animation frames.
  _renderWeapon(ctx) {
    const w = this.weapon;
    const cx = this.body.centerX;
    const cy = this.body.centerY;

    if (w.type === 'ranged') {
      // Pointed along the aim; flipped vertically when aiming left so the
      // grip stays underneath. Right after a shot it snaps back toward the
      // shoulder and tips muzzle-up, then settles.
      const left = Math.cos(this.aimAngle) < 0;
      ctx.save();
      ctx.translate(cx, this.gunY);
      ctx.rotate(this.aimAngle);
      if (left) ctx.scale(1, -1);
      ctx.rotate(-this.gunKick * 0.35);
      ctx.translate(-this.gunKick * 4, 0);
      ctx.fillStyle = '#1d1d22';
      ctx.fillRect(4, -2, 13, 4); // slide/barrel
      ctx.fillRect(5, 1, 4, 5); // grip
      ctx.fillStyle = '#6b7380';
      ctx.fillRect(5, -2, 11, 1); // top highlight
      ctx.restore();
      return;
    }

    // With attack frames the weapon only ever appears as part of the drawn
    // swing - no separate shape is layered over the idle/run poses.
    if (w.id === 'fists' || (this.sheet.ready && SHEETS[ART_SET].hasAttacks)) return;

    // Melee weapon: rests low near the hip normally; without attack frames
    // (classic art) it is drawn pulled back, thrust out, then returning,
    // following the attack's phases.
    const attacking = this.meleeT >= 0;
    const dir = attacking ? this.meleeDir : this.facing;
    const extend = attacking ? [-0.2, 1, 0.5][this.meleePhase] : 0.25;
    const tipX = cx + dir * (10 + w.range * extend);
    const tipY = cy - 2;

    ctx.save();
    ctx.strokeStyle = w.id === 'stick' ? '#8a6a42' : '#0c0608';
    ctx.lineWidth = w.id === 'stick' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 6, cy + 4);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    if (w.id === 'knife') {
      ctx.fillStyle = '#c7d0da';
      ctx.beginPath();
      ctx.moveTo(tipX - dir * 4, tipY - 2);
      ctx.lineTo(tipX + dir * 3, tipY);
      ctx.lineTo(tipX - dir * 4, tipY + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // The aim fan: every shot is drawn uniformly from inside this sector, so
  // it is the honest picture of where the next round can go. Shown solid
  // while aiming, and briefly after a hip-fired shot so the bloom is visible
  // even when not aiming. Colour runs from orange (wide) to green (steady).
  _renderAimFan(ctx) {
    const w = this.weapon;
    if (w.type !== 'ranged' || !this.alive) return;
    const alpha = this.isAiming ? 1 : clamp(this.fanFlash / 0.5, 0, 1) * 0.5;
    if (alpha <= 0) return;

    const t = this.steadiness(w);
    const hue = 28 + 100 * t;
    const ox = this.centerX;
    const oy = this.gunY;
    const r = 120;
    const a0 = this.aimAngle - this.spread;
    const a1 = this.aimAngle + this.spread;

    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(ox, oy, 12, ox, oy, r);
    g.addColorStop(0, `hsla(${hue},100%,65%,0.28)`);
    g.addColorStop(1, `hsla(${hue},100%,65%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, r, a0, a1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue},100%,70%,0.75)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const a of [a0, a1]) {
      ctx.moveTo(ox + Math.cos(a) * 14, oy + Math.sin(a) * 14);
      ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
    }
    ctx.stroke();
    // Centre tick at the end of the aim line.
    const ex = ox + Math.cos(this.aimAngle) * r;
    const ey = oy + Math.sin(this.aimAngle) * r;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(ex - 1, ey - 1, 2, 2);
    ctx.restore();
  }
}
