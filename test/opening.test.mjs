// Playability tests for the opening chapter, mirroring level.test.mjs's
// approach: a scripted bot proves each obstacle is actually passable rather
// than trusting the tile coordinates by eye. The dash gate additionally
// proves the *reverse* - that the gap cannot be cheated without the ability
// the story is supposed to gate it behind.

import { buildOpening, OPENING_STARTING_ABILITIES } from '../src/game/levels/opening.js';
import { TILE, PLAYER } from '../src/game/constants.js';
import { Player } from '../src/game/player.js';
import { StoryState } from '../src/game/story-state.js';
import { stubGame, StubInput, jumpHolder, check, summary } from './harness.mjs';

const level = buildOpening();
const map = level.map;
const col = (x) => Math.floor(x / TILE);
const row = (y) => Math.floor(y / TILE);

console.log(`\nLevel: ${level.name}  (${map.cols}x${map.rows} tiles)\n`);

function makePlayer(x, y, storyOverrides) {
  const game = stubGame();
  game.story = new StoryState(storyOverrides ?? OPENING_STARTING_ABILITIES);
  const p = new Player(x, y, game);
  return { p, game, input: new StubInput() };
}

function run(ctx, controller, frames) {
  const STEP = 1 / 60;
  let minY = ctx.p.y;
  let maxX = ctx.p.x;
  let died = false;
  for (let f = 0; f < frames; f++) {
    ctx.input.set(controller(ctx.p, f) ?? []);
    ctx.p.update(STEP, ctx.input, map);
    minY = Math.min(minY, ctx.p.y);
    maxX = Math.max(maxX, ctx.p.x);
    if (!ctx.p.alive) {
      died = true;
      break;
    }
  }
  return { minY, maxX, died, p: ctx.p };
}

console.log('spawn and geometry');
{
  const { x, y } = level.playerStart;
  check('spawn is not inside geometry', !map.overlapsSolid(x, y, 20, 34));
  check('spawn has ground beneath', map.overlapsSolid(x, y + 34 + 1, 20, 2));
  check('starts locked out of fire and dash',
    !OPENING_STARTING_ABILITIES.fire && !OPENING_STARTING_ABILITIES.dash);
}

console.log('\nstory beats are placed in open space');
{
  for (const t of level.triggers) {
    check(`trigger "${t.id}" is not embedded in geometry`,
      !map.overlapsSolid(t.x + 2, t.y + 2, t.w - 4, t.h - 4),
      `col ${col(t.x)} row ${row(t.y)}`);
  }
  for (const n of level.npcs) {
    check(`npc "${n.id}" is not embedded in geometry`,
      !map.overlapsSolid(n.x + 2, n.y + 2, n.w - 4, n.h - 4),
      `col ${col(n.x)} row ${row(n.y)}`);
  }
}

console.log('\nthe first gap needs only a jump (no story ability granted yet)');
{
  const ctx = makePlayer(level.playerStart.x, level.playerStart.y);
  const jump = jumpHolder(16, 6);
  const result = run(
    ctx,
    (p) => {
      const held = ['right'];
      const aheadFloor = map.atPixel(p.body.right + 6, p.body.bottom + 4);
      const solid = aheadFloor >= 3; // T.SOLID and above are solid tile ids
      if (jump.tick()) held.push('jump');
      else if (p.grounded && !solid && jump.ready()) {
        jump.trigger();
        held.push('jump');
      }
      return held;
    },
    240
  );
  check('crosses the first gap using only movement and jump',
    !result.died && col(result.maxX) > 27,
    `reached col ${col(result.maxX)}, died=${result.died}`);
}

console.log('\nOld Zhou is reachable on foot from the start');
{
  const npc = level.npcs.find((n) => n.id === 'old-zhou');
  check('Old Zhou exists in the level', !!npc);

  const ctx = makePlayer(level.playerStart.x, level.playerStart.y);
  const jump = jumpHolder(16, 6);
  const result = run(
    ctx,
    (p) => {
      const held = ['right'];
      const aheadFloor = map.atPixel(p.body.right + 6, p.body.bottom + 4);
      const solid = aheadFloor >= 3;
      if (jump.tick()) held.push('jump');
      else if (p.grounded && !solid && jump.ready()) {
        jump.trigger();
        held.push('jump');
      }
      return held;
    },
    360
  );
  check('reaches Old Zhou without needing fire or dash',
    !result.died && result.maxX >= npc.x - 40,
    `reached col ${col(result.maxX)}, npc at col ${col(npc.x)}`);
}

console.log('\nthe dash gate actually gates the gap behind it');
{
  const GROUND_ROW = 16;
  const gapTrigger = level.triggers.find((t) => t.id === 'found_adrenaline');
  const gapStartCol = col(gapTrigger.x) + 3; // just past the pickup, at the gap
  // Standing on the ground, not free-falling into the run-up - a bot that
  // starts mid-air drifts sideways while falling and can land anywhere from
  // solid ground to straight inside the gap, which has nothing to do with
  // whether dash can cross it.
  const standingY = (GROUND_ROW - 2) * TILE + (TILE * 2 - PLAYER.h);

  // Without dash: run and jump at the gap, repeatedly, and confirm the far
  // side is never reached within a generous frame budget.
  const locked = makePlayer(gapStartCol * TILE, standingY, { dash: false });
  const jump = jumpHolder(16, 6);
  const withoutDash = run(
    locked,
    (p) => {
      const held = ['right'];
      if (jump.tick()) held.push('jump');
      else if (p.grounded && jump.ready()) {
        jump.trigger();
        held.push('jump');
      }
      return held;
    },
    240
  );
  check('the gap cannot be crossed by jumping alone (no dash granted)',
    withoutDash.died || col(withoutDash.maxX) < 69,
    `reached col ${col(withoutDash.maxX)}, died=${withoutDash.died}`);

  // With dash: run up to where the ground actually disappears, then dash -
  // pressing dash immediately at spawn (two tiles short of the edge) would
  // burn the dash's fixed 0.16s burst before ever reaching the gap, which
  // tests "dashing into a wall" instead of "dashing across a gap".
  const granted = makePlayer(gapStartCol * TILE, standingY, { dash: true });
  let dashed = false;
  const withDash = run(
    granted,
    (p) => {
      const held = ['right'];
      const aheadFloor = map.atPixel(p.body.right + 4, p.body.bottom + 4);
      const edge = aheadFloor < 3; // not solid
      if (p.grounded && edge && !dashed) {
        held.push('dash');
        dashed = true;
      }
      return held;
    },
    120
  );
  check('the same gap is crossable once dash is granted',
    !withDash.died && col(withDash.maxX) >= 70,
    `reached col ${col(withDash.maxX)}, died=${withDash.died}`);
}

console.log('\nfire is inert until granted, then works immediately');
{
  const ctx = makePlayer(level.playerStart.x, level.playerStart.y, { fire: false });
  ctx.game.bullets = [];
  run(ctx, () => ['fire'], 10);
  check('firing does nothing before the gun is given', ctx.game.bullets.length === 0);

  ctx.game.story.grantAbility('fire');
  run(ctx, () => ['fire'], 10);
  check('firing works the instant the story grants it', ctx.game.bullets.length > 0);
}

console.log('\nOld Zhou\'s dialogue changes once the gun has been given');
{
  const { zhouScript } = await import('../src/game/dialogues/opening-dialogues.js');
  const freshStory = new StoryState(OPENING_STARTING_ABILITIES);
  const before = zhouScript({ story: freshStory });
  check('starts on the full introduction', before.start === 'greet');

  freshStory.setFlag('received_gun');
  const after = zhouScript({ story: freshStory });
  check('switches to the short follow-up once the gun has changed hands',
    after.start === 'again');
}

console.log('\nevery enemy spawn sits in open space');
{
  for (const s of level.spawns) {
    check(`${s.type} at col ${col(s.x)} is not embedded in geometry`,
      !map.overlapsSolid(s.x + 2, s.y + 2, TILE - 4, TILE - 4));
  }
}

process.exit(summary() ? 0 : 1);
