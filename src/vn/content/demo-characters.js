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

// Measured off the 學長 artwork. The joints are at neck 0.21 and waist 0.43,
// but the band cuts deliberately OVERLAP across them:
//   tools/split-parts.py <art>.png assets/characters/hero \
//       head:0:0.25 torso:0.19:0.47 lower:0.43:1
//
// The overlap is what lets the seams survive motion. The bands come from a
// flat illustration, so there is nothing painted behind them - butt-jointed
// edges expose the background as a crisp line the moment two parts move even
// a pixel apart. Each band reaching ~20px past its joint, drawn in
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

// 學姊: a rig hand-written rather than built by buildRig(), because this
// character did not come from horizontal band cuts. The artist supplied ten
// real layers, each complete in itself, so the parts do not have to be a
// stack of bands and the rig can follow the anatomy instead.
//
// What that buys, in order of how much it matters:
//   - the long hair is its own layer, so it can trail the head properly
//   - the skirt is its own layer, so it can sway from the waist; on a
//     character in a dress that is most of the life
//   - the raised arm is its own layer, and the body behind it is complete
//   - the waist ties are their own layer, so they can whip
//   - the irises are separate from the face, so the eyes could look around
//
// What it does not buy, because the art is not there:
//   - no blinking: there is no closed-eye drawing, and hiding the irises on
//     their own would read as her eyes rolling back, not as a blink
//   - no mouth movement: the mouth is painted into the face layer, so there
//     is no `mouth` part for the talk timer to drive
// Both are one small layer away - see the README.
//
// Joints measured off the assembled figure (fractions of the part canvas,
// x from the left, y from the TOP). She stands slightly left of centre in
// her own art because the skirt flares to the right.
const SENPAI_RIG = [
  // Long hair, behind everything, springing off the head. The loosest thing
  // on the character and the single biggest reason she reads as alive.
  { name: 'hair_back', parent: 'head', pivot: [0.42, 0.035], spring: { stiffness: 110, damping: 9, amount: 1.5 } },

  // Legs. The one part that genuinely does not move - it is what makes
  // everything above it read as motion rather than the whole image drifting.
  { name: 'lower', pivot: [0.44, 1] },

  // Waist to shoulders. Both rotation channels, on their own periods, so the
  // body is never repeating one obvious loop.
  { name: 'torso', pivot: [0.44, 0.36], breathe: 1.6, tilt: 3, sway: 1.2 },

  // The skirt hangs off the waist and swings well past the body, because it
  // can: there is a whole painted figure behind it. A dress that follows a
  // beat late is most of what sells this character.
  { name: 'skirt', parent: 'torso', pivot: [0.44, 0.36], sway: 2.6, spring: { stiffness: 70, damping: 8, amount: 1.1 } },

  // The bodice is cloth too, but fitted, so it just rides the torso.
  { name: 'bodice', parent: 'torso', pivot: [0.44, 0.36] },

  // The raised arm needs a drift of its own, not just a spring: the torso
  // rotates little enough that lag alone comes out at a fraction of a degree
  // and the arm reads as welded on. Opposite sign to the skirt so the two
  // never swing as one slab.
  { name: 'arm_r', parent: 'torso', pivot: [0.56, 0.245], sway: -2.6, spring: { stiffness: 80, damping: 10, amount: 0.7 } },

  // The head counter-rotates against the torso, which turns a stiff sway into
  // something that reads as her shifting her weight.
  { name: 'head', parent: 'torso', pivot: [0.43, 0.205], tilt: -0.9, sway: 1.2 },

  // Irises, over the face's own eye whites. Deliberately NOT marked `blink`:
  // that would make the renderer ask for closed.png, which does not exist,
  // and the part would vanish for the length of every blink.
  { name: 'eyes', parent: 'head', pivot: [0.43, 0.205] },

  // Bangs. Stiffer and lighter than the hair behind, so the two never swing
  // as one slab.
  { name: 'hair_front', parent: 'head', pivot: [0.42, 0.035], spring: { stiffness: 170, damping: 11, amount: 0.9 } },

  // The waist ties: tiny, loose, and the fastest thing on her.
  { name: 'bows', parent: 'torso', pivot: [0.44, 0.36], spring: { stiffness: 220, damping: 8, amount: 1.4 } },
];

// Faster than the defaults, which were set for a character cut from a flat
// illustration and had to stay timid. Nothing here is a loop anyone can count:
// the three periods are deliberately not multiples of each other.
const SENPAI_MOTION = {
  breathePeriod: 3.2,
  tiltPeriod: 4.3,
  swayPeriod: 3.1,
};

// `layers` names the variant showing in each part. A part with no art file is
// simply skipped, so a rig can stay complete while the art arrives piece by
// piece - which is why HERO_RIG can keep declaring parts nobody has drawn yet.
export function createDemoCharacters() {
  return {
    senpai: new Character('senpai', {
      name: '學姊',
      rig: SENPAI_RIG,
      motion: SENPAI_MOTION,
      layers: {
        hair_back: 'default',
        lower: 'default',
        torso: 'default',
        skirt: 'default',
        bodice: 'default',
        arm_r: 'default',
        head: 'default',
        eyes: 'default',
        hair_front: 'default',
        bows: 'default',
      },
    }),
  };
}

// The previous character, kept so the band-cut rig and its art stay usable.
// Nothing in the demo script refers to it.
export function createHero() {
  return new Character('hero', {
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
  });
}
