// Turns a decoded audio clip into a mouth-shape track.
//
// The game this puppet came from has no real voice, so it flapped the mouth
// at random. Here there IS a voice - Gemini TTS hands back the whole clip
// before a word is spoken - so the mouth can be driven by what is actually
// being said. The whole envelope is measured up front and indexed by
// playback time, rather than analysed live: it needs no AudioContext graph
// in the playback path (so the volume control and the mobile autoplay
// unlock keep working exactly as they did), it costs nothing per frame, and
// it is a pure function of the audio, which makes it testable off-browser.
//
// Pure maths - no Web Audio, no canvas. `analyseEnvelope` takes a plain
// Float32Array of samples, which is what AudioBuffer.getChannelData returns.

// 60ms windows: fast enough to catch syllables (Mandarin runs about 5-7 a
// second), slow enough that the mouth never strobes. It also caps the mouth
// at ~16 changes a second, which is roughly where lip movement stops reading
// as speech and starts reading as a glitch.
const HOP_SECONDS = 0.06;

// Thresholds on the normalised level. Below the first, the mouth is closed -
// this is the gap between words, and a mouth that never fully closes reads as
// slack-jawed. Above the second it is wide open, which should be vowels only.
const HALF_OPEN_AT = 0.14;
const WIDE_OPEN_AT = 0.42;

// Normalising against the absolute peak lets one plosive flatten everything
// else, so use a high percentile instead: a few clipped windows are better
// than a whole sentence mumbled.
const NORMALISE_PERCENTILE = 0.95;

// How fast the mouth may close. Speech has short dips inside words (stops
// like b/d/g are near-silent) and closing on every one of them reads as a
// stutter, so a level can rise instantly but only fall part of the way each
// window.
const CLOSE_RATE = 0.45;

export function analyseEnvelope(samples, sampleRate, { hop = HOP_SECONDS } = {}) {
  const hopSamples = Math.max(1, Math.round(hop * sampleRate));
  const count = Math.max(1, Math.ceil(samples.length / hopSamples));
  const levels = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const start = i * hopSamples;
    const end = Math.min(start + hopSamples, samples.length);
    let sum = 0;
    for (let s = start; s < end; s++) sum += samples[s] * samples[s];
    levels[i] = end > start ? Math.sqrt(sum / (end - start)) : 0;
  }

  const reference = percentile(levels, NORMALISE_PERCENTILE);
  if (reference > 0) {
    for (let i = 0; i < count; i++) levels[i] = Math.min(1, levels[i] / reference);
  }

  // Smooth downwards only, so the mouth follows the attack of a syllable but
  // does not slam shut inside a word.
  for (let i = 1; i < count; i++) {
    const floor = levels[i - 1] - CLOSE_RATE;
    if (levels[i] < floor) levels[i] = floor;
  }

  return { hop, levels };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

// 0 closed, 1 half, 2 open - the variant order the portrait renderer expects.
export function mouthIndexForLevel(level) {
  if (level >= WIDE_OPEN_AT) return 2;
  if (level >= HALF_OPEN_AT) return 1;
  return 0;
}

// The mouth shape at a given playback position. Past the end of the clip the
// mouth is closed, which is what should happen when playback finishes.
export function mouthIndexAt(envelope, seconds) {
  if (!envelope || seconds < 0) return 0;
  const index = Math.floor(seconds / envelope.hop);
  if (index < 0 || index >= envelope.levels.length) return 0;
  return mouthIndexForLevel(envelope.levels[index]);
}

export { HOP_SECONDS, HALF_OPEN_AT, WIDE_OPEN_AT };
