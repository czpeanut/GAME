// Input tests: on-screen taps feed the same action set keyboard and gamepad
// do, with the same press/held/release edges. No DOM involved - a stub
// target swallows addEventListener so Input can be constructed in Node.

import { Input } from '../src/engine/input.js';
import { check, summary } from './harness.mjs';

function stubTarget() {
  return { addEventListener() {} };
}

console.log('\ntouch: down/up produce the same edges as a keyboard press');
{
  const input = new Input(stubTarget());
  input.poll(); // establish a clean baseline frame

  input.touchDown('confirm');
  input.poll();
  check('a touch press is held this frame', input.down('confirm'));
  check('a touch press registers as a fresh edge', input.pressed('confirm'));

  input.poll();
  check('holding a touch button stays held on the next poll', input.down('confirm'));
  check('holding a touch button is not a press edge on the next poll', !input.pressed('confirm'));

  input.touchUp('confirm');
  input.poll();
  check('releasing a touch button clears held', !input.down('confirm'));
  check('releasing a touch button registers a release edge', input.released('confirm'));
}

console.log('\ntouch: a tap shorter than one poll still latches a press edge');
{
  // Mirrors the keyboard's own latching contract (see poll()'s comment): a
  // down+up that both happen before the next poll is still guaranteed to be
  // seen as held for exactly that one poll, so a very fast tap can never be
  // silently swallowed between polls.
  const input = new Input(stubTarget());
  input.poll();

  input.touchDown('confirm');
  input.touchUp('confirm'); // released before the next poll ever runs
  input.poll();
  check('a same-frame down+up still produces a press edge', input.pressed('confirm'));
  check('and counts as held for that one latched poll', input.down('confirm'));

  input.poll();
  check('but is no longer held on the following poll', !input.down('confirm'));
}

console.log('\ntouch: independent from keyboard and gamepad sources');
{
  const input = new Input(stubTarget());
  input.keys.add('up');
  input.touchDown('confirm');
  input.poll();
  check('a keyboard-held action stays reported', input.down('up'));
  check('a touch-held action is reported alongside it', input.down('confirm'));

  input.keys.delete('up');
  input.poll();
  check('releasing the keyboard action does not touch the touch action', input.down('confirm'));
}

console.log('\ntouch: blur clears touch state like it clears keys/pad');
{
  const input = new Input(stubTarget());
  input.touchDown('confirm');
  input.poll();
  check('sanity: the touch action is held before blur', input.down('confirm'));

  input.touch.clear(); // mirrors what the real blur listener does
  input.poll();
  check('a cleared touch set is no longer held', !input.down('confirm'));
}

process.exit(summary() ? 0 : 1);
