import { Character } from '../character.js';

// A two-piece breathing rig: `lower` (waist down - legs, feet) stays put,
// `upper` (waist up - torso, arms, head) gets the idle breathing motion,
// pivoted at `breathingSplit` (a fraction of the portrait's height from the
// top). Both pieces are the SAME full-canvas image with everything outside
// their own band made transparent - not separately cropped/resized - so at
// rest (breatheScaleY === 1) they reconstruct the original artwork exactly,
// with zero visible seam. See tools/split-breathing-seam.py for how these
// were generated from a single flat illustration; splitting a flat image
// this way needs no new drawing, just picking a seam row.
//
// The simplest possible setup for a *new* character is still one slot/one
// image (`slots: ['body'], layers: { body: 'default' }`, no
// `breathingSplit`) - that whole-image approximation is what
// PortraitRenderer falls back to when breathingSplit is null. This two-piece
// version is the upgrade once you want the chest to visibly rise instead of
// the whole body pulsing.
export function createDemoCharacters() {
  return {
    teacher: new Character('teacher', {
      name: '陳老師',
      slots: ['lower', 'upper'],
      layers: { lower: 'default', upper: 'default' },
      breathingSplit: 0.46,
    }),
    mei: new Character('mei', {
      name: '小安',
      slots: ['lower', 'upper'],
      layers: { lower: 'default', upper: 'default' },
      breathingSplit: 0.46,
    }),
  };
}
