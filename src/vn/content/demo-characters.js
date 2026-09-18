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
// The weights (breathe/tilt/sway) and `spring` settings are the
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
    { name: 'lower', pivot: [0.5, 1] },

    // Waist to shoulders, pivoting at the waist. This is where almost all
    // of the visible life comes from: the chest expands on the breath and
    // lifts everything above it, and the slow tilt is the postural drift.
    { name: 'torso', pivot: [0.5, waist], breathe: 1, tilt: 1 },

    // Arms hang off the torso. They need a drift of their own, on a
    // different period, or they read as welded on: the spring alone only
    // lags them behind the torso, and the torso barely rotates, so the lag
    // came out at a fraction of a degree. Opposite signs so the two arms
    // never swing as one slab.
    { name: 'arm_l', parent: 'torso', pivot: [shoulderL, shoulderY], sway: 1.3, spring: { stiffness: 45, damping: 10, amount: 0.6 } },
    { name: 'arm_r', parent: 'torso', pivot: [shoulderR, shoulderY], sway: -1.15, spring: { stiffness: 38, damping: 9, amount: 0.6 } },

    // Head rides on the torso. It is already lifted by the chest expanding
    // underneath it - that comes for free from the parent's scale, and is
    // the only lift it should get. `sway` gives it a drift that is not
    // just a multiple of the torso's.
    { name: 'head', parent: 'torso', pivot: [0.5, neck], tilt: -0.3, sway: 0.35 },

    // Driven by the animation, not by `layers`: eyes swap open/closed on the
    // blink timer, mouth cycles closed/half/open while this character speaks.
    // Both share the head's pivot, so they turn and scale exactly with the
    // face instead of sliding across it. No eye art yet, so that part is
    // simply skipped and blinking stays off until it is drawn.
    { name: 'eyes', parent: 'head', blink: true, pivot: [0.5, neck] },
    { name: 'mouth', parent: 'head', talk: true, pivot: [0.5, neck] },

    // Bangs, in front of the face. Stiffer and lighter than the back hair,
    // so the two do not swing as one slab.
    { name: 'hair_front', parent: 'head', pivot: [0.5, crown], spring: { stiffness: 110, damping: 9, amount: 0.8 } },

    // Optional - glasses, hairpins. Rigidly parented to the head.
    { name: 'accessory', parent: 'head', pivot: [0.5, neck] },
  ];
}

// Measured off this character's own artwork. The joints are at neck 0.21
// and waist 0.43, but the band cuts deliberately OVERLAP across them:
//   tools/split-parts.py <art>.png assets/characters/hero \
//       head:0:0.25 torso:0.19:0.47 lower:0.43:1
//
// The overlap is what lets the seams survive motion. The bands come from a
// flat illustration, so there is nothing painted behind them - butt-jointed
// edges expose the background as a crisp line the moment two parts move
// even a pixel apart. Each band reaching ~20px past its joint, drawn in
// back-to-front order, means small movements happen inside the overlap and
// never uncover anything.
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
// art file yet (eyes, hair_back, accessory) are simply skipped, so the rig
// can stay complete while the art arrives piece by piece. `mouth` is absent
// from `layers` on purpose - its variant comes from the talk timer.
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
