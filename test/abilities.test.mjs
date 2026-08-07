// Ability gating tests.
//
// The contract: a Player built the old way (stubGame(), no `.story`) keeps
// the full moveset - level1 and every earlier test must not notice ability
// gating was added. A Player wired to a real StoryState is restricted to
// whatever that story has unlocked, live, without needing to be reconstructed
// when an ability is granted mid-scene.

import { LevelBuilder } from '../src/game/level.js';
import { T } from '../src/engine/tilemap.js';
import { TILE, PLAYER } from '../src/game/constants.js';
import { StoryState } from '../src/game/story-state.js';
import { stubGame, StubInput, check, summary } from './harness.mjs';
import { Player } from '../src/game/player.js';

const STEP = 1 / 60;
const GROUND_ROW = 15;

function arena() {
  const b = new LevelBuilder(40, 20);
  b.fill(0, GROUND_ROW, 39, 19, T.DIRT);
  return b.build('t').map;
}
const map = arena();

function makeGatedPlayer(story) {
  const game = stubGame();
  game.story = story;
  const p = new Player(5 * TILE, (GROUND_ROW - 2) * TILE + (TILE * 2 - PLAYER.h), game);
  return { p, game, input: new StubInput() };
}

function run(ctx, controller, frames) {
  let minY = ctx.p.y;
  for (let f = 0; f < frames; f++) {
    ctx.input.set(controller(ctx.p, f) ?? []);
    ctx.p.update(STEP, ctx.input, map);
    minY = Math.min(minY, ctx.p.y);
  }
  return minY;
}

console.log('\nbackward compatibility (no story attached)');
{
  const game = stubGame();
  check('a Player with no game.story reports every ability enabled', (() => {
    const p = new Player(0, 0, game);
    return p.abilities.fire && p.abilities.dash && p.abilities.doubleJump && p.abilities.wallJump;
  })());
}

console.log('\nfire gated');
{
  const locked = new StoryState({ fire: false });
  const ctx = makeGatedPlayer(locked);
  ctx.game.bullets = [];
  run(ctx, () => ['fire'], 10);
  check('firing does nothing while the ability is locked', ctx.game.bullets.length === 0);

  locked.grantAbility('fire');
  run(ctx, () => ['fire'], 10);
  check('firing works the moment the ability is granted (no respawn needed)',
    ctx.game.bullets.length > 0);
}

console.log('\ndash gated');
{
  const locked = new StoryState({ dash: false });
  const ctx = makeGatedPlayer(locked);
  run(ctx, () => [], 5);
  const startX = ctx.p.x;
  run(ctx, (p, f) => (f === 0 ? ['right', 'dash'] : ['right']), 15);
  check('dash input is ignored while locked (no burst of speed)',
    ctx.p.x - startX < 100, `moved ${(ctx.p.x - startX).toFixed(0)}px`);

  locked.grantAbility('dash');
  const beforeUnlock = ctx.p.x;
  run(ctx, (p, f) => (f === 0 ? ['right', 'dash'] : ['right']), 15);
  check('dash works immediately once granted',
    ctx.p.x - beforeUnlock > 100, `moved ${(ctx.p.x - beforeUnlock).toFixed(0)}px`);
}

console.log('\ndouble jump gated');
{
  const locked = new StoryState({ doubleJump: false });
  const ctx = makeGatedPlayer(locked);
  run(ctx, () => [], 5);
  const groundY = ctx.p.y;

  // Full jump, then try a second jump at the apex - without the ability this
  // must be a no-op, i.e. no extra height beyond the single jump.
  const singleJumpPeak = groundY - run(ctx, (p, f) => (f < 26 ? ['jump'] : []), 90);

  run(ctx, () => [], 30); // let them land
  const doubleAttemptPeak = groundY - run(ctx, (p, f) => {
    if (f < 26) return ['jump'];
    if (f >= 30 && f < 44) return ['jump'];
    return [];
  }, 90);

  check('a second jump attempt gains no extra height while locked',
    Math.abs(doubleAttemptPeak - singleJumpPeak) < 5,
    `single ${singleJumpPeak.toFixed(0)}px vs attempted-double ${doubleAttemptPeak.toFixed(0)}px`);

  locked.grantAbility('doubleJump');
  run(ctx, () => [], 30);
  const grantedPeak = groundY - run(ctx, (p, f) => {
    if (f < 26) return ['jump'];
    if (f >= 30 && f < 44) return ['jump'];
    return [];
  }, 90);
  check('double jump gains real height once granted',
    grantedPeak > singleJumpPeak * 1.3,
    `single ${singleJumpPeak.toFixed(0)}px vs granted-double ${grantedPeak.toFixed(0)}px`);
}

console.log('\nwall jump and wall slide gated');
{
  // A wall tall enough, with the floor far enough below, that the player
  // cannot fall out of "mid-air pressed against the wall" within this test's
  // frame budget - otherwise landing on the floor (grounded=true) would mask
  // the ability gate behind an unrelated "you're standing, not sliding" case.
  const tall = (() => {
    const tb = new LevelBuilder(40, 60);
    tb.fill(0, 55, 39, 59, T.DIRT);
    tb.fill(10, 0, 10, 59, T.SOLID);
    return tb.build('t').map;
  })();

  const locked = new StoryState({ wallJump: false });
  const game = stubGame();
  game.story = locked;
  const p = new Player(9 * TILE, 10 * TILE, game);
  const input = new StubInput();
  p.body.vx = 0;
  p.body.vy = 100;

  for (let f = 0; f < 40; f++) {
    input.set(['right']); // press into the wall at col 10 and hold it
    p.update(STEP, input, tall);
  }
  check('touching a wall without the ability does not trigger a slide',
    p.wallSliding === false && !p.grounded,
    `wallSliding=${p.wallSliding} grounded=${p.grounded}`);
  check('falling is not slowed by an ungranted wall slide',
    p.body.vy > PLAYER.wallSlideSpeed, `vy=${p.body.vy.toFixed(0)}`);

  locked.grantAbility('wallJump');
  for (let f = 0; f < 10; f++) {
    input.set(['right']);
    p.update(STEP, input, tall);
  }
  check('the same contact now slides once the ability is granted',
    p.wallSliding === true && !p.grounded,
    `wallSliding=${p.wallSliding} grounded=${p.grounded}`);
}

process.exit(summary() ? 0 : 1);
