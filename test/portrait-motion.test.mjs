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
    if (Math.abs(m.breathe) > 1 || Math.abs(m.tilt) > 1 || Math.abs(m.sway) > 1) ok = false;
    if (m.talkBounce < 0 || m.talkBounce > 1) ok = false;
  }
  check('breathe/tilt/sway stay within -1..1 and talkBounce within 0..1', ok);
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

console.log('\ntalk bounce: only active while speaking, never lifts the feet');
{
  const m = new PortraitMotion();
  m.update(1 / 60, false);
  check('talkBounce is exactly 0 while not speaking', m.talkBounce === 0);

  let sawMotion = false;
  let everNegative = false;
  for (let i = 0; i < 120; i++) {
    m.update(1 / 60, true);
    if (m.talkBounce > 0) sawMotion = true;
    if (m.talkBounce < 0) everNegative = true;
  }
  check('talkBounce moves while speaking', sawMotion);
  check('talkBounce never goes negative (bounces down into stance, not up)', !everNegative);

  m.update(1 / 60, false);
  check('talkBounce snaps back to 0 the instant speaking stops', m.talkBounce === 0);
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
