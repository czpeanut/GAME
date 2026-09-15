// PortraitMotion tests: idle bob, blink timing, talk pulse. Pure timers, no
// canvas or image loading involved.

import { PortraitMotion } from '../src/vn/portrait-motion.js';
import { check, summary } from './harness.mjs';

console.log('\nbob: a periodic wave, not a one-shot');
{
  const m = new PortraitMotion({ bobAmplitude: 4, bobPeriod: 2 });
  check('bob starts at zero (sin(0))', Math.abs(m.bobY) < 1e-9);
  m.update(0.5); // a quarter period in
  check('bob reaches its peak a quarter-period in', Math.abs(m.bobY - 4) < 1e-6, `${m.bobY}`);
  m.update(0.5); // half period total
  check('bob returns to zero at the half-period', Math.abs(m.bobY) < 1e-6, `${m.bobY}`);
  check('bob never exceeds its configured amplitude', (() => {
    const m2 = new PortraitMotion({ bobAmplitude: 4, bobPeriod: 2 });
    for (let i = 0; i < 240; i++) {
      m2.update(1 / 60);
      if (Math.abs(m2.bobY) > 4 + 1e-6) return false;
    }
    return true;
  })());
}

console.log('\nblink: closes briefly at randomised intervals, then reopens');
{
  const m = new PortraitMotion({ blinkEvery: [0.1, 0.1], blinkDuration: 0.05 });
  check('starts with eyes open', m.blinking === false);

  m.update(0.1); // reaches the (fixed, since lo===hi) blink threshold
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

console.log('\ntalk pulse: only active while speaking');
{
  const m = new PortraitMotion({ talkPulseAmount: 0.1 });
  m.update(1 / 60, false);
  check('talkScale is exactly 1 while not speaking', m.talkScale === 1);

  m.update(1 / 60, true);
  check('talkScale moves away from 1 while speaking', m.talkScale !== 1);
  check('talkScale stays within the configured pulse amount',
    Math.abs(m.talkScale - 1) <= 0.1 + 1e-9);

  m.update(1 / 60, false);
  check('talkScale snaps back to 1 the instant speaking stops', m.talkScale === 1);
}

process.exit(summary() ? 0 : 1);
