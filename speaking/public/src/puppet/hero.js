import { Character } from './character.js';

// The cut-out puppet rig for this character, back-to-front draw order. Every
// part is a full-canvas transparent PNG at
// assets/characters/<id>/<part>/<variant>.png.
//
// This is a copy of the rig from the game this puppet came from (see that
// repo's src/vn/content/demo-characters.js and its README section
// "動態立繪：素材拆分規格"), with the dialogue-only parts left out. The
// weights and springs ARE the performance: the torso carries the breath, the
// head drifts and rides on top of it, the hair lags behind the head.
//
// `pivot` is the joint a part turns around, as [x, y] fractions of the
// portrait box - x from the left, y from the TOP. They are measured off this
// character's own artwork: neck 0.21, waist 0.43.
const HERO_RIG = [
  // Hips down. The one part that does not move - it is what makes everything
  // above it read as motion rather than the whole image drifting.
  { name: 'lower', pivot: [0.5, 1] },

  // Waist to shoulders, pivoting at the waist. Almost all of the visible life
  // is here: the chest expands on the breath and lifts everything above it.
  { name: 'torso', pivot: [0.5, 0.43], breathe: 1, tilt: 1 },

  // Arms need a drift of their own, on a different period, or they read as
  // welded on - the spring alone only lags them behind a torso that barely
  // rotates. Opposite signs so the two never swing as one slab.
  { name: 'arm_l', parent: 'torso', pivot: [0.38, 0.25], sway: 1.3, spring: { stiffness: 45, damping: 10, amount: 0.6 } },
  { name: 'arm_r', parent: 'torso', pivot: [0.62, 0.25], sway: -1.15, spring: { stiffness: 38, damping: 9, amount: 0.6 } },

  // The head is already lifted by the chest expanding underneath it - that
  // comes for free from the parent's scale, and is the only lift it gets.
  { name: 'head', parent: 'torso', pivot: [0.5, 0.21], tilt: -0.3, sway: 0.35 },

  // Driven by the animation rather than by `layers`. Both share the head's
  // pivot so they turn and scale exactly with the face instead of sliding
  // across it. There is no eye art yet, so that part is skipped and blinking
  // stays off until it is drawn; the mouth is cut from three portraits.
  { name: 'eyes', parent: 'head', blink: true, pivot: [0.5, 0.21] },
  { name: 'mouth', parent: 'head', talk: true, pivot: [0.5, 0.21] },

  // Bangs, in front of the face. Stiffer and lighter than back hair would be,
  // so the two would not swing as one slab.
  { name: 'hair_front', parent: 'head', pivot: [0.5, 0.06], spring: { stiffness: 110, damping: 9, amount: 0.8 } },
];

// A factory rather than a shared singleton, so nothing leaks between reloads.
// `mouth` is deliberately absent from `layers`: its variant comes from the
// lip-sync track, not from here.
export function createHero() {
  return new Character('hero', {
    name: 'AI 學習助理',
    rig: HERO_RIG,
    layers: {
      lower: 'default',
      torso: 'default',
      arm_l: 'default',
      arm_r: 'default',
      head: 'default',
      hair_front: 'default',
    },
  });
}

export { HERO_RIG };
