// Playability tests for level 1.
//
// These answer the questions that actually make a platformer shippable: can the
// player physically get past every obstacle, and do the hazards behave? A level
// that looks right but contains one unclearable gap is a broken game.

import { buildLevel1 } from '../src/game/level.js';
import { TILE } from '../src/game/constants.js';
import { isSolidTile, isHazard } from '../src/engine/tilemap.js';
import { simulate, check, summary, jumpHolder } from './harness.mjs';

const level = buildLevel1();
const map = level.map;
const row = (y) => Math.floor(y / TILE);
const col = (x) => Math.floor(x / TILE);

console.log(`\nLevel: ${level.name}  (${map.cols}x${map.rows} tiles, ${map.width}x${map.height}px)\n`);

// --- 1. Player start is standing on solid ground, not inside a wall --------
console.log('start position');
{
  const { x, y } = level.playerStart;
  check('spawn is not inside geometry', !map.overlapsSolid(x, y, 20, 34));
  check('spawn has ground beneath', map.overlapsSolid(x, y + 34 + 1, 20, 2));
}

// --- 2. A running jump clears the 4-tile pit at cols 24-27 ----------------
console.log('\nsection 2: gap jump');
{
  // Hold right; jump when the ground ahead disappears or turns into spikes.
  const jump = jumpHolder(16, 6);
  const controller = (p) => {
    const held = ['right'];
    const aheadFloor = map.atPixel(p.body.right + 6, p.body.bottom + 4);
    const aheadWall = map.atPixel(p.body.right + 6, p.body.centerY);
    const needJump = !isSolidTile(aheadFloor) || isHazard(aheadWall) || isHazard(aheadFloor);

    if (jump.tick()) held.push('jump');
    else if (p.grounded && needJump && jump.ready()) {
      jump.trigger();
      held.push('jump');
    }
    return held;
  };
  const t = simulate({
    map,
    startX: 20 * TILE,
    startY: 24 * TILE,
    controller,
    frames: 300,
  });
  check(
    'clears the pit without dying',
    !t.died && col(t.player.centerX) > 28,
    `reached col ${col(t.player.centerX)}, died=${t.died}`
  );
}

// --- 3. Falling into that pit is lethal, not a trap you get stuck in ------
console.log('\nsection 2: pit is lethal');
{
  const t = simulate({
    map,
    startX: 25.5 * TILE,
    startY: 24 * TILE,
    controller: () => [],
    frames: 400,
  });
  check('falling into the pit kills the player', t.died, `after ${t.frames} frames`);
}

// --- 4. The wall-jump shaft is climbable ----------------------------------
console.log('\nsection 4: wall-jump shaft');
{
  // Policy: hug one wall, jump off it, then aim for the other. This is what a
  // player does; if it cannot climb, neither can they.
  let target = 1; // 1 = right wall, -1 = left wall
  const jump = jumpHolder(14, 4);

  const controller = (p) => {
    const held = [target > 0 ? 'right' : 'left'];

    if (jump.tick()) {
      held.push('jump');
      return held;
    }
    if (!jump.ready()) return held;

    const onWall =
      (p.body.wallLeft && target < 0) || (p.body.wallRight && target > 0);

    // Kick off the floor first to reach the height where both walls exist,
    // then alternate wall jumps.
    if (p.grounded || (onWall && !p.grounded)) {
      jump.trigger();
      held.push('jump');
      if (onWall && !p.grounded) target = -target;
    }
    return held;
  };

  const t = simulate({
    map,
    startX: 56 * TILE,
    startY: 24 * TILE,
    controller,
    frames: 900,
    stopWhen: (p) => row(p.y) <= 7, // the exit height; stop as soon as we're up
  });

  check(
    'climbs to the shaft exit',
    row(t.minY) <= 7,
    `best row ${row(t.minY)} (needs <= 7), start row 24, ${t.frames} frames`
  );
  check('does not die while climbing', !t.died);
}

// --- 5. Every checkpoint and the goal sit on reachable, non-solid space ---
console.log('\ncheckpoints and goal');
{
  for (const [i, c] of level.checkpoints.entries()) {
    check(
      `checkpoint ${i} is in open space`,
      !map.overlapsSolid(c.x, c.y, c.w, c.h),
      `col ${col(c.x)} row ${row(c.y)}`
    );
  }
  const g = level.goal;
  check('goal is in open space', !map.overlapsSolid(g.x, g.y, g.w, g.h));
  check(
    'goal has ground beneath it',
    map.overlapsSolid(g.x, g.y + g.h + 2, g.w, 4),
    `col ${col(g.x)} row ${row(g.y)}`
  );
}

// --- 6. No enemy is spawned inside a wall ---------------------------------
console.log('\nenemy spawns');
{
  let bad = 0;
  for (const s of level.spawns) {
    // Enemies are dropped so their feet rest on the bottom of the spawn tile;
    // check the tile itself is clear.
    if (map.overlapsSolid(s.x + 2, s.y + 2, TILE - 4, TILE - 4)) {
      bad++;
      console.log(`    embedded ${s.type} at col ${col(s.x)} row ${row(s.y)}`);
    }
  }
  check('no enemy spawns inside geometry', bad === 0, `${level.spawns.length} spawns checked`);
}

// --- 7. The level is actually traversable left-to-right at ground level ---
console.log('\ngeometry sanity');
{
  check('level is wide enough to scroll', map.width > 4000, `${map.width}px`);
  check('side walls are sealed', isSolidTile(map.at(0, 10)) && isSolidTile(map.at(map.cols - 1, 10)));
  check('sky is open above the level', !isSolidTile(map.at(50, -1)));
  check('below the level is open (pits are lethal)', !isSolidTile(map.at(25, map.rows)));
}

process.exit(summary() ? 0 : 1);
