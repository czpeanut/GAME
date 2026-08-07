import { Body } from './body.js';
import { PLAYER, PHYS, COLORS } from './constants.js';
import { clamp, approach, sign, rand, damp } from '../engine/math.js';

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
    this.fireCd = 0;
    this.wallJumpLock = 0;
    this.wallStick = 0;
    this.hurtT = 0;

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

  update(dt, input, map) {
    if (!this.alive) {
      this.body.vy = Math.min(this.body.vy + PHYS.gravity * dt, PHYS.maxFall);
      this.body.move(map, dt);
      return;
    }

    this._tickTimers(dt);

    const wantX = input.axisX;
    if (this.dashT <= 0 && wantX !== 0 && this.wallJumpLock <= 0) {
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

    this._handleFire(dt, input);

    this.body.move(map, dt);
    this._postMove(dt, map);
    this._visuals(dt, wantX);
  }

  _tickTimers(dt) {
    this.coyote -= dt;
    this.jumpBufferT -= dt;
    this.dashCd -= dt;
    this.invuln -= dt;
    this.fireCd -= dt;
    this.wallJumpLock -= dt;
    this.hurtT -= dt;
    this.muzzleFlash -= dt;
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

    this.wallSliding = !b.grounded && touching && b.vy > 0;

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
      } else if (this.airJumps > 0) {
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
    if (input.pressed('dash') && this.hasDash && this.dashCd <= 0) {
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

  _handleFire(dt, input) {
    if (!input.down('fire') || this.fireCd > 0) return;
    this.fireCd = PLAYER.fireRate;

    // Aim: up/down override horizontal, matching twin-stick-lite conventions.
    let dx = this.facing;
    let dy = 0;
    if (this.aimY !== 0) {
      dy = this.aimY;
      dx = input.axisX !== 0 ? this.facing : 0;
      if (dx !== 0) {
        const len = Math.SQRT1_2;
        dx *= len;
        dy *= len;
      }
    }

    const muzzleX = this.centerX + dx * 16;
    const muzzleY = this.centerY + dy * 16 - 2;

    this.game.spawnBullet(muzzleX, muzzleY, dx, dy);
    this.muzzleFlash = 0.06;

    // Recoil, and a little extra kick when firing straight down so shooting
    // downward doubles as a small height boost.
    this.body.vx -= dx * PLAYER.recoil * (this.grounded ? 0.25 : 1);
    if (dy > 0 && !this.grounded) this.body.vy -= 60;

    this.game.camera.addTrauma(0.05);
    this.game.audio.shoot();
    this.game.particles.burst(muzzleX, muzzleY, 5, {
      color: [COLORS.bullet, COLORS.bulletGlow],
      speedMin: 40,
      speedMax: 160,
      angle: Math.atan2(dy, dx),
      spread: 0.45,
      lifeMin: 0.06,
      lifeMax: 0.18,
      sizeMin: 1,
      sizeMax: 3,
    });
  }

  _postMove(dt, map) {
    const b = this.body;

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
  }

  render(ctx) {
    const b = this.body;

    // Dash afterimages first, so they sit behind the character.
    for (const t of this.trail) {
      const a = t.life / t.max;
      ctx.globalAlpha = a * 0.45;
      ctx.fillStyle = COLORS.playerDash;
      ctx.fillRect(t.x, t.y, b.w, b.h);
    }
    ctx.globalAlpha = 1;

    // Blink while invulnerable, but never while dashing (the dash reads better
    // as a solid streak).
    if (this.invuln > 0 && this.dashT <= 0 && Math.floor(this.invuln * 20) % 2 === 0) {
      return;
    }

    const cx = b.centerX;
    const bottom = b.bottom;
    const w = b.w * this.squashX;
    const h = b.h * this.squashY;
    const x = cx - w / 2;
    const y = bottom - h; // squash pivots on the feet

    ctx.save();

    if (this.dashT > 0) {
      ctx.shadowColor = COLORS.playerDash;
      ctx.shadowBlur = 18;
    }

    // Body
    ctx.fillStyle = this.hurtT > 0 ? '#ffffff' : COLORS.player;
    ctx.fillRect(x, y, w, h);

    // Inner core - a lighter panel that reads as a cloak opening
    ctx.fillStyle = this.hurtT > 0 ? '#ffffff' : COLORS.playerCore;
    const coreW = w * 0.46;
    ctx.fillRect(cx - coreW / 2 + this.facing * w * 0.1, y + h * 0.26, coreW, h * 0.4);

    // Eyes, offset toward the facing direction
    ctx.fillStyle = '#0b1020';
    const eyeX = cx + this.facing * w * 0.14;
    ctx.fillRect(eyeX - 4, y + h * 0.16, 3, 4);
    ctx.fillRect(eyeX + 1, y + h * 0.16, 3, 4);

    // Muzzle flash
    if (this.muzzleFlash > 0) {
      let dx = this.facing;
      let dy = 0;
      if (this.aimY !== 0) {
        dy = this.aimY;
        dx = 0;
      }
      ctx.fillStyle = COLORS.bullet;
      ctx.shadowColor = COLORS.bulletGlow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx + dx * 16, b.centerY + dy * 16, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
