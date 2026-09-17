import { Character } from '../character.js';

// The simplest possible setup: one slot, one image per character. Breathing/
// blink/talk-bounce (PortraitMotion) is applied to the whole portrait as a
// transform, not per layer, so a single flat illustration already gets the
// full "可動立繪" effect with zero extra art - no body/outfit/hair/face
// layers needed unless you actually want costume or expression swaps later
// (see the README's "進階：紙娃娃換裝" section for that path, which the
// Character/Stage API already supports if you ever want it).
//
// No art file exists yet (that's on you to drop into
// assets/characters/<id>/body/default.png - see the README), so right now
// each character renders as a labelled placeholder block. That's
// deliberate: branching/scoring is fully testable before a single image
// exists.
export function createDemoCharacters() {
  return {
    teacher: new Character('teacher', {
      name: '陳老師',
      slots: ['body'],
      layers: { body: 'default' },
    }),
    mei: new Character('mei', {
      name: '小安',
      slots: ['body'],
      layers: { body: 'default' },
    }),
  };
}
