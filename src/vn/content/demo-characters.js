import { Character } from '../character.js';

// The cut-out puppet rig, back-to-front draw order. Every part is a
// full-canvas transparent PNG at
// assets/characters/<id>/<part>/<variant>.png - see the README's
// "動態立繪：素材拆分規格" for what each one must contain and, crucially,
// which hidden areas have to be painted in behind it.
//
// `pivot` is the joint the part turns around, as [x, y] fractions of the
// portrait box (x from the left, y from the TOP). These are the numbers to
// nudge if a new character's proportions differ - a head that pivots above
// its actual neck will swing like a bobblehead.
//
// The weights (breathe/tilt/nod/sway/bounce) and `spring` settings are the
// performance itself: torso carries the breath, head drifts and rides on
// top of it, hair lags behind the head. See rig.js.
// Pivots below are for a FULL-BODY standing pose (head around the top
// quarter, waist near the middle). A bust/half-body portrait needs entirely
// different numbers - the joints sit at different fractions of the frame.
const NECK = 0.25; // head/torso joint
const WAIST = 0.47; // torso/hips joint
const SHOULDER = 0.30;
const CROWN = 0.08; // top of the head, where hair hangs from

const RIG = [
  // Behind everything: long hair at the back of the head. Springs off the
  // head so it trails the turn instead of moving with it.
  { name: 'hair_back', parent: 'head', pivot: [0.5, CROWN], spring: { stiffness: 70, damping: 10, amount: 1.25 } },

  // Hips down. The one part that genuinely does not move - it is what makes
  // everything above it read as motion rather than the whole image drifting.
  { name: 'lower', pivot: [0.5, 1], sway: 0.15 },

  // Waist to shoulders. Carries the breath, pivoting at the waist so the
  // chest rises while the hips stay put.
  { name: 'torso', pivot: [0.5, WAIST], breathe: 1, tilt: 0.25, sway: 1, bounce: 0.4 },

  // Arms hang off the torso and lag behind it slightly.
  { name: 'arm_l', parent: 'torso', pivot: [0.36, SHOULDER], spring: { stiffness: 55, damping: 11, amount: 0.45 } },
  { name: 'arm_r', parent: 'torso', pivot: [0.64, SHOULDER], spring: { stiffness: 55, damping: 11, amount: 0.45 } },

  // Head rides on the torso: it gets the full idle tilt, plus `nod` lifting
  // it slightly on each breath.
  { name: 'head', parent: 'torso', pivot: [0.5, NECK], tilt: 1, nod: 1, bounce: 1 },

  // Driven by the animation, not by `layers`: eyes swap open/closed on the
  // blink timer, mouth cycles closed/half/open while this character speaks.
  // They inherit the head's transform and add none of their own, so their
  // pivot only needs to be somewhere sane.
  { name: 'eyes', parent: 'head', blink: true, pivot: [0.5, NECK] },
  { name: 'mouth', parent: 'head', talk: true, pivot: [0.5, NECK] },

  // Bangs, in front of the face. Stiffer and lighter than the back hair, so
  // the two do not swing as one slab.
  { name: 'hair_front', parent: 'head', pivot: [0.5, CROWN], spring: { stiffness: 110, damping: 9, amount: 0.8 } },

  // Optional - glasses, hairpins. Rigidly parented to the head.
  { name: 'accessory', parent: 'head', pivot: [0.5, NECK] },
];

// A factory (not a shared singleton) because App.startScript() calls this
// fresh on every playthrough, so a previous run's changes never leak into
// the next one.
//
// `layers` names the variant showing in each part. Parts missing from it
// (or with no art file yet) are simply skipped, so this works with a
// partial art set - drop in `torso` and `head` first and the rest can
// follow later without touching any code.
export function createDemoCharacters() {
  const baseLayers = {
    hair_back: 'default',
    lower: 'default',
    torso: 'default',
    arm_l: 'default',
    arm_r: 'default',
    head: 'default',
    hair_front: 'default',
    accessory: 'default',
  };

  return {
    teacher: new Character('teacher', { name: '陳老師', rig: RIG, layers: { ...baseLayers } }),
    mei: new Character('mei', { name: '小安', rig: RIG, layers: { ...baseLayers } }),
  };
}
