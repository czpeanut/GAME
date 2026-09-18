// The mouth track: measuring a clip's envelope and turning it into mouth
// shapes. Pure maths, no browser - which is the point of keeping the analysis
// out of the playback path.

import { analyseEnvelope, mouthIndexAt, mouthIndexForLevel } from '../public/src/puppet/lipsync.js';
import { check, summary, syllables } from './harness.mjs';

const RATE = 16000;

console.log('\nsilence keeps the mouth shut');
{
  const envelope = analyseEnvelope(new Float32Array(RATE), RATE);
  check('a silent clip produces no open mouth at all',
    envelope.levels.every((_, i) => mouthIndexAt(envelope, i * envelope.hop) === 0));
}

console.log('\nthe mouth follows the syllables, and closes in the gaps');
{
  // speak, pause, speak, pause - 0.3s each.
  const samples = syllables(RATE, [[0.3, 0.5], [0.3, 0], [0.3, 0.5], [0.3, 0]]);
  const envelope = analyseEnvelope(samples, RATE);

  check('the mouth is open during the first syllable', mouthIndexAt(envelope, 0.15) > 0);
  check('and shut again in the gap after it', mouthIndexAt(envelope, 0.55) === 0,
    `index ${mouthIndexAt(envelope, 0.55)}`);
  check('open again on the second syllable', mouthIndexAt(envelope, 0.75) > 0);
  check('and shut at the end', mouthIndexAt(envelope, 1.15) === 0);
}

console.log('\none loud burst does not mumble the rest of the sentence');
{
  // A plosive four times louder than everything around it. Normalising on the
  // peak would push every other syllable below the open-mouth threshold.
  const samples = syllables(RATE, [
    [0.3, 0.2], [0.12, 0.8], [0.3, 0.2], [0.3, 0.2],
  ]);
  const envelope = analyseEnvelope(samples, RATE);
  const quiet = [0.15, 0.6, 0.9].map((t) => mouthIndexAt(envelope, t));
  check('the quiet syllables still move the mouth', quiet.every((i) => i > 0),
    `indices ${quiet.join(',')}`);
}

console.log('\nthe mouth does not slam shut inside a word');
{
  // A stop consonant: a near-silent 60ms hole in the middle of a syllable.
  const samples = syllables(RATE, [[0.24, 0.5], [0.06, 0.001], [0.24, 0.5]]);
  const envelope = analyseEnvelope(samples, RATE);
  check('a brief dip mid-word does not close the mouth', mouthIndexAt(envelope, 0.27) > 0,
    `index ${mouthIndexAt(envelope, 0.27)}`);
}

console.log('\nlevels map to the three mouth shapes in order');
{
  check('silence is closed', mouthIndexForLevel(0) === 0);
  check('a quiet level is half open', mouthIndexForLevel(0.25) === 1);
  check('a loud level is wide open', mouthIndexForLevel(1) === 2);
  check('the mapping never skips or exceeds the three shapes',
    [0, 0.1, 0.2, 0.3, 0.5, 0.8, 1].every((l) => [0, 1, 2].includes(mouthIndexForLevel(l))));
}

console.log('\nout-of-range times are safe');
{
  const envelope = analyseEnvelope(syllables(RATE, [[0.3, 0.5]]), RATE);
  check('before the clip starts, the mouth is closed', mouthIndexAt(envelope, -1) === 0);
  check('past the end of the clip, the mouth is closed', mouthIndexAt(envelope, 99) === 0);
  check('with no envelope at all, the mouth is closed', mouthIndexAt(null, 0.5) === 0);
}

console.log('\nthe track is dense enough to read as speech, sparse enough not to strobe');
{
  const envelope = analyseEnvelope(syllables(RATE, [[2, 0.5]]), RATE);
  check('a 2 second clip is measured in tens of windows, not thousands',
    envelope.levels.length > 20 && envelope.levels.length < 60, `${envelope.levels.length} windows`);
  check('windows are long enough that the mouth cannot strobe',
    envelope.hop >= 0.04, `${envelope.hop}s`);
}

process.exit(summary() ? 0 : 1);
