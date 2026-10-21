import { SpriteSheet, ImageAsset } from '../engine/sprites.js';

// Which art set the game draws with.
//   ai      - Gemini-generated art in assets/ai/, packed by tools/ai_*.py
//   classic - the original procedural shapes and tools/make-spritesheet.mjs
// `?art=classic` in the URL switches back, for side-by-side comparison.
//
// Every AI asset is optional at runtime: anything that has not loaded (or
// failed to) silently falls back to the procedural drawing, so a missing PNG
// can never break the game.
export function pickArtSet(search = typeof location !== 'undefined' ? location.search : '') {
  const want = new URLSearchParams(search).get('art');
  return want === 'classic' ? 'classic' : 'ai';
}

export const ART_SET = pickArtSet();
export const USE_AI_ART = ART_SET === 'ai';

const lazySheet = (def) => (USE_AI_ART ? new SpriteSheet(def) : null);
const lazyImage = (src) => (USE_AI_ART ? new ImageAsset(src) : null);

// Enemy and NPC sheets. Rows/frames must match tools/ai_spritesheet.py's
// config for each sheet.
export const WALKER_ANIMS = {
  walk: { row: 0, frames: 4 },
  charge: { row: 1, frames: 2 },
};
export const walkerSheet = lazySheet({ src: './assets/ai/walker.png', frameW: 48, frameH: 48 });

export const npcSheets = {
  zhou: lazySheet({ src: './assets/ai/zhou.png', frameW: 48, frameH: 48 }),
};

// Parallax layers, far to near. `factor` is the fraction of camera movement
// each layer follows; `bottom` is how far below the view's bottom edge the
// layer's own bottom edge sits (it is partly hidden behind the ground).
export const backdropLayers = USE_AI_ART
  ? [
      { image: lazyImage('./assets/ai/bg_sky.png'), factor: 0.04, bottom: 0, fill: true },
      { image: lazyImage('./assets/ai/bg_far.png'), factor: 0.14, bottom: -6 },
      { image: lazyImage('./assets/ai/bg_mid.png'), factor: 0.36, bottom: 84 },
    ]
  : null;

// Ground textures. The cap is drawn over the top edge of exposed ground;
// CAP_OVERHANG is how many of its rows (weeds, pebbles) poke up above the
// tile's top edge, as reported by tools/ai_backdrop.py.
export const tileArt = USE_AI_ART
  ? { fill: lazyImage('./assets/ai/tile_fill.png'), cap: lazyImage('./assets/ai/tile_cap.png') }
  : null;
export const CAP_OVERHANG = 3;
