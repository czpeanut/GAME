// Mechanics tests for the player controller.
//
// These pin down the "game feel" features that are easy to break while tuning
// and impossible to notice in a diff: coyote time, jump buffering, variable
// jump height, sprint and stamina, and invulnerability windows.

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

// --- Sprint and stamina ---------------------------------------------------
console.log('\nsprint and stamina');
{
  const ctx = makePlayer(map);
  run(ctx, map, () => [], 5);
  run(ctx, map, () => ['right'], 40);
  check('moving without sprint is a jog', Math.abs(ctx.p.body.vx - PLAYER.runSpeed) < 1,
    ctx.p.body.vx.toFixed(0));

  run(ctx, map, () => ['right', 'sprint'], 20);
  check('holding sprint runs faster', Math.abs(ctx.p.body.vx - PLAYER.sprintSpeed) < 1,
    ctx.p.body.vx.toFixed(0));
  check('sprinting drains stamina', ctx.p.stamina < 1 && ctx.p.sprinting);
  check('sprinting grants no invulnerability (it is not a dash)', !ctx.p.invulnerable);

  const ctx2 = makePlayer(map);
  run(ctx2, map, () => [], 5);
  run(ctx2, map, () => ['sprint'], 30);
  check('holding sprint while standing still costs nothing', ctx2.p.stamina === 1);

  // Run it dry: sprint until winded, on a long flat stretch.
  const long = (() => {
    const lb = new LevelBuilder(400, 20);
    lb.fill(0, 15, 399, 19, T.DIRT);
    return lb.build('long').map;
  })();
  const ctx3 = makePlayer(long);
  run(ctx3, long, () => [], 5);
  const drainFrames = Math.ceil(60 / PLAYER.staminaDrain) + 5;
  run(ctx3, long, () => ['right', 'sprint'], drainFrames);
  check('sprinting for ~1/staminaDrain seconds runs stamina dry', ctx3.p.stamina === 0,
    ctx3.p.stamina.toFixed(2));
  check('running dry leaves you winded', ctx3.p.winded && !ctx3.p.sprinting);
  run(ctx3, long, () => ['right', 'sprint'], 30);
  check('winded: still holding sprint only jogs', Math.abs(ctx3.p.body.vx - PLAYER.runSpeed) < 1);

  run(ctx3, long, () => [], Math.ceil((PLAYER.staminaRegenDelay + PLAYER.windedRecover / PLAYER.staminaRegen) * 60) + 5);
  check('after a breather stamina refills past the winded threshold',
    ctx3.p.stamina >= PLAYER.windedRecover, ctx3.p.stamina.toFixed(2));
  run(ctx3, long, () => ['right', 'sprint'], 20);
  check('...and sprinting works again', ctx3.p.sprinting);

  // Sprint is decided on the ground: a sprint jump keeps its pace in the air.
  const ctx4 = makePlayer(map);
  run(ctx4, map, () => [], 5);
  run(ctx4, map, () => ['right', 'sprint'], 20);
  run(ctx4, map, (p, f) => (f < 10 ? ['right', 'sprint', 'jump'] : ['right', 'sprint']), 15);
  check('a sprint jump keeps sprint speed in the air', !ctx4.p.grounded && Math.abs(ctx4.p.body.vx - PLAYER.sprintSpeed) < 1);
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
    if (f % 7 === 0) held.push('sprint');
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
