import { TILE } from '../game/constants.js';

// Tile ids. Anything >= SOLID_MIN blocks movement on all sides.
export const T = {
  EMPTY: 0,
  ONEWAY: 1, // pass through from below / jump up through, land on top
  SPIKE: 2, // hazard, non-solid
  SOLID: 3,
  DIRT: 4,
  MOSS: 5,
};

const SOLID_MIN = T.SOLID;

export const isSolidTile = (t) => t >= SOLID_MIN;
export const isOneWay = (t) => t === T.ONEWAY;
export const isHazard = (t) => t === T.SPIKE;

// Character -> tile id, used by the ASCII level format.
export const CHAR_TO_TILE = {
  '.': T.EMPTY,
  ' ': T.EMPTY,
  '#': T.SOLID,
  'D': T.DIRT,
  'M': T.MOSS,
  '-': T.ONEWAY,
  '^': T.SPIKE,
};

export class Tilemap {
  constructor(grid) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
  }

  static fromASCII(lines) {
    // Pad every row to the longest so the grid is rectangular; a ragged grid
    // makes every bounds check a special case.
    const width = Math.max(...lines.map((l) => l.length));
    const grid = lines.map((line) => {
      const row = new Uint8Array(width);
      for (let x = 0; x < width; x++) {
        const ch = line[x] ?? '.';
        row[x] = CHAR_TO_TILE[ch] ?? T.EMPTY;
      }
      return row;
    });
    return new Tilemap(grid);
  }

  at(col, row) {
    // Off the sides is solid, so nothing can leave the level horizontally.
    if (col < 0 || col >= this.cols) return T.SOLID;
    // Above the level is open: jumping past the top must not hit an invisible
    // ceiling.
    if (row < 0) return T.EMPTY;
    // Below the level is also open, which is what makes a pit carved through
    // the bottom row genuinely lethal. Returning SOLID here would give every
    // pit an invisible floor to land on and get stuck in.
    if (row >= this.rows) return T.EMPTY;
    return this.grid[row][col];
  }

  atPixel(x, y) {
    return this.at(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  set(col, row, value) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return;
    this.grid[row][col] = value;
  }

  // Does this axis-aligned box overlap any fully solid tile?
  overlapsSolid(x, y, w, h) {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (isSolidTile(this.at(c, r))) return true;
      }
    }
    return false;
  }

  overlapsHazard(x, y, w, h) {
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(y / TILE);
    const r1 = Math.floor((y + h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        // Spikes get a forgiving hitbox: the player must be well inside the
        // tile, not merely brushing its edge.
        if (isHazard(this.at(c, r))) {
          const sx = c * TILE + 8;
          const sy = r * TILE + 12;
          if (x < sx + TILE - 16 && x + w > sx && y < sy + TILE - 12 && y + h > sy) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Is there a one-way platform whose top edge sits between the mover's old and
  // new bottom edge? Only ever collides when falling.
  oneWayBelow(x, w, oldBottom, newBottom) {
    if (newBottom < oldBottom) return null;
    const c0 = Math.floor(x / TILE);
    const c1 = Math.floor((x + w - 1) / TILE);
    const r0 = Math.floor(oldBottom / TILE);
    const r1 = Math.floor(newBottom / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (isOneWay(this.at(c, r))) {
          const top = r * TILE;
          // `oldBottom <= top` keeps you from snapping up onto a platform you
          // were already standing inside of.
          if (oldBottom <= top + 1 && newBottom >= top) return top;
        }
      }
    }
    return null;
  }
}
