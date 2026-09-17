import { Character } from '../character.js';

// The cut-out puppet rig, back-to-front draw order. Every part is a
// full-canvas transparent PNG at
// assets/characters/<id>/<part>/<variant>.png - see the README's
// "動態立繪：素材拆分規格" for what each one must contain.
//
// `pivot` is the joint the part turns around, as [x, y] fractions of the
// portrait box (x from the left, y from the TOP). These are measured per
// character: two full-body standing poses can still put the neck and waist
// at quite different heights, and a head pivoting above its actual neck
// swings like a bobblehead. Hence buildRig() taking measurements rather
// than one hard-coded list.
//
// The weights (breathe/tilt/nod/sway/bounce) and `spring` settings are the
// performance itself: torso carries the breath, head drifts and rides on
// top of it, hair lags behind the head. See rig.js.
function buildRig({ neck, waist, shoulderY, shoulderL, shoulderR, crown }) {
  return [
    // Behind everything: long hair at the back of the head. Springs off the
    // head so it trails the turn instead of moving with it.
    { name: 'hair_back', parent: 'head', pivot: [0.5, crown], spring: { stiffness: 70, damping: 10, amount: 1.25 } },

    // Hips down. The one part that genuinely does not move - it is what
    // makes everything above it read as motion rather than the whole image
    // drifting.
    { name: 'lower', pivot: [0.5, 1], sway: 0.15 },

    // Waist to shoulders. Carries the breath, pivoting at the waist so the
    // chest rises while the hips stay put.
    { name: 'torso', pivot: [0.5, waist], breathe: 1, tilt: 0.25, sway: 1, bounce: 0.4 },

    // Arms hang off the torso and lag behind it slightly.
    { name: 'arm_l', parent: 'torso', pivot: [shoulderL, shoulderY], spring: { stiffness: 55, damping: 11, amount: 0.45 } },
    { name: 'arm_r', parent: 'torso', pivot: [shoulderR, shoulderY], spring: { stiffness: 55, damping: 11, amount: 0.45 } },

    // Head rides on the torso: it gets the full idle tilt, plus `nod`
    // lifting it slightly on each breath.
    { name: 'head', parent: 'torso', pivot: [0.5, neck], tilt: 1, nod: 1, bounce: 1 },

    // Driven by the animation, not by `layers`: eyes swap open/closed on the
    // blink timer, mouth cycles closed/half/open while this character
    // speaks. No art for these yet, so they are simply skipped - blinking
    // and lip movement stay off until those parts are drawn.
    { name: 'eyes', parent: 'head', blink: true, pivot: [0.5, neck] },
    { name: 'mouth', parent: 'head', talk: true, pivot: [0.5, neck] },

    // Bangs, in front of the face. Stiffer and lighter than the back hair,
    // so the two do not swing as one slab.
    { name: 'hair_front', parent: 'head', pivot: [0.5, crown], spring: { stiffness: 110, damping: 9, amount: 0.8 } },

    // Optional - glasses, hairpins. Rigidly parented to the head.
    { name: 'accessory', parent: 'head', pivot: [0.5, neck] },
  ];
}

// Measured off this character's own artwork; the band cuts in
// assets/characters/hero/ were made at the same neck/waist fractions:
//   tools/split-parts.py <art>.png assets/characters/hero \
//       head:0:0.21 torso:0.21:0.43 lower:0.43:1
//
// Seams start to show past roughly 2x these motion amplitudes, because the
// body bands are cut from a flat illustration with nothing painted behind
// them - at 3x a gap opens at the collar. The rig's defaults sit well
// inside that.
const HERO_RIG = buildRig({
  crown: 0.06,
  neck: 0.21,
  shoulderY: 0.25,
  shoulderL: 0.38,
  shoulderR: 0.62,
  waist: 0.43,
});

// A factory (not a shared singleton) because App.startScript() calls this
// fresh on every playthrough, so a previous run's changes never leak into
// the next one.
//
// `layers` names the variant showing in each part. Parts named here with no
// art file yet (eyes, mouth, hair_back, accessory) are simply skipped, so
// the rig can stay complete while the art arrives piece by piece.
export function createDemoCharacters() {
  return {
    hero: new Character('hero', {
      name: '學長',
      rig: HERO_RIG,
      layers: {
        hair_back: 'default',
        lower: 'default',
        torso: 'default',
        arm_l: 'default',
        arm_r: 'default',
        head: 'default',
        hair_front: 'default',
        accessory: 'default',
      },
    }),
  };
}
