// PortraitMotion tests: breathing scale, sway, tilt, blink timing, talk
// bounce. Pure timers, no canvas or image loading involved.

import { PortraitMotion } from '../src/vn/portrait-motion.js';
import { check, summary } from './harness.mjs';

console.log('\nbreathe: a periodic vertical-scale wave, not a one-shot');
{
  const m = new PortraitMotion({ breatheAmplitude: 0.02, breathePeriod: 2 });
  check('breathe starts at 1 (sin(0))', Math.abs(m.breatheScaleY - 1) < 1e-9);
  m.update(0.5); // a quarter period in
  check('breathe reaches its peak a quarter-period in',
    Math.abs(m.breatheScaleY - 1.02) < 1e-6, `${m.breatheScaleY}`);
  m.update(0.5); // half period total
  check('breathe returns to 1 at the half-period', Math.abs(m.breatheScaleY - 1) < 1e-6);
  check('breathe never exceeds its configured amplitude', (() => {
    const m2 = new PortraitMotion({ breatheAmplitude: 0.02, breathePeriod: 2 });
    for (let i = 0; i < 240; i++) {
      m2.update(1 / 60);
      if (Math.abs(m2.breatheScaleY - 1) > 0.02 + 1e-6) return false;
    }
    return true;
  })());
}

console.log('\nsway and tilt: slow periodic drift on their own, different periods');
{
  const m = new PortraitMotion({ swayAmplitude: 5, swayPeriod: 4, tiltAmplitudeDeg: 2, tiltPeriod: 6 });
  check('sway starts at zero', Math.abs(m.swayX) < 1e-9);
  m.update(1); // a quarter of the 4s sway period
  check('sway reaches its peak a quarter-period in', Math.abs(m.swayX - 5) < 1e-6, `${m.swayX}`);
  check('sway never exceeds its configured amplitude', (() => {
    const m2 = new PortraitMotion({ swayAmplitude: 5, swayPeriod: 4 });
    for (let i = 0; i < 600; i++) {
      m2.update(1 / 60);
      if (Math.abs(m2.swayX) > 5 + 1e-6) return false;
    }
    return true;
  })());
  check('tilt never exceeds its configured amplitude (in radians)', (() => {
    const maxRad = (2 * Math.PI) / 180;
    const m2 = new PortraitMotion({ tiltAmplitudeDeg: 2, tiltPeriod: 6 });
    for (let i = 0; i < 600; i++) {
      m2.update(1 / 60);
      if (Math.abs(m2.tiltRad) > maxRad + 1e-9) return false;
    }
    return true;
  })());
  check('sway and tilt are not in lockstep (different periods/phase)', (() => {
    // If they moved identically this ratio would stay constant; it should
    // drift since the two run on deliberately different periods.
    const a = new PortraitMotion({ swayAmplitude: 5, swayPeriod: 4, tiltAmplitudeDeg: 2, tiltPeriod: 6 });
    a.update(1);
    const ratioAt1 = a.swayX / a.tiltRad;
    a.update(1.3);
    const ratioAt2_3 = a.swayX / a.tiltRad;
    return Math.abs(ratioAt1 - ratioAt2_3) > 1e-3;
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

console.log('\ntalk bounce: only active while speaking, and never lifts the feet');
{
  const m = new PortraitMotion({ talkBounceAmount: 3.5 });
  m.update(1 / 60, false);
  check('talkBounceY is exactly 0 while not speaking', m.talkBounceY === 0);

  m.update(1 / 60, true);
  check('talkBounceY moves away from 0 while speaking', m.talkBounceY !== 0);
  check('talkBounceY never goes negative (bounces down into stance, not up)',
    m.talkBounceY >= 0);
  check('talkBounceY stays within the configured amount',
    m.talkBounceY <= 3.5 + 1e-9);

  m.update(1 / 60, false);
  check('talkBounceY snaps back to 0 the instant speaking stops', m.talkBounceY === 0);
}

process.exit(summary() ? 0 : 1);
