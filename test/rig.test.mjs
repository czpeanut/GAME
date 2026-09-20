// Rig tests: transform composition down the part hierarchy, per-channel
// weighting, and spring follow-through. Pure maths, no canvas.

import { Rig } from '../src/vn/rig.js';
import { check, summary } from './harness.mjs';

// A stand-in for PortraitMotion: fixed channel values, so a test states
// exactly which channel it is exercising.
function motion(channels = {}) {
  return {
    breathe: 0,
    tilt: 0,
    sway: 0,
    blinking: false,
    mouthIndex: 0,
    ...channels,
  };
}

console.log('\nchannels only move the parts that are weighted for them');
{
  const rig = new Rig([
    { name: 'lower', pivot: [0.5, 1] },
    { name: 'torso', pivot: [0.5, 0.47], breathe: 1 },
  ]);
  rig.update(1 / 60, motion({ breathe: 1 }));

  const lower = rig.byName.get('lower');
  const torso = rig.byName.get('torso');
  check('an unweighted part stays completely still', lower.transform.scaleY === 1);
  check('a breathe-weighted part scales vertically', torso.transform.scaleY > 1);
  check('breathing never scales horizontally (that would read as a zoom)',
    torso.transform.scaleX === 1);
}

console.log('\nweights scale a channel rather than switching it on/off');
{
  const rig = new Rig([
    { name: 'full', tilt: 1 },
    { name: 'quarter', tilt: 0.25 },
  ]);
  rig.update(1 / 60, motion({ tilt: 1 }));
  const full = rig.byName.get('full').transform.angle;
  const quarter = rig.byName.get('quarter').transform.angle;
  check('a 0.25-weighted part turns a quarter as far as a 1.0-weighted one',
    Math.abs(quarter - full * 0.25) < 1e-9, `${quarter} vs ${full}`);
}

console.log('\nhierarchy: world angles accumulate down the chain');
{
  const rig = new Rig([
    { name: 'torso', tilt: 0.5 },
    { name: 'head', parent: 'torso', tilt: 1 },
  ]);
  rig.update(1 / 60, motion({ tilt: 1 }));
  const torso = rig.byName.get('torso');
  const head = rig.byName.get('head');
  check('a child\'s world angle includes its parent\'s',
    Math.abs(head.worldAngle - (torso.worldAngle + head.transform.angle)) < 1e-9);
  check('so a child on a turning parent ends up turned further than either alone',
    head.worldAngle > torso.worldAngle && head.worldAngle > head.transform.angle);
}

console.log('\nupdate order resolves parents first, whatever the draw order');
{
  // hair_back is drawn FIRST (behind everything) but is parented to a head
  // declared later - the update pass has to sort that out or the hair reads
  // a stale parent angle every frame.
  const rig = new Rig([
    { name: 'hair_back', parent: 'head', spring: { stiffness: 80, damping: 10, amount: 1 } },
    { name: 'head', tilt: 1 },
  ]);
  const order = rig.updateOrder.map((p) => p.name);
  check('the parent is updated before the child that hangs off it',
    order.indexOf('head') < order.indexOf('hair_back'), order.join(' -> '));
  check('draw order is left untouched (hair still drawn behind the head)',
    rig.parts.map((p) => p.name).join(',') === 'hair_back,head');
}

console.log('\nspring follow-through: hair trails the head, then catches up');
{
  const rig = new Rig([
    { name: 'head', tilt: 1 },
    { name: 'hair', parent: 'head', spring: { stiffness: 70, damping: 10, amount: 1 } },
  ]);
  const head = rig.byName.get('head');
  const hair = rig.byName.get('hair');

  // Snap the head to a turned pose and step a single frame.
  rig.update(1 / 60, motion({ tilt: 1 }));
  check('the head turns immediately', Math.abs(head.worldAngle) > 0);
  check('the hair has barely started moving on the same frame',
    Math.abs(hair.worldAngle) < Math.abs(head.worldAngle) * 0.5,
    `hair ${hair.worldAngle.toFixed(5)} vs head ${head.worldAngle.toFixed(5)}`);

  // Hold that pose - the hair should converge on the head.
  for (let i = 0; i < 300; i++) rig.update(1 / 60, motion({ tilt: 1 }));
  check('holding the pose lets the hair settle onto the head\'s angle',
    Math.abs(hair.worldAngle - head.worldAngle) < 1e-3,
    `hair ${hair.worldAngle.toFixed(5)} vs head ${head.worldAngle.toFixed(5)}`);
}

console.log('\nsettle(): a character walking on stage should not swing into place');
{
  const rig = new Rig([
    { name: 'head', tilt: 1 },
    { name: 'hair', parent: 'head', spring: { stiffness: 70, damping: 10, amount: 1 } },
  ]);
  for (let i = 0; i < 60; i++) rig.update(1 / 60, motion({ tilt: 1 }));
  rig.settle();
  check('settle clears spring motion', rig.byName.get('hair').spring.velocity === 0);
  check('and zeroes it so nothing is mid-swing', rig.byName.get('hair').spring.value === 0);
}

console.log('\nrobustness');
{
  const empty = new Rig();
  check('an empty rig updates without throwing', (() => {
    try { empty.update(1 / 60, motion()); return true; } catch { return false; }
  })());

  const orphan = new Rig([{ name: 'hand', parent: 'arm_that_does_not_exist', tilt: 1 }]);
  check('a part naming a missing parent is treated as a root rather than crashing', (() => {
    try {
      orphan.update(1 / 60, motion({ tilt: 1 }));
      return Number.isFinite(orphan.byName.get('hand').worldAngle);
    } catch {
      return false;
    }
  })());

  const cyclic = new Rig([
    { name: 'a', parent: 'b' },
    { name: 'b', parent: 'a' },
  ]);
  check('a parent cycle does not hang the update loop', (() => {
    try { cyclic.update(1 / 60, motion({ tilt: 1 })); return true; } catch { return false; }
  })());
  check('chainTo also survives a cycle', (() => {
    try { return cyclic.chainTo('a').length > 0; } catch { return false; }
  })());
}

console.log('\nsway is a second rotation driver, not a sideways slide');
{
  // Sliding a part sideways moves it off the one it hangs from, so the
  // waist or neck visibly shears. Every idle channel must turn a joint.
  const rig = new Rig([{ name: 'arm', sway: 1 }]);
  rig.update(1 / 60, motion({ sway: 1 }));
  const t = rig.byName.get('arm').transform;
  check('sway produces rotation', t.angle !== 0);
  check('sway produces no horizontal translation', t.x === undefined || t.x === 0);
}

console.log('\na parent\'s breathing scale moves children without stretching them');
{
  // The renderer divides parentScaleY back out of the part's own scale, so
  // the chest expanding lifts the head rather than elongating the face.
  const rig = new Rig([
    { name: 'torso', pivot: [0.5, 0.43], breathe: 1 },
    { name: 'head', parent: 'torso', pivot: [0.5, 0.21] },
    { name: 'hair', parent: 'head', pivot: [0.5, 0.06] },
  ]);
  rig.update(1 / 60, motion({ breathe: 1 }));
  const torso = rig.byName.get('torso');
  const head = rig.byName.get('head');
  const hair = rig.byName.get('hair');

  check('the torso is the one that actually scales', torso.transform.scaleY > 1);
  check('a root part inherits no scale', torso.parentScaleY === 1);
  check('the head records the torso\'s scale as inherited',
    Math.abs(head.parentScaleY - torso.transform.scaleY) < 1e-12);
  check('the head does not scale on its own', head.transform.scaleY === 1);

  // What the renderer will actually apply for each part.
  const applied = (p) => p.transform.scaleY / p.parentScaleY;
  check('the torso draws stretched', applied(torso) > 1);
  check('the head draws at its natural height despite riding a stretching torso',
    Math.abs(applied(head) - 1 / torso.transform.scaleY) < 1e-12);

  // The head has already cancelled the torso's stretch, so the hair hanging
  // off it must inherit 1 and cancel nothing. Accumulating the head's NOMINAL
  // scale instead made the hair cancel the same breath a second time, around
  // its own pivot - and since the crown sits much further from the waist than
  // the neck does, that moved the hair about twice as far as the head it is
  // attached to. On screen that is a wig floating off a skull.
  check('a part below one that already cancelled the stretch inherits nothing',
    Math.abs(hair.parentScaleY - 1) < 1e-12, `${hair.parentScaleY}`);
  check('so the hair applies no scale of its own', Math.abs(applied(hair) - 1) < 1e-12);
}

console.log('\na part hanging off the head moves exactly as far as the head');
{
  // The actual symptom, measured the way the renderer positions things:
  // replay the chain and see where each pivot lands.
  const rig = new Rig([
    { name: 'torso', pivot: [0.5, 0.36], breathe: 1 },
    { name: 'head', parent: 'torso', pivot: [0.5, 0.205] },
    { name: 'hair', parent: 'head', pivot: [0.5, 0.035] },
    { name: 'eyes', parent: 'head', pivot: [0.5, 0.205] },
  ]);
  rig.update(1 / 60, motion({ breathe: 1 }));

  const landsAt = (name) => {
    const part = rig.byName.get(name);
    let y = part.pivot[1];
    for (const node of rig.chainTo(name)) {
      const scale = node.transform.scaleY / (node.parentScaleY || 1);
      y = node.pivot[1] + (y - node.pivot[1]) * scale;
    }
    return y - part.pivot[1];
  };

  const head = landsAt('head');
  check('the head is lifted by the chest under it', head < 0, `${head}`);
  check('hair at the crown moves exactly as far as the head',
    Math.abs(landsAt('hair') - head) < 1e-12, `hair ${landsAt('hair')} vs head ${head}`);
  check('and so do the eyes', Math.abs(landsAt('eyes') - head) < 1e-12);
  check('the torso\'s own joint does not move', Math.abs(landsAt('torso')) < 1e-12);
}

console.log('\nchainTo: root-first, so the renderer can replay transforms in order');
{
  const rig = new Rig([
    { name: 'torso' },
    { name: 'head', parent: 'torso' },
    { name: 'hair', parent: 'head' },
  ]);
  check('returns the whole ancestry, outermost first',
    rig.chainTo('hair').map((p) => p.name).join(' -> ') === 'torso -> head -> hair');
  check('a root part returns just itself',
    rig.chainTo('torso').map((p) => p.name).join(',') === 'torso');
}

process.exit(summary() ? 0 : 1);
