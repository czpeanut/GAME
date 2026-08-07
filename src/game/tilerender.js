import { TILE, COLORS } from './constants.js';
import { T, isSolidTile } from '../engine/tilemap.js';

// Draws only the tiles inside the camera view. A 150x32 level is 4800 tiles;
// iterating all of them every frame would waste most of the frame budget on
// geometry nobody can see.
//
// Tiles are drawn with edge-awareness: a solid tile with nothing above it gets
// a lit top face, which is what makes flat-coloured blocks read as terrain.
export class TileRenderer {
  constructor(map) {
    this.map = map;
  }

  render(ctx, camX, camY, viewW, viewH) {
    const map = this.map;
    const c0 = Math.max(0, Math.floor(camX / TILE));
    const c1 = Math.min(map.cols - 1, Math.floor((camX + viewW) / TILE));
    const r0 = Math.max(0, Math.floor(camY / TILE));
    const r1 = Math.min(map.rows - 1, Math.floor((camY + viewH) / TILE));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = map.at(c, r);
        if (t === T.EMPTY) continue;
        const x = c * TILE;
        const y = r * TILE;

        if (t === T.SPIKE) this._spikes(ctx, x, y);
        else if (t === T.ONEWAY) this._oneWay(ctx, x, y);
        else this._solid(ctx, x, y, c, r, t);
      }
    }
  }

  _solid(ctx, x, y, c, r, t) {
    const map = this.map;
    const openAbove = !isSolidTile(map.at(c, r - 1));
    const isMoss = t === T.MOSS;

    // Body, shaded slightly darker the deeper it sits.
    const depth = Math.min(3, this._depthBelowSurface(c, r));
    ctx.fillStyle = depth > 1 ? COLORS.tileDeep : COLORS.tileFace;
    ctx.fillRect(x, y, TILE, TILE);

    // Subtle inner texture so large slabs are not flat.
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);

    if (openAbove) {
      // Lit top face + a lip, the main readability cue for a standable surface.
      ctx.fillStyle = isMoss ? COLORS.mossTop : COLORS.tileTop;
      ctx.fillRect(x, y, TILE, 5);
      ctx.fillStyle = isMoss ? COLORS.moss : 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y + 5, TILE, 3);

      if (isMoss) {
        // A few hanging tufts, deterministic per column so they never flicker.
        ctx.fillStyle = COLORS.moss;
        for (let i = 0; i < 3; i++) {
          const seed = (c * 31 + i * 17) % 11;
          ctx.fillRect(x + 2 + i * 10, y + 8, 3, 3 + (seed % 4));
        }
      }
    }

    // Side highlights where a tile faces open space.
    if (!isSolidTile(map.at(c - 1, r))) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(x, y, 2, TILE);
    }
    if (!isSolidTile(map.at(c + 1, r))) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + TILE - 2, y, 2, TILE);
    }
  }

  _depthBelowSurface(c, r) {
    let d = 0;
    for (let i = 1; i <= 3; i++) {
      if (isSolidTile(this.map.at(c, r - i))) d++;
      else break;
    }
    return d;
  }

  _oneWay(ctx, x, y) {
    ctx.fillStyle = COLORS.oneway;
    ctx.fillRect(x, y, TILE, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, TILE, 2);
    // Support struts hint that this platform is thin and pass-through.
    ctx.fillStyle = 'rgba(92,109,158,0.45)';
    ctx.fillRect(x + 5, y + 6, 3, 5);
    ctx.fillRect(x + TILE - 8, y + 6, 3, 5);
  }

  _spikes(ctx, x, y) {
    ctx.fillStyle = COLORS.spike;
    const count = 4;
    const w = TILE / count;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w, y + TILE);
      ctx.lineTo(x + i * w + w / 2, y + 6);
      ctx.lineTo(x + (i + 1) * w, y + TILE);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < count; i++) {
      ctx.fillRect(x + i * w + w / 2 - 1, y + 8, 1, 6);
    }
    ctx.fillStyle = '#5a1f2e';
    ctx.fillRect(x, y + TILE - 4, TILE, 4);
  }
}
