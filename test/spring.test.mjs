// Spring tests: the lag-and-overshoot behaviour that gives hair and sleeves
// their follow-through. Pure maths, no canvas.

import { Spring } from '../src/vn/spring.js';
import { check, summary } from './harness.mjs';

const settle = (s, target, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) s.step(target, dt);
  return s.value;
};

console.log('\nchasing a target');
{
  const s = new Spring();
  check('starts at rest at zero', s.value === 0 && s.velocity === 0);

  s.step(1, 1 / 60);
  check('one step moves toward the target but nowhere near reaches it',
    s.value > 0 && s.value < 0.2, `${s.value.toFixed(4)}`);

  check('settles on the target given enough time',
    Math.abs(settle(s, 1, 5) - 1) < 1e-3, `${s.value.toFixed(5)}`);
}

console.log('\nlag: the whole point - it must not track the target instantly');
{
  const s = new Spring({ stiffness: 90, damping: 11 });
  // Sweep the target the way a head rotating does, and check the spring is
  // measurably behind it rather than glued to it.
  let maxLag = 0;
  for (let i = 0; i < 60; i++) {
    const target = Math.sin((i / 60) * Math.PI * 2);
    s.step(target, 1 / 60);
    maxLag = Math.max(maxLag, Math.abs(target - s.value));
  }
  check('the spring visibly trails a moving target', maxLag > 0.05, `max lag ${maxLag.toFixed(3)}`);
}

console.log('\novershoot: an underdamped spring swings past and comes back');
{
  const s = new Spring({ stiffness: 200, damping: 6 });
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    s.step(1, 1 / 60);
    peak = Math.max(peak, s.value);
  }
  check('a lightly-damped spring overshoots its target', peak > 1, `peak ${peak.toFixed(3)}`);
  check('and still settles back onto it', Math.abs(settle(s, 1, 5) - 1) < 1e-3);
}

console.log('\nstability: a long stall must not blow the spring up');
{
  const s = new Spring({ stiffness: 200, damping: 6 });
  // A backgrounded tab resuming hands us an enormous dt. Explicit Euler at
  // that step size would diverge; the fixed internal sub-step must not.
  s.step(1, 5);
  check('a huge dt produces a finite value', Number.isFinite(s.value), `${s.value}`);
  check('and stays in a sane range rather than exploding',
    Math.abs(s.value) < 10, `${s.value.toFixed(3)}`);
}

console.log('\nreset');
{
  const s = new Spring();
  settle(s, 1, 1);
  s.reset(0.5);
  check('reset jumps the value', s.value === 0.5);
  check('reset clears velocity so nothing swings afterwards', s.velocity === 0);
}

process.exit(summary() ? 0 : 1);
