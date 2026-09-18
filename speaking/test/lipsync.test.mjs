// The mouth track: turning live loudness readings into mouth shapes. Pure
// maths, no Web Audio - which is the point of keeping MouthTrack separate from
// the analyser that feeds it.

import { MouthTrack, mouthIndexForLevel, HOP_SECONDS } from '../public/src/puppet/lipsync.js';
import { check, summary } from './harness.mjs';

// Feed a track a pattern of [seconds, loudness] and return the shape it showed
// at each window.
function speak(pattern, { hop = HOP_SECONDS } = {}) {
  const track = new MouthTrack({ hop });
  const shapes = [];
  for (const [seconds, loudness] of pattern) {
    for (let t = 0; t < seconds; t += hop) shapes.push(track.push(loudness, hop));
  }
  return shapes;
}

console.log('\nsilence keeps the mouth shut');
{
  const shapes = speak([[1, 0]]);
  check('a silent stretch never opens the mouth', shapes.every((s) => s === 0));
}

console.log('\nthe mouth follows the syllables and closes in the gaps');
{
  const shapes = speak([[0.3, 0.3], [0.3, 0], [0.3, 0.3], [0.3, 0]]);
  const quarter = Math.floor(shapes.length / 4);
  check('open during the first syllable', shapes.slice(1, quarter).some((s) => s > 0));
  check('shut again in the gap', shapes.slice(quarter * 2 - 2, quarter * 2).every((s) => s === 0),
    shapes.join(''));
  check('open again on the second syllable', shapes.slice(quarter * 2 + 1, quarter * 3).some((s) => s > 0));
  check('and shut at the end', shapes[shapes.length - 1] === 0);
}

console.log('\nloudness maps onto all three shapes, not just open and shut');
{
  // A loud vowel setting the reference, then quieter speech under it.
  const shapes = speak([[0.24, 0.5], [0.6, 0.12]]);
  check('the loud part is wide open', shapes.slice(0, 4).includes(2), shapes.join(''));
  check('the quiet part is half open, not wide', shapes.slice(-4).includes(1), shapes.join(''));
}

console.log('\none loud burst does not mumble the rest of the sentence');
{
  // A plosive four times louder than what follows. A fixed reference would
  // leave everything after it under the open-mouth threshold for good.
  const shapes = speak([[0.12, 0.8], [0.3, 0.2], [0.3, 0.2], [0.6, 0.2]]);
  check('the quiet syllables still move the mouth', shapes.slice(-6).every((s) => s > 0),
    shapes.join(''));
}

console.log('\nthe mouth does not slam shut inside a word');
{
  // A stop consonant: one near-silent 60ms window mid-syllable.
  const shapes = speak([[0.24, 0.4], [0.06, 0.05], [0.24, 0.4]]);
  const dip = Math.round(0.24 / HOP_SECONDS);
  check('a one-window dip mid-word does not close the mouth', shapes[dip] > 0,
    `${shapes.join('')} (window ${dip})`);
}

console.log('\nlevels map to the three shapes in order');
{
  check('silence is closed', mouthIndexForLevel(0) === 0);
  check('a quiet level is half open', mouthIndexForLevel(0.25) === 1);
  check('a loud level is wide open', mouthIndexForLevel(1) === 2);
  check('nothing maps outside the three shapes',
    [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1].every((l) => [0, 1, 2].includes(mouthIndexForLevel(l))));
}

console.log('\nthe shape only moves on a window boundary');
{
  const track = new MouthTrack();
  // Many tiny updates inside one window must not produce many mouth changes.
  const shapes = [];
  for (let i = 0; i < 60; i++) shapes.push(track.push(i % 2 ? 0.5 : 0, 1 / 60));
  const changes = shapes.filter((s, i) => i > 0 && s !== shapes[i - 1]).length;
  check('a second of alternating input changes the mouth at most ~16 times',
    changes <= Math.ceil(1 / HOP_SECONDS) + 1, `${changes} changes`);
}

console.log('\nreset puts it back to a closed mouth');
{
  const track = new MouthTrack();
  for (let i = 0; i < 10; i++) track.push(0.5, HOP_SECONDS);
  check('it was open', track.index > 0);
  track.reset();
  check('reset closes it', track.index === 0);
  check('and clears the loudness reference', track.level === 0);
}

console.log('\nrobustness');
{
  const track = new MouthTrack();
  check('a zero-length step does not move anything', track.push(0.5, 0) === 0);
  check('a huge step does not throw or produce nonsense', (() => {
    try {
      const shape = track.push(0.5, 10);
      return [0, 1, 2].includes(shape);
    } catch {
      return false;
    }
  })());
}

process.exit(summary() ? 0 : 1);
