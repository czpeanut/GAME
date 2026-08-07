// Mechanics tests for the player controller.
//
// These pin down the "game feel" features that are easy to break while tuning
// and impossible to notice in a diff: coyote time, jump buffering, variable
// jump height, dash distance and invulnerability windows.

import { LevelBuilder } from '../src/game/level.js';
import { T } from '../src/engine/tilemap.js';
import { PLAYER, TILE } from '../src/game/constants.js';
import { stubGame, StubInput, check, summary } from './harness.mjs';
import { Player } from '../src/game/player.js';

const STEP = 1 / 60;
const GROUND_ROW = 15;

// A flat test arena; `groundCols` limits how far the floor extends so ledge
// behaviour can be tested.
function arena(groundCols = 39) {
  const b = new LevelBuilder(40, 20);
  b.fill(0, GROUND_ROW, groundCols, 19, T.DIRT);
  return b.build('test').map;
}

function makePlayer(map, col = 5) {
  const game = stubGame();
  const p = new Player(col * TILE, (GROUND_ROW - 2) * TILE + (TILE * 2 - PLAYER.h), game);
  return { p, game, input: new StubInput() };
}

// Steps the sim, returning the lowest y (highest point) reached.
function run({ p, input }, map, controller, frames) {
  let minY = p.y;
  for (let f = 0; f < frames; f++) {
    input.set(controller(p, f) ?? []);
    p.update(STEP, input, map);
    minY = Math.min(minY, p.y);
  }
  return minY;
}

const map = arena();

// --- Variable jump height -------------------------------------------------
console.log('\nvariable jump height');
{
  const ctx1 = makePlayer(map);
  // Settle on the ground for a few frames first.
  run(ctx1, map, () => [], 5);
  const baseY = ctx1.p.y;
  const heldPeak = baseY - run(ctx1, map, (p, f) => (f < 30 ? ['jump'] : []), 60);

  const ctx2 = makePlayer(map);
  run(ctx2, map, () => [], 5);
  const tapPeak = ctx2.p.y - run(ctx2, map, (p, f) => (f < 2 ? ['jump'] : []), 60);

  check('holding jump goes higher than tapping', heldPeak > tapPeak * 1.4,
    `held ${heldPeak.toFixed(0)}px vs tap ${tapPeak.toFixed(0)}px`);
  check('a full jump clears at least 2.5 tiles', heldPeak > TILE * 2.5,
    `${heldPeak.toFixed(0)}px`);
  check('a tapped jump is a real short hop', tapPeak > 10 && tapPeak < heldPeak,
    `${tapPeak.toFixed(0)}px`);
}

// --- Coyote time ----------------------------------------------------------
console.log('\ncoyote time');
{
  // Floor stops at col 10; run off the edge, then jump a few frames later.
  const ledgeMap = arena(10);
  const ctx = makePlayer(ledgeMap, 8);
  run(ctx, ledgeMap, () => [], 5);

  let leftGroundAt = -1;
  let jumped = false;
  let peak = ctx.p.y;
  const startY = ctx.p.y;

  for (let f = 0; f < 90; f++) {
    const held = ['right'];
    if (leftGroundAt < 0 && !ctx.p.grounded && f > 2) leftGroundAt = f;
    // Press jump 3 frames after stepping into the air - inside the 0.1s window.
    if (leftGroundAt > 0 && f >= leftGroundAt + 3 && f < leftGroundAt + 20) {
      held.push('jump');
      jumped = true;
    }
    ctx.input.set(held);
    ctx.p.update(STEP, ctx.input, ledgeMap);
    peak = Math.min(peak, ctx.p.y);
  }

  check('jump still fires shortly after leaving a ledge', jumped && peak < startY - 20,
    `rose ${(startY - peak).toFixed(0)}px after walking off`);
  check('coyote window is configured', PLAYER.coyoteTime > 0.05, `${PLAYER.coyoteTime}s`);
}

// --- Jump buffering -------------------------------------------------------
console.log('\njump buffering');
{
  const ctx = makePlayer(map);
  // Start well above the floor so there is a fall to buffer against.
  ctx.p.body.y = (GROUND_ROW - 8) * TILE;
  ctx.p.body.vy = 0;
  // Spend the air jump up front. Otherwise the early press is answered by the
  // double jump while still airborne, and the buffer is never exercised.
  ctx.p.airJumps = 0;

  let pressedWhileAirborne = false;
  let landedFrame = -1;
  let jumpedAfterLanding = false;

  for (let f = 0; f < 120; f++) {
    const held = [];
    // Press jump in a narrow band above the floor and release before touching
    // down - a genuine buffered input rather than a hold.
    if (!ctx.p.grounded && ctx.p.y > 395 && ctx.p.y < 428 && landedFrame < 0) {
      held.push('jump');
      pressedWhileAirborne = true;
    }
    ctx.input.set(held);
    ctx.p.update(STEP, ctx.input, map);

    if (ctx.p.grounded && landedFrame < 0) landedFrame = f;
    if (landedFrame >= 0 && f > landedFrame && ctx.p.body.vy < -100) jumpedAfterLanding = true;
  }

  check('a jump pressed before landing still fires', pressedWhileAirborne && jumpedAfterLanding,
    `pressed=${pressedWhileAirborne} landed@${landedFrame} jumped=${jumpedAfterLanding}`);
  check('buffer window is configured', PLAYER.jumpBuffer > 0.05, `${PLAYER.jumpBuffer}s`);
}

// --- Double jump ----------------------------------------------------------
console.log('\nair jump');
{
  const ctx = makePlayer(map);
  run(ctx, map, () => [], 5);
  const startY = ctx.p.y;

  let peak = startY;
  let airJumpUsed = false;
  for (let f = 0; f < 90; f++) {
    const held = [];
    // Hold the first jump to full height - releasing early triggers the jump
    // cut and the test would measure two short hops instead of a double jump.
    if (f < 26) held.push('jump');
    // Release for a few frames, then jump again around the apex.
    if (f >= 30 && f < 44) {
      held.push('jump');
      if (ctx.p.airJumps === 0) airJumpUsed = true;
    }
    ctx.input.set(held);
    ctx.p.update(STEP, ctx.input, map);
    peak = Math.min(peak, ctx.p.y);
  }

  check('air jump is consumed', airJumpUsed);
  check('double jump goes higher than a single jump', startY - peak > TILE * 4,
    `${(startY - peak).toFixed(0)}px total`);
}

// --- Dash -----------------------------------------------------------------
console.log('\ndash');
{
  const ctx = makePlayer(map);
  run(ctx, map, () => [], 5);
  const startX = ctx.p.x;

  let invulnDuringDash = false;
  for (let f = 0; f < 20; f++) {
    const held = ['right'];
    if (f === 0) held.push('dash');
    ctx.input.set(held);
    ctx.p.update(STEP, ctx.input, map);
    if (ctx.p.dashT > 0 && ctx.p.invulnerable) invulnDuringDash = true;
  }
  const travelled = ctx.p.x - startX;
  // A dash should cover roughly speed * duration, allowing for the exit blend.
  const expected = PLAYER.dashSpeed * PLAYER.dashDuration;

  check('dash covers roughly the configured distance',
    travelled > expected * 0.7 && travelled < expected * 2.2,
    `${travelled.toFixed(0)}px, expected ~${expected.toFixed(0)}px`);
  check('dash grants invulnerability frames', invulnDuringDash);

  // Dash must not be spammable while airborne. Landing legitimately refuels it,
  // so this needs a drop long enough that the player never touches the floor
  // during the sample - a horizontal dash zeroes vertical speed, so launching
  // them upward does not buy any airtime.
  const tall = (() => {
    const tb = new LevelBuilder(40, 60);
    tb.fill(0, 55, 39, 59, T.DIRT);
    return tb.build('tall').map;
  })();

  const game2 = stubGame();
  const p2 = new Player(5 * TILE, 2 * TILE, game2);
  const in2 = new StubInput();

  let dashes = 0;
  let wasDashing = false;
  let touchedGround = false;
  // 40 frames is well past the 0.42s (25 frame) cooldown, so this proves the
  // dash is not refunded in mid-air merely because the cooldown expired.
  for (let f = 0; f < 40; f++) {
    const held = ['right'];
    if (f % 3 === 0) held.push('dash'); // mash it
    in2.set(held);
    p2.update(STEP, in2, tall);
    if (p2.grounded) touchedGround = true;
    if (p2.dashT > 0 && !wasDashing) dashes++;
    wasDashing = p2.dashT > 0;
  }
  check('dash cannot be spammed in mid-air', dashes === 1 && !touchedGround,
    `${dashes} dash(es) in 40 frames, touchedGround=${touchedGround}`);
}

// --- Damage and invulnerability ------------------------------------------
console.log('\ndamage');
{
  const ctx = makePlayer(map);
  run(ctx, map, () => [], 5);

  const first = ctx.p.hurt(1, 1);
  const immediateSecond = ctx.p.hurt(1, 1);
  check('first hit lands', first === true && ctx.p.health === PLAYER.maxHealth - 1);
  check('second hit is blocked by i-frames', immediateSecond === false,
    `health ${ctx.p.health}`);

  // Wait out the invulnerability, then a hit should land again.
  run(ctx, map, () => [], Math.ceil(PLAYER.invulnOnHit * 60) + 5);
  const third = ctx.p.hurt(1, 1);
  check('hits land again after i-frames expire', third === true,
    `health ${ctx.p.health}`);
}

// --- Physics never produces NaN ------------------------------------------
console.log('\nnumerical stability');
{
  const ctx = makePlayer(map);
  // Mash every input at once for a few seconds.
  run(ctx, map, (p, f) => {
    const held = [];
    if (f % 2 === 0) held.push('right');
    if (f % 3 === 0) held.push('left');
    if (f % 5 === 0) held.push('jump');
    if (f % 7 === 0) held.push('dash');
    if (f % 11 === 0) held.push('up');
    if (f % 13 === 0) held.push('fire');
    return held;
  }, 600);

  const nums = [ctx.p.x, ctx.p.y, ctx.p.body.vx, ctx.p.body.vy, ctx.p.squashX, ctx.p.squashY];
  check('no NaN or Infinity after 10s of input mashing', nums.every(Number.isFinite),
    nums.map((n) => n.toFixed(1)).join(', '));
  check('player stays inside the map', ctx.p.x > 0 && ctx.p.x < map.width);
}

process.exit(summary() ? 0 : 1);
