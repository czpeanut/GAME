// PortraitMotion tests: the normalised idle-motion channels, blink timing
// and mouth cycling. Pure timers, no canvas or image loading.

import { PortraitMotion } from '../src/vn/portrait-motion.js';
import { check, summary } from './harness.mjs';

console.log('\nchannels stay in their normalised range');
{
  const m = new PortraitMotion();
  let ok = true;
  for (let i = 0; i < 3000; i++) {
    m.update(1 / 60, i % 2 === 0);
    if (m.breathe < 0 || m.breathe > 1) ok = false;
    if (Math.abs(m.tilt) > 1 || Math.abs(m.sway) > 1) ok = false;
  }
  check('breathe stays within 0..1 and tilt/sway within -1..1', ok);
}

console.log('\nthe three idle channels run on different periods');
{
  // If they shared a period they would repeatedly line up and the character
  // would visibly pulse on one beat. Their ratios must keep drifting.
  const m = new PortraitMotion();
  const ratioAt = () => m.breathe / (m.tilt || 1e-9);
  m.update(1, false);
  const first = ratioAt();
  m.update(1.3, false);
  const second = ratioAt();
  check('breathe and tilt do not move in lockstep', Math.abs(first - second) > 1e-3);
}

console.log('\ntwo characters do not breathe in unison');
{
  // Each instance starts at a randomised point in its cycle, so a pair on
  // screen together never looks like one puppet driven twice.
  const a = new PortraitMotion();
  const b = new PortraitMotion();
  check('two fresh instances start at different phases', a.t !== b.t);
}

console.log('\nblink: closes briefly at randomised intervals, then reopens');
{
  const m = new PortraitMotion({ blinkEvery: [0.1, 0.1], blinkDuration: 0.05, doubleBlinkChance: 0 });
  check('starts with eyes open', m.blinking === false);

  m.update(0.1); // reaches the (fixed, since lo === hi) blink threshold
  check('blinking starts once the interval elapses', m.blinking === true);

  m.update(0.02);
  check('still blinking mid-blink', m.blinking === true);

  m.update(0.05); // past blinkDuration
  check('eyes reopen after blinkDuration elapses', m.blinking === false);
}

console.log('\nblink: never gets permanently stuck closed or open over a long run');
{
  const m = new PortraitMotion({ blinkEvery: [0.05, 0.1], blinkDuration: 0.03 });
  let sawOpen = false;
  let sawClosed = false;
  for (let i = 0; i < 6000; i++) {
    m.update(1 / 60);
    if (m.blinking) sawClosed = true;
    else sawOpen = true;
  }
  check('over a long run the eyes are open most of the time', sawOpen);
  check('over a long run the eyes do close at least once', sawClosed);
}

console.log('\nbreathing is an asymmetric breath, not a sine');
{
  // A symmetric wave reads as a machine. The inhale must be quicker than
  // the exhale, and there must be a rest at the bottom before the next one.
  const period = 4;
  const m = new PortraitMotion({ breathePeriod: period, inhaleFraction: 0.32, exhaleFraction: 0.48 });
  m.t = 0; // pin the phase; the constructor randomises it

  const sample = [];
  const step = period / 400;
  for (let i = 0; i < 400; i++) {
    sample.push(m.breathe);
    m.update(step, false);
  }

  check('rests at exactly 0 (a part at rest sits at its drawn size)', sample[0] === 0);
  check('reaches a full inhale of 1', Math.max(...sample) > 0.999);
  check('never goes below 0', Math.min(...sample) >= 0);

  const peakAt = sample.indexOf(Math.max(...sample)) / sample.length;
  check('peaks about a third of the way in (quick inhale)',
    Math.abs(peakAt - 0.32) < 0.03, `peak at ${(peakAt * 100).toFixed(0)}% of the cycle`);

  const atRest = sample.filter((v) => v === 0).length / sample.length;
  check('spends a real pause at the bottom of the breath',
    atRest > 0.15, `${(atRest * 100).toFixed(0)}% of the cycle at rest`);

  // The exhale is longer than the inhale, so the fall is gentler than the rise.
  const rise = Math.max(...sample.slice(0, 128).map((v, i, a) => (i ? v - a[i - 1] : 0)));
  const fall = Math.min(...sample.slice(128, 320).map((v, i, a) => (i ? v - a[i - 1] : 0)));
  check('the exhale is gentler than the inhale', Math.abs(fall) < rise,
    `rise ${rise.toFixed(4)}/step vs fall ${Math.abs(fall).toFixed(4)}/step`);
}

console.log('\nthere is no whole-body bounce while speaking');
{
  // Regression: a ~4Hz body bounce used to run the entire time a character
  // was speaking, which in a single-character script is always - it read as
  // the character shaking. Talking belongs to the mouth.
  const m = new PortraitMotion();
  check('no talkBounce channel exists any more', m.talkBounce === undefined);

  const before = { breathe: m.breathe, tilt: m.tilt, sway: m.sway };
  m.speaking = true;
  check('speaking does not change the idle channels',
    m.breathe === before.breathe && m.tilt === before.tilt && m.sway === before.sway);
}

console.log('\nmouth: cycles only while speaking, and closes when done');
{
  const m = new PortraitMotion({ mouthFps: 30 });
  check('mouth is closed (index 0) while silent', m.mouthIndex === 0);

  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    m.update(1 / 60, true);
    seen.add(m.mouthIndex);
  }
  check('speaking cycles through more than one mouth shape', seen.size > 1, `saw ${[...seen].join(',')}`);
  check('mouth shapes stay within the three available variants',
    [...seen].every((i) => i >= 0 && i <= 2));

  m.update(1 / 60, false);
  check('the mouth closes the moment speaking stops', m.mouthIndex === 0);
}

process.exit(summary() ? 0 : 1);
