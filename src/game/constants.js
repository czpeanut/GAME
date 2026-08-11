// Central tuning table. Everything that defines "game feel" lives here so it can
// be adjusted in one place. Units are pixels and seconds.

export const TILE = 32;

export const VIEW = {
  // Internal render resolution. The canvas is scaled up to fit the window, so
  // the game looks identical on every display.
  width: 640,
  height: 360,
};

export const PHYS = {
  gravity: 2100,
  maxFall: 1150,
  // Falling faster than rising makes jumps feel weighty instead of floaty.
  fallGravityMult: 1.35,
  // Near the top of the arc gravity is softened, which gives the player a beat
  // of hang time to line up a shot.
  apexThreshold: 90,
  apexGravityMult: 0.62,
};

export const PLAYER = {
  w: 20,
  h: 34,

  runSpeed: 250,
  accelGround: 2400,
  accelAir: 1750,
  frictionGround: 2900,
  frictionAir: 620,
  // Turning around is faster than accelerating from rest, so direction changes
  // feel immediate rather than sluggish.
  turnBoost: 1.9,

  jumpVelocity: 610,
  // Releasing jump early cuts the remaining upward velocity - this is the whole
  // trick behind variable-height jumps.
  jumpCutMult: 0.42,
  coyoteTime: 0.1, // may still jump this long after walking off a ledge
  jumpBuffer: 0.12, // a jump pressed this early still fires on landing
  maxAirJumps: 1,

  dashSpeed: 690,
  dashDuration: 0.16,
  dashCooldown: 0.42,
  dashInvuln: 0.16, // i-frames last exactly as long as the dash

  wallSlideSpeed: 150,
  wallJumpVX: 330,
  wallJumpVY: 560,
  // Input toward the wall is ignored briefly after a wall jump, otherwise the
  // player sticks straight back to the wall they just left.
  wallJumpLockout: 0.14,
  wallStickTime: 0.12,

  maxHealth: 5,
  invulnOnHit: 1.1,
  hurtKnockbackX: 260,
  hurtKnockbackY: 320,

  // Per-weapon fire rate, damage and spread now live in weapons.js; this is
  // just the recoil kick applied to the player's own body on every shot,
  // which is the same regardless of which gun ends up in weapons.js.
  recoil: 55,
};

// Fallback bullet stats, used only where a spawner doesn't override them
// (enemy bullets). Player gunfire always supplies its weapon's own damage/
// speed/color via weapons.js.
export const BULLET = {
  speed: 720,
  life: 0.9,
  w: 10,
  h: 4,
  damage: 1,
};

export const ENEMY_BULLET = {
  speed: 260,
  life: 3.2,
  r: 5,
  damage: 1,
};

export const COLORS = {
  bg0: '#080a14',
  bg1: '#0d1224',
  bg2: '#141b33',
  bg3: '#1d2745',

  tileTop: '#4a5a86',
  tileFace: '#28324f',
  tileDeep: '#1a2138',
  moss: '#3f7d63',
  mossTop: '#5fb083',
  oneway: '#5c6d9e',
  spike: '#c2506a',

  player: '#e8f1ff',
  playerCore: '#7fd4ff',
  playerDash: '#9af0ff',

  bullet: '#ffe9a8',
  bulletGlow: '#ffb44d',
  enemyBullet: '#ff8fb0',

  enemy: '#d4586f',
  enemyDark: '#8c2f45',
  flyer: '#c47ad6',
  turret: '#d9924a',

  hp: '#7fd4ff',
  hpLost: '#2a3350',
};
