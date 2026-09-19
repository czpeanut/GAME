// Character tests: pure part/variant bookkeeping, no images or canvas.

import { Character } from '../src/vn/character.js';
import { check, summary } from './harness.mjs';

console.log('\nlayers: get/set/equip');
{
  const c = new Character('mei', {
    name: '小安',
    rig: [{ name: 'torso' }, { name: 'head' }, { name: 'hair_front' }],
    layers: { torso: 'uniform', head: 'default' },
  });
  check('an equipped part reads back its variant', c.getLayer('torso') === 'uniform');
  check('a part with no entry reads as null', c.getLayer('hair_front') === null);

  c.setLayer('torso', 'gym');
  check('setLayer changes a single part', c.getLayer('torso') === 'gym');

  c.equip({ hair_front: 'ponytail', torso: 'casual' });
  check('equip() sets several parts at once (hair_front)', c.getLayer('hair_front') === 'ponytail');
  check('equip() sets several parts at once (torso)', c.getLayer('torso') === 'casual');
  check('equip() does not disturb an untouched part', c.getLayer('head') === 'default');
}

console.log('\nun-equipping a part');
{
  const c = new Character('mei', { rig: [{ name: 'accessory' }], layers: { accessory: 'glasses' } });
  c.setLayer('accessory', null);
  check('setLayer(part, null) un-equips it', c.getLayer('accessory') === null);
}

console.log('\nslots are derived from the rig, in draw order');
{
  const c = new Character('mei', {
    rig: [{ name: 'hair_back' }, { name: 'torso' }, { name: 'head' }],
  });
  check('slots lists every rig part in declaration order',
    c.slots.join(',') === 'hair_back,torso,head');
}

console.log('\nexpressions');
{
  const withFace = new Character('mei', {
    rig: [{ name: 'head' }, { name: 'face' }],
    layers: { face: 'neutral' },
  });
  withFace.setExpression('happy');
  check('setExpression updates .expression', withFace.expression === 'happy');
  check('setExpression also drives the face part when the rig has one',
    withFace.getLayer('face') === 'happy');

  const noFace = new Character('mei', { rig: [{ name: 'head' }] });
  noFace.setExpression('happy');
  check('a character with no face part still tracks .expression without throwing',
    noFace.expression === 'happy');
}

console.log('\nclone');
{
  const original = new Character('mei', {
    name: '小安',
    rig: [{ name: 'torso', breathe: 1 }, { name: 'head', parent: 'torso' }],
    layers: { torso: 'uniform' },
    expression: 'happy',
  });
  const copy = original.clone();
  copy.setLayer('torso', 'gym');
  check('a clone starts with the same layers', original.getLayer('torso') === 'uniform');
  check('mutating the clone does not affect the original', copy.getLayer('torso') === 'gym');
  check('the clone keeps the same id/name/expression',
    copy.id === 'mei' && copy.name === '小安' && copy.expression === 'happy');
  check('the clone carries the rig over', copy.slots.join(',') === 'torso,head');

  copy.rig[0].breathe = 0;
  check('the clone\'s rig is its own copy, not shared with the original',
    original.rig[0].breathe === 1);
}

console.log('\ndefaults');
{
  const bare = new Character('x');
  check('name falls back to the id when none is given', bare.name === 'x');
  check('expression defaults to neutral', bare.expression === 'neutral');
  check('rig defaults to empty', bare.rig.length === 0 && bare.slots.length === 0);
}

process.exit(summary() ? 0 : 1);
