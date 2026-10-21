// Playability tests for the opening chapter, mirroring level.test.mjs's
// approach: a scripted bot proves each obstacle is actually passable rather
// than trusting the tile coordinates by eye. The sprint gate additionally
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
  check('starts unable to sprint', !OPENING_STARTING_ABILITIES.sprint);

  const { p } = makePlayer(x, y);
  check('starts armed with nothing but fists', p.weaponId === 'fists');
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
    // A jog covers ground slower than the old full-speed run did.
    420
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
    600
  );
  check('reaches Old Zhou at a jog, unarmed',
    !result.died && result.maxX >= npc.x - 40,
    `reached col ${col(result.maxX)}, npc at col ${col(npc.x)}`);
}

console.log('\nthe collapsed road can only be cleared at a sprint');
{
  const GROUND_ROW = 16;
  const gapTrigger = level.triggers.find((t) => t.id === 'found_adrenaline');
  const startCol = col(gapTrigger.x) - 1; // a run-up before the edge
  // Standing on the ground, not free-falling into the run-up.
  const standingY = (GROUND_ROW - 2) * TILE + (TILE * 2 - PLAYER.h);
  let gapEnd = startCol;
  while (map.at(gapEnd, GROUND_ROW) >= 3 || map.at(gapEnd + 1, GROUND_ROW) < 3) gapEnd++;
  const farSide = gapEnd + 1;

  // The best a player can do: take off on the very last pixel of ground and
  // spend the double jump at the apex. If even this falls short at a jog,
  // the gate is real - not just "the bot jumped too early".
  const bestJump = (sprint) => {
    let jumpedAt = -1;
    let hold = 0;
    let second = false;
    return (p, f) => {
      const held = ['right'];
      if (sprint) held.push('sprint');
      const edge = map.atPixel(p.body.right + 2, p.body.bottom + 4) < 3;
      if (p.grounded && edge && jumpedAt < 0) {
        jumpedAt = f;
        hold = 18;
      }
      if (jumpedAt >= 0 && !second && f > jumpedAt + 22 && p.body.vy > -40) {
        second = true;
        hold = 18;
      }
      if (hold > 0) {
        hold--;
        held.push('jump');
      }
      return held;
    };
  };

  const jog = run(makePlayer(startCol * TILE, standingY, { sprint: false }), bestJump(true), 300);
  check('a perfectly timed jog jump (even holding sprint, before the adrenaline) falls short',
    jog.died || col(jog.maxX) < farSide, `reached col ${col(jog.maxX)}, far side col ${farSide}, died=${jog.died}`);

  const sprint = run(makePlayer(startCol * TILE, standingY, { sprint: true }), bestJump(true), 300);
  check('the same jump at a sprint clears it',
    !sprint.died && col(sprint.maxX) >= farSide + 1, `reached col ${col(sprint.maxX)}, died=${sprint.died}`);
}

console.log('\nweapons are physical pickups, not ability flags');
{
  const stick = level.pickups.find((p) => p.weaponId === 'stick');
  check('a stick is placed in the level', !!stick);
  check('the stick sits in open space',
    !map.overlapsSolid(stick.x + 2, stick.y + 2, (stick.w ?? 16) - 4, (stick.h ?? 16) - 4),
    `col ${col(stick.x)} row ${row(stick.y)}`);

  const firstLooter = level.spawns.find((s) => s.type === 'Walker');
  check('the stick is reachable before the first looter', stick.x < firstLooter.x,
    `stick col ${col(stick.x)}, looter col ${col(firstLooter.x)}`);

  // Starting unarmed (fists = melee): pressing fire swings, it does not shoot.
  const ctx = makePlayer(level.playerStart.x, level.playerStart.y);
  run(ctx, () => ['fire'], 10);
  check('an unarmed press resolves as a melee swing, not a shot',
    ctx.game.shots.length === 0 && ctx.game.meleeHits.length > 0,
    `shots=${ctx.game.shots.length} meleeHits=${ctx.game.meleeHits.length}`);

  // Equipping the pistol (what Old Zhou's "give" node does) switches the
  // very next press to a ranged shot.
  ctx.p.equipWeapon('pistol');
  run(ctx, () => [], 1); // release, so the next press is a fresh trigger pull
  const shotsBefore = ctx.game.shots.length;
  run(ctx, () => ['fire'], 10);
  check('equipping the pistol makes the next press a shot, immediately',
    ctx.game.shots.length > shotsBefore);
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
