import { Character } from '../character.js';

// A minimal example of the paper-doll slot convention. Draw order is
// back-to-front: body first, then outfit over it, then hair, then the face
// (eyes get an automatic "_closed" swap for blinking - see
// portrait-renderer.js), then an optional accessory on top.
//
// No art files exist for these yet (that's on you to drop into
// assets/characters/<id>/<slot>/<variant>.png - see the README), so right
// now every character renders as a labelled placeholder block. That is
// deliberate: the whole engine - branching, expression/outfit swaps, scoring
// - is fully exercisable and testable before a single image exists.
const SLOTS = ['body', 'outfit', 'hair', 'eyes', 'face', 'accessory'];

// A factory (not a shared singleton) because App.startScript() calls this
// fresh on every playthrough, so a previous run's outfit/expression changes
// never leak into the next one.
export function createDemoCharacters() {
  return {
    teacher: new Character('teacher', {
      name: '陳老師',
      slots: SLOTS,
      layers: { body: 'base', outfit: 'blazer', hair: 'short', eyes: 'calm', face: 'neutral' },
    }),
    mei: new Character('mei', {
      name: '小安',
      slots: SLOTS,
      layers: { body: 'base', outfit: 'uniform', hair: 'ponytail', eyes: 'bright', face: 'neutral' },
    }),
  };
}
