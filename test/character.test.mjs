// Character (paper-doll state) tests: pure layer bookkeeping, no images or
// canvas involved.

import { Character } from '../src/vn/character.js';
import { check, summary } from './harness.mjs';

console.log('\nlayers: get/set/equip');
{
  const c = new Character('mei', {
    name: '小安',
    slots: ['body', 'outfit', 'hair'],
    layers: { body: 'base', outfit: 'uniform' },
  });
  check('an equipped slot reads back its variant', c.getLayer('outfit') === 'uniform');
  check('a slot with no entry reads as null', c.getLayer('hair') === null);

  c.setLayer('outfit', 'gym');
  check('setLayer changes a single slot', c.getLayer('outfit') === 'gym');

  c.equip({ hair: 'ponytail', outfit: 'casual' });
  check('equip() sets several slots at once (hair)', c.getLayer('hair') === 'ponytail');
  check('equip() sets several slots at once (outfit)', c.getLayer('outfit') === 'casual');
  check('equip() does not disturb an untouched slot', c.getLayer('body') === 'base');
}

console.log('\nun-equipping a slot');
{
  const c = new Character('mei', { slots: ['accessory'], layers: { accessory: 'glasses' } });
  c.setLayer('accessory', null);
  check('setLayer(slot, null) un-equips the slot', c.getLayer('accessory') === null);
}

console.log('\nexpressions');
{
  const withFace = new Character('mei', { slots: ['body', 'face'], layers: { face: 'neutral' } });
  withFace.setExpression('happy');
  check('setExpression updates .expression', withFace.expression === 'happy');
  check('setExpression also drives the face slot when the character has one',
    withFace.getLayer('face') === 'happy');

  const noFace = new Character('mei', { slots: ['body'] });
  noFace.setExpression('happy');
  check('a character with no face slot still tracks .expression without throwing',
    noFace.expression === 'happy');
}

console.log('\nclone');
{
  const original = new Character('mei', {
    name: '小安',
    slots: ['body', 'outfit'],
    layers: { body: 'base', outfit: 'uniform' },
    expression: 'happy',
  });
  const copy = original.clone();
  copy.setLayer('outfit', 'gym');
  check('a clone starts with the same layers', original.getLayer('outfit') === 'uniform');
  check('mutating the clone does not affect the original', copy.getLayer('outfit') === 'gym');
  check('the clone keeps the same id/name/expression',
    copy.id === 'mei' && copy.name === '小安' && copy.expression === 'happy');
}

console.log('\ndefaults');
{
  const bare = new Character('x');
  check('name falls back to the id when none is given', bare.name === 'x');
  check('expression defaults to neutral', bare.expression === 'neutral');
  check('slots default to an empty list', bare.slots.length === 0);
}

process.exit(summary() ? 0 : 1);
