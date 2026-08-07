import { TILE } from './constants.js';
import { isSolidTile } from '../engine/tilemap.js';

// A moving axis-aligned box with tilemap collision.
//
// Movement resolves one axis at a time (X fully, then Y). Doing both at once
// makes corner cases ambiguous - you cannot tell whether a diagonal move hit a
// wall or a floor, and the mover snags on flat ground made of separate tiles.
//
// Each axis is stepped in sub-steps no larger than a tile, so nothing can
// tunnel through geometry at high speed (a dash covers ~11px/frame, but a long
// fall or a knockback can exceed a full tile per frame).
export class Body {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.vx = 0;
    this.vy = 0;

    this.grounded = false;
    this.wasGrounded = false;
    this.ceiling = false;
    this.wallLeft = false;
    this.wallRight = false;

    // Set false for entities that should pass through one-way platforms.
    this.useOneWay = true;
    this.dropThrough = false;
  }

  get centerX() {
    return this.x + this.w / 2;
  }
  get centerY() {
    return this.y + this.h / 2;
  }
  get bottom() {
    return this.y + this.h;
  }
  get right() {
    return this.x + this.w;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  move(map, dt) {
    this.wasGrounded = this.grounded;
    this.grounded = false;
    this.ceiling = false;
    this.wallLeft = false;
    this.wallRight = false;

    this._moveAxis(map, this.vx * dt, 0);
    this._moveAxis(map, 0, this.vy * dt);

    this._probeWalls(map);
  }

  _moveAxis(map, dx, dy) {
    const dist = Math.abs(dx || dy);
    if (dist === 0) return;
    // Sub-step so a fast mover can never skip over a tile.
    const steps = Math.max(1, Math.ceil(dist / (TILE * 0.5)));
    const sx = dx / steps;
    const sy = dy / steps;

    for (let i = 0; i < steps; i++) {
      if (sx !== 0 && !this._stepX(map, sx)) break;
      if (sy !== 0 && !this._stepY(map, sy)) break;
    }
  }

  // Returns false when the step was blocked, so the caller stops sub-stepping.
  _stepX(map, sx) {
    const nx = this.x + sx;
    if (!map.overlapsSolid(nx, this.y, this.w, this.h)) {
      this.x = nx;
      return true;
    }
    // Snap flush against the tile edge we hit.
    if (sx > 0) {
      const col = Math.floor((nx + this.w - 1) / TILE);
      this.x = col * TILE - this.w;
      this.wallRight = true;
    } else {
      const col = Math.floor(nx / TILE);
      this.x = (col + 1) * TILE;
      this.wallLeft = true;
    }
    this.vx = 0;
    return false;
  }

  _stepY(map, sy) {
    const ny = this.y + sy;

    // One-way platforms only exist for a downward move and only when the mover
    // was fully above them a moment ago.
    if (sy > 0 && this.useOneWay && !this.dropThrough) {
      const top = map.oneWayBelow(this.x, this.w, this.bottom, ny + this.h);
      if (top !== null) {
        this.y = top - this.h;
        this.vy = 0;
        this.grounded = true;
        return false;
      }
    }

    if (!map.overlapsSolid(this.x, ny, this.w, this.h)) {
      this.y = ny;
      return true;
    }

    if (sy > 0) {
      const row = Math.floor((ny + this.h - 1) / TILE);
      this.y = row * TILE - this.h;
      this.grounded = true;
    } else {
      const row = Math.floor(ny / TILE);
      this.y = (row + 1) * TILE;
      this.ceiling = true;
    }
    this.vy = 0;
    return false;
  }

  // Wall flags drive wall-slide and wall-jump, so they need to be true whenever
  // the player is *touching* a wall - not only on the frame they collided with
  // it. Probe one pixel to each side.
  _probeWalls(map) {
    // Inset vertically so a floor tile flush with a wall doesn't read as a wall.
    const y = this.y + 2;
    const h = this.h - 4;
    if (map.overlapsSolid(this.x - 1, y, 1, h)) this.wallLeft = true;
    if (map.overlapsSolid(this.right, y, 1, h)) this.wallRight = true;
  }

  // Ground check used for coyote time - a 1px probe under the feet.
  isOnGround(map) {
    if (map.overlapsSolid(this.x, this.bottom, this.w, 1)) return true;
    return map.oneWayBelow(this.x, this.w, this.bottom, this.bottom + 1) !== null;
  }

  overlaps(other) {
    return (
      this.x < other.x + other.w &&
      this.x + this.w > other.x &&
      this.y < other.y + other.h &&
      this.y + this.h > other.y
    );
  }
}

export function isSolidAt(map, x, y) {
  return isSolidTile(map.atPixel(x, y));
}
