// Stage tests: which characters are on screen where, background selection,
// and the expression/outfit/speaker bookkeeping a dialogue script drives
// through `action(stage, app)`. No canvas involved - PortraitRenderer is the
// only thing that turns this into pixels.

import { Character } from '../src/vn/character.js';
import { Stage } from '../src/vn/stage.js';
import { check, summary } from './harness.mjs';

const RIG = [
  { name: 'torso', pivot: [0.5, 0.47], breathe: 1 },
  { name: 'head', parent: 'torso', pivot: [0.5, 0.25], tilt: 1 },
  { name: 'face', parent: 'head' },
  { name: 'hair_front', parent: 'head', spring: { stiffness: 90, damping: 10, amount: 1 } },
];

function makeStage() {
  return new Stage({
    teacher: new Character('teacher', { name: '陳老師', rig: RIG }),
    mei: new Character('mei', { name: '小安', rig: RIG }),
  });
}

console.log('\nbackground');
{
  const s = makeStage();
  check('background starts unset', s.background === null);
  s.setBackground('classroom');
  check('setBackground updates it', s.background === 'classroom');
}

console.log('\nshow/hide: who is on stage and where');
{
  const s = makeStage();
  check('nobody is on stage at first', s.onStage.length === 0);

  s.show('teacher', 'left');
  s.show('mei', 'right');
  const positions = Object.fromEntries(s.onStage.map((e) => [e.character.id, e.position]));
  check('two characters end up in their given positions',
    positions.teacher === 'left' && positions.mei === 'right');

  s.hide('teacher');
  check('hide removes just that character', s.onStage.map((e) => e.character.id).join(',') === 'mei');

  s.show('mei', 'center'); // moving an already-shown character
  check('showing an already-visible character moves it instead of duplicating',
    s.onStage.length === 1 && s.onStage[0].position === 'center');

  s.hideAll();
  check('hideAll clears everyone', s.onStage.length === 0);
}

console.log('\nshowing an unknown character id is a safe no-op');
{
  const s = makeStage();
  s.show('ghost', 'left');
  check('nothing was added for an id with no matching Character', s.onStage.length === 0);
}

console.log('\nexpression and outfit changes reach the underlying Character');
{
  const s = makeStage();
  s.setExpression('teacher', 'happy');
  check('setExpression forwards to the character', s.characters.teacher.expression === 'happy');

  s.equip('mei', { torso: 'gym' });
  check('equip forwards to the character', s.characters.mei.getLayer('torso') === 'gym');

  check('touching an unknown character id does not throw', (() => {
    try { s.setExpression('ghost', 'happy'); s.equip('ghost', { torso: 'x' }); return true; }
    catch { return false; }
  })());
}

console.log('\nmotion: created on first entrance, speaking flag drives the talker only');
{
  const s = makeStage();
  check('no motion exists before a character has ever been shown',
    s.motionFor('teacher') === undefined);

  s.show('teacher', 'left');
  s.show('mei', 'right');
  check('a motion exists once shown', !!s.motionFor('teacher') && !!s.motionFor('mei'));

  s.setSpeaker('teacher');
  s.update(1 / 60);
  check('the speaking character is talking', s.motionFor('teacher').speaking === true);
  check('everyone else is not', s.motionFor('mei').speaking === false);

  s.setSpeaker(null);
  s.update(1 / 60);
  check('clearing the speaker stops everyone talking', s.motionFor('teacher').speaking === false);
}

console.log('\nrig: created per character on entrance and driven by update()');
{
  const s = makeStage();
  check('no rig exists before a character has ever been shown',
    s.rigFor('teacher') === undefined);

  s.show('teacher', 'left');
  s.show('mei', 'right');
  check('a rig exists once shown', !!s.rigFor('teacher') && !!s.rigFor('mei'));
  check('each character gets its own rig instance, not a shared one',
    s.rigFor('teacher') !== s.rigFor('mei'));

  // Run long enough for the slow idle channels to move off their start.
  for (let i = 0; i < 120; i++) s.update(1 / 60);
  const torso = s.rigFor('teacher').byName.get('torso');
  check('update() drives the rig, not just the motion clock', torso.transform.scaleY !== 1);

  const teacherTorso = s.rigFor('teacher').byName.get('torso').transform.scaleY;
  const meiTorso = s.rigFor('mei').byName.get('torso').transform.scaleY;
  check('two characters are not breathing in perfect unison', teacherTorso !== meiTorso,
    `${teacherTorso} vs ${meiTorso}`);
}

process.exit(summary() ? 0 : 1);
