import { Tilemap, T } from '../engine/tilemap.js';
import { TILE, PLAYER } from './constants.js';

// A small authoring API over the raw tile grid. Hand-counting a 150-column
// ASCII map is unforgiving to edit, so levels are described as rectangles and
// platforms in tile coordinates instead.
export class LevelBuilder {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows }, () => new Uint8Array(cols));
    this.spawns = [];
    this.checkpoints = [];
    this.pickups = [];
    this.triggers = [];
    this.npcs = [];
    this.goal = null;
    this.playerStart = { col: 2, row: 2 };
  }

  fill(c0, r0, c1, r1, tile = T.DIRT) {
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        this.grid[r][c] = tile;
      }
    }
    return this;
  }

  carve(c0, r0, c1, r1) {
    return this.fill(c0, r0, c1, r1, T.EMPTY);
  }

  // A one-tile-thick ledge.
  platform(c0, c1, row, tile = T.MOSS) {
    return this.fill(c0, row, c1, row, tile);
  }

  oneway(c0, c1, row) {
    return this.fill(c0, row, c1, row, T.ONEWAY);
  }

  spikes(c0, c1, row) {
    return this.fill(c0, row, c1, row, T.SPIKE);
  }

  enemy(type, col, row) {
    this.spawns.push({ type, x: col * TILE, y: row * TILE });
    return this;
  }

  checkpoint(col, row) {
    this.checkpoints.push({
      x: col * TILE,
      y: row * TILE,
      w: TILE,
      h: TILE * 2,
      active: false,
    });
    return this;
  }

  start(col, row) {
    this.playerStart = { col, row };
    return this;
  }

  setGoal(col, row) {
    this.goal = { x: col * TILE, y: row * TILE, w: TILE * 2, h: TILE * 2 };
    return this;
  }

  // A rectangular story beat: fires `onEnter(world, game)` when the player
  // enters the tile rectangle [c0,r0]-[c1,r1]. See StoryTrigger for the
  // once/flag options - passed straight through via `opts`.
  storyTrigger(c0, r0, c1, r1, opts = {}) {
    this.triggers.push({
      x: c0 * TILE,
      y: r0 * TILE,
      w: (c1 - c0 + 1) * TILE,
      h: (r1 - r0 + 1) * TILE,
      ...opts,
    });
    return this;
  }

  // A stationary figure the player can approach and press E to talk to. `row`
  // names the top of a 2-tile opening, the same convention `start()` and
  // `checkpoint()` use, so an NPC and the player standing next to it line up
  // on the same floor.
  npc(col, row, opts = {}) {
    this.npcs.push({
      x: col * TILE,
      y: (row + 2) * TILE - (opts.h ?? PLAYER.h),
      ...opts,
    });
    return this;
  }

  // A weapon lying on the ground - walking over it equips it. `row` follows
  // the same 2-tile-opening convention as `npc()`.
  weaponPickup(col, row, weaponId, opts = {}) {
    this.pickups.push({
      x: col * TILE,
      y: (row + 2) * TILE - (opts.h ?? 16),
      weaponId,
      ...opts,
    });
    return this;
  }

  build(name) {
    return {
      name,
      map: new Tilemap(this.grid),
      spawns: this.spawns,
      checkpoints: this.checkpoints,
      triggers: this.triggers,
      npcs: this.npcs,
      pickups: this.pickups,
      goal: this.goal,
      // Start rows name the top of a 2-tile-tall opening, the same convention
      // checkpoints use. The player is shorter than that opening, so drop them
      // to rest on its floor instead of spawning mid-air and falling.
      playerStart: {
        x: this.playerStart.col * TILE,
        y: (this.playerStart.row + 2) * TILE - PLAYER.h,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Level 1 - "The Undercroft"
//
// Paced so each mechanic is introduced alone before being combined:
//   run/shoot -> gap jumps -> spikes -> vertical wall-jump shaft ->
//   dash gaps -> mixed combat arena -> goal.
export function buildLevel1() {
  const COLS = 150;
  // Only three rows of bedrock sit below the surface. The camera clamps to the
  // level bounds, so deeper filler would push the horizon into the middle of
  // the screen whenever the player is standing on the ground - wasting half the
  // view on dirt nobody looks at.
  const ROWS = 29;
  const GROUND = 26; // top surface row of the main floor
  const b = new LevelBuilder(COLS, ROWS);

  // Bedrock across the whole level; pits are carved out afterwards.
  b.fill(0, GROUND, COLS - 1, ROWS - 1, T.DIRT);
  b.platform(0, COLS - 1, GROUND, T.MOSS); // grassy top layer

  // Outer walls so the player cannot run off the sides.
  b.fill(0, 0, 0, ROWS - 1, T.SOLID);
  b.fill(COLS - 1, 0, COLS - 1, ROWS - 1, T.SOLID);

  b.start(3, GROUND - 2);

  // -- Section 1: safe ground, learn to run and shoot ------------------------
  b.platform(8, 11, 22, T.MOSS);
  b.oneway(14, 17, 20);
  b.enemy('Walker', 17, GROUND - 1);

  // -- Section 2: first gap, then spikes ------------------------------------
  b.carve(24, GROUND, 27, ROWS - 1); // 4-tile death pit
  b.oneway(25, 26, 23); // optional stepping stone for the cautious route
  b.spikes(31, 33, GROUND - 1);
  b.enemy('Walker', 37, GROUND - 1);
  b.checkpoint(29, GROUND - 2);

  // -- Section 3: ascending platforms, first flyer and turret ---------------
  b.platform(36, 39, 23, T.MOSS);
  b.platform(42, 45, 20, T.MOSS);
  b.platform(48, 51, 17, T.MOSS);
  b.enemy('Flyer', 44, 14);
  b.enemy('Turret', 49, GROUND - 1);

  // -- Section 4: vertical wall-jump shaft ----------------------------------
  // The right-hand wall runs floor-to-ceiling, so the only way onward is up.
  // The left wall stops short of the floor, leaving a doorway to walk in.
  //
  // The interior is kept 3 tiles (96px) wide on purpose. A wall jump launches
  // at 330px/s sideways and 560px/s up, so crossing 96px takes ~0.29s and nets
  // ~74px of height per jump. Widen this and each jump gains almost nothing,
  // which makes the shaft unclimbable.
  // The left wall has to reach down to row 23 - just above the 2-tile doorway
  // at rows 24-25. If it stopped higher, the player standing on the shaft floor
  // would only ever touch the right wall, and jumping off it would throw them
  // into empty air with no opposite wall to catch. The climb needs both walls
  // present at the height where it starts.
  b.fill(54, 4, 54, 23, T.SOLID); // left wall (doorway at rows 24-25)
  b.fill(58, 8, 58, GROUND - 1, T.SOLID); // right wall (open at the top)
  b.carve(55, 4, 57, GROUND - 1); // shaft interior
  b.checkpoint(56, GROUND - 2);

  // -- Section 5: high route out of the shaft -------------------------------
  b.platform(60, 67, 8, T.MOSS);
  b.fill(60, 9, 67, 10, T.DIRT);
  b.oneway(69, 72, 11);
  b.platform(74, 79, 14, T.MOSS);
  b.fill(74, 15, 79, 15, T.DIRT);
  b.enemy('Flyer', 71, 6);
  b.enemy('Turret', 76, 13);

  // -- Section 6: spike corridor crossed on one-way platforms ---------------
  b.spikes(84, 89, GROUND - 1);
  b.oneway(83, 86, 22);
  b.oneway(88, 91, 19);
  b.enemy('Walker', 95, GROUND - 1);
  b.enemy('Flyer', 88, 15);
  b.checkpoint(93, GROUND - 2);

  // -- Section 7: dash gap over a wide pit ----------------------------------
  b.carve(104, GROUND, 112, ROWS - 1);
  b.oneway(106, 108, 23);
  b.platform(110, 112, 20, T.MOSS);
  b.enemy('Turret', 115, GROUND - 1);

  // -- Section 8: final arena and the goal ----------------------------------
  b.checkpoint(122, GROUND - 2);
  b.platform(126, 130, 22, T.MOSS);
  b.platform(134, 138, 19, T.MOSS);
  b.enemy('Walker', 124, GROUND - 1);
  b.enemy('Walker', 131, GROUND - 1);
  b.enemy('Flyer', 133, 14);
  b.enemy('Turret', 137, 18);

  b.fill(142, 22, 148, 23, T.DIRT);
  b.platform(142, 148, 22, T.MOSS);
  b.setGoal(145, 20);

  return b.build('The Undercroft');
}

export const LEVELS = [buildLevel1];
