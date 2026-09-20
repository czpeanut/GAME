// The mouth track: turning live loudness readings into mouth shapes. Pure
// maths, no Web Audio - which is the point of keeping MouthTrack separate from
// the analyser that feeds it.

import {
  MouthTrack, ShapeDelay, mouthIndexForLevel, outputDelayOf,
  HOP_SECONDS, MAX_OUTPUT_DELAY,
} from '../public/src/puppet/lipsync.js';
import { check, summary } from './harness.mjs';

// Feed a track a pattern of [seconds, loudness] and return the shape it showed
// at each window.
function speak(pattern, { hop = HOP_SECONDS } = {}) {
  const track = new MouthTrack({ hop });
  const shapes = [];
  for (const [seconds, loudness] of pattern) {
    for (let t = 0; t < seconds - 1e-9; t += hop) shapes.push(track.push(loudness, hop));
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
  // A stop consonant: one 30ms window of near-silence mid-syllable. It should
  // take the mouth down but not shut it - that is how a b/d/g reads.
  const shapes = speak([[0.24, 0.4], [0.03, 0.005], [0.24, 0.4]]);
  const dip = Math.round(0.24 / HOP_SECONDS);
  check('a one-window dip mid-word does not close the mouth', shapes[dip] > 0,
    `${shapes.join('')} (window ${dip})`);
  check('but it is no longer wide open either', shapes[dip] < 2, shapes.join(''));
}

console.log('\nbut a real gap between syllables does close it');
{
  // 70ms of near-silence, which is the gap between two syllables at the rate
  // Mandarin is actually spoken. The mouth hanging open across these is what
  // made it look like flapping rather than speaking.
  const shapes = speak([[0.12, 0.4], [0.07, 0.005], [0.12, 0.4]]);
  const gapEnd = Math.round(0.19 / HOP_SECONDS);
  check('the mouth is shut by the end of a 70ms gap', shapes[gapEnd - 1] === 0, shapes.join(''));
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
  // Many updates inside one window must not each move the mouth. This is the
  // only bound the maths can promise on its own: how fast the mouth moves in
  // practice depends on the audio, and is measured on a real clause below and
  // on real audio in the browser test.
  const track = new MouthTrack();
  const shapes = [];
  const steps = 240;
  for (let i = 0; i < steps; i++) shapes.push(track.push(0.5, 1 / 240));
  const changes = shapes.filter((s, i) => i > 0 && s !== shapes[i - 1]).length;
  check('a second of 240 updates moves the mouth at most once per window',
    changes <= Math.ceil(1 / HOP_SECONDS), `${changes} changes`);
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

// ---------------------------------------------------------------------------
// The measurement that actually says whether she articulates. A clause with a
// known envelope, and the mouth checked against it: Mandarin runs 5-6
// syllables a second, each about 110ms of voicing and then a 70ms gap.
// Whatever else changes in here, these numbers must not slide back.

function clauseEnvelope() {
  const segs = [[0.09, 0.0015]]; // the lead-in of a clip
  [0.34, 0.5, 0.22, 0.45, 0.18, 0.4].forEach((amp, i) => {
    if (i === 3) segs.push([0.05, amp], [0.05, amp * 0.03], [0.06, amp]); // with a stop inside
    else segs.push([0.11, amp]);
    segs.push([0.07, 0.008]);
  });
  segs.push([0.3, 0.0015]);
  return segs;
}

// Run the envelope at the frame rate the puppet loop uses, and compare the
// mouth against what a listener would actually hear: 26 dB under the peak.
function follow(segs, { fps = 60, delay = 0 } = {}) {
  const dt = 1 / fps;
  const rms = [];
  for (const [seconds, level] of segs) for (let t = 0; t < seconds - 1e-9; t += dt) rms.push(level);
  const audibleAt = Math.max(...rms) / 20;
  const track = new MouthTrack();
  const held = new ShapeDelay(delay);
  const shapes = rms.map((v) => held.push(track.push(v, dt), dt));

  const audible = rms.map((v) => v >= audibleAt);
  const open = shapes.map((s) => s > 0);
  let gaps = 0;
  let shutGaps = 0;
  let inGap = false;
  let shutHere = false;
  audible.forEach((on, i) => {
    if (!on && i > audible.indexOf(true) && i < audible.lastIndexOf(true)) {
      if (!inGap) { inGap = true; shutHere = false; gaps++; }
      if (!open[i]) shutHere = true;
    } else if (inGap) {
      inGap = false;
      if (shutHere) shutGaps++;
    }
  });
  const last = audible.lastIndexOf(true);
  let tail = last + 1;
  while (tail < open.length && open[tail]) tail++;
  return {
    shapes,
    gaps,
    shutGaps,
    openRatio: open.filter(Boolean).length / audible.filter(Boolean).length,
    tailMs: (tail - last - 1) * dt * 1000,
    gapeMs: open.slice(0, audible.indexOf(true)).filter(Boolean).length * dt * 1000,
    changesPerSecond: shapes.filter((s, i) => i > 0 && s !== shapes[i - 1]).length / (rms.length * dt),
  };
}

console.log('\na whole clause, measured against its own envelope');
{
  const r = follow(clauseEnvelope());
  // 2 of the 7 gaps are the two halves of the stop consonant, which the mouth
  // is supposed to ride through.
  check('the mouth shuts in at least 5 of the syllable gaps', r.shutGaps >= 5,
    `${r.shutGaps}/${r.gaps} gaps, shapes ${r.shapes.join('')}`);
  check('it is not simply hanging open through the clause', r.openRatio < 1.45,
    `open ${(r.openRatio * 100).toFixed(0)}% of the audible time`);
  check('it is shut within 70ms of the last sound', r.tailMs <= 70, `${r.tailMs}ms`);
  check('it does not open before the first sound', r.gapeMs === 0, `${r.gapeMs}ms`);
  check('and it keeps up with the syllables without strobing',
    r.changesPerSecond >= 8 && r.changesPerSecond <= 20, `${r.changesPerSecond.toFixed(1)}/s`);
  check('all three shapes get used', new Set(r.shapes).size === 3, [...new Set(r.shapes)].join(''));
}

console.log('\na quiet clip - or the volume slider turned down - works the same');
{
  // Everything 20x quieter. The thresholds have to be relative, or the mouth
  // stops moving whenever the audio is soft.
  const quiet = clauseEnvelope().map(([seconds, level]) => [seconds, level / 20]);
  const r = follow(quiet);
  check('it still articulates', r.shutGaps >= 5, `${r.shutGaps}/${r.gaps}`);
  check('and still uses all three shapes', new Set(r.shapes).size === 3, r.shapes.join(''));
}

console.log('\nit survives a frame rate that is not 60');
{
  for (const fps of [30, 45, 90]) {
    const r = follow(clauseEnvelope(), { fps });
    check(`at ${fps}fps the mouth still shuts in the gaps`, r.shutGaps >= 4,
      `${r.shutGaps}/${r.gaps}, ${r.changesPerSecond.toFixed(1)} changes/s`);
  }
}

console.log('\nShapeDelay holds the mouth back to match what is heard');
{
  const delay = new ShapeDelay(0.1);
  const seen = [];
  for (let i = 0; i < 12; i++) seen.push(delay.push(i < 3 ? 2 : 0, 1 / 60));
  check('the first shape is held back by the delay', seen.slice(0, 5).every((s) => s === 0),
    seen.join(''));
  check('and then arrives', seen.slice(6).includes(2), seen.join(''));
  check('nothing is lost - it arrives in order', seen.join('').includes('222'), seen.join(''));
}
{
  const none = new ShapeDelay(0);
  check('a zero delay passes shapes straight through',
    [2, 1, 0, 2].every((s) => none.push(s, 1 / 60) === s));
  const delay = new ShapeDelay(0.1);
  // A shape is stamped with the moment its audio was queued, so a long step
  // does not let it arrive early - it still waits out the delay from there.
  delay.push(2, 0.2);
  check('a long step does not let a shape jump the delay', delay.index === 0);
  check('it arrives once the delay has passed', delay.push(2, 0.1) === 2);
  delay.reset();
  check('reset closes the mouth', delay.index === 0);
  check('and empties the queue', delay.pending.length === 0);
}

console.log('\nthe reported output latency is used, but never blindly');
{
  check('a context that reports nothing is left alone', outputDelayOf({}) === 0);
  check('no context at all does not throw', outputDelayOf(null) === 0);
  check('outputLatency is used', outputDelayOf({ outputLatency: 0.12 }) === 0.12);
  check('baseLatency is the fallback', outputDelayOf({ baseLatency: 0.02 }) === 0.02);
  check('a nonsense value is ignored', outputDelayOf({ outputLatency: NaN }) === 0);
  check('a negative value is ignored', outputDelayOf({ outputLatency: -1 }) === 0);
  check('an absurd value is clamped', outputDelayOf({ outputLatency: 5 }) === MAX_OUTPUT_DELAY);
}

console.log('\na delay does not undo the articulation - it only shifts it');
{
  const plain = follow(clauseEnvelope());
  const held = follow(clauseEnvelope(), { delay: 0.15 });
  check('the same number of gaps are shut', held.shutGaps >= plain.shutGaps - 1,
    `${held.shutGaps} vs ${plain.shutGaps}`);
  check('and the mouth is open for about as long',
    Math.abs(held.openRatio - plain.openRatio) < 0.1,
    `${held.openRatio.toFixed(2)} vs ${plain.openRatio.toFixed(2)}`);
}

process.exit(summary() ? 0 : 1);
