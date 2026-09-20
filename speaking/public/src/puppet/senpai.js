import { Character } from './character.js';

// Lifted verbatim from the game's src/vn/content/demo-characters.js so the
// two apps animate the same character identically. Same copy-and-drift
// trade-off as the rest of this folder - see scripts/build-client.js.

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
//   - the eyes and the mouth are their own layers over a face that has
//     neither drawn on it, so she can blink and talk
//
// Joints measured off the assembled figure (fractions of the part canvas,
// x from the left, y from the TOP). She stands slightly left of centre in
// her own art because the skirt flares to the right.
const SENPAI_RIG = [
  // Long hair, behind everything, lagging the head. `amount` is the important
  // number: it is how much of the spring's deviation from the head is actually
  // applied, and it is what decides whether the hair reads as attached. Too
  // high and the hair swings independently of the skull, which looks like a
  // wig sliding around rather than hair moving.
  { name: 'hair_back', parent: 'head', pivot: [0.42, 0.035], spring: { stiffness: 150, damping: 13, amount: 0.5 } },

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

  // Blinking: open -> half -> closed -> half -> open.
  //
  // This only works because the face layer has NO eyes drawn on it. The first
  // face had the eye whites and lashes painted in, so a closed eye left white
  // showing and the painted lashes sat still while the eye drawings changed -
  // which is what looked wrong, not the blink itself. All three eye drawings
  // here are the artist's.
  { name: 'eyes', parent: 'head', blink: true, pivot: [0.43, 0.205] },

  // Lip sync. Driven by the talk timer, not by `layers`: closed / half / open.
  { name: 'mouth', parent: 'head', talk: true, pivot: [0.43, 0.205] },

  // Bangs. Stiffer and lighter than the hair behind, so the two never swing
  // as one slab.
  { name: 'hair_front', parent: 'head', pivot: [0.42, 0.035], spring: { stiffness: 210, damping: 15, amount: 0.35 } },

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

// A factory rather than a shared singleton, so nothing leaks between reloads.
// `eyes` and `mouth` are absent from `layers` on purpose: their variants come
// from the blink and talk timers, not from here.
export function createSenpai() {
  return new Character('senpai', {
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
      hair_front: 'default',
      bows: 'default',
    },
  });
}

export { SENPAI_RIG, SENPAI_MOTION };
