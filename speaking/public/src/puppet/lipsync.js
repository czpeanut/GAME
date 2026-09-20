// Turns what is being heard right now into a mouth shape.
//
// The first version measured the whole clip up front and looked the shape up
// by playback position. That only works if the whole clip exists before a word
// is spoken - which was true when every answer waited for one big synthesis,
// and is exactly the wait we are trying to get rid of. Audio now arrives while
// it is still being generated, so the mouth is driven live instead.
//
// Following it live is not what loses the sync - the analyser is reading the
// audio as it goes to the speaker, so it cannot be out of step by more than a
// window. What loses it is how fast the mouth is allowed to CLOSE. Speech is
// mostly gaps: shut the mouth too slowly and it hangs open across a whole
// phrase, which is the one thing that reads as "not matching the voice" however
// well the opening lines up.
//
// MouthTrack is the part worth testing: pure maths on a sequence of loudness
// readings, no Web Audio, no canvas. The analyser is a thin shell around it.

// 20ms windows. The mouth has to be able to shut inside the gap between two
// syllables - Mandarin runs 5-6 a second, so that gap is about 70ms - or it
// hangs open across a whole phrase and reads as flapping rather than speaking.
// 60ms windows could not: recognising the gap took one of them and closing took
// two more. Measured against a known envelope, the mouth shut in 1 of 6
// syllable gaps and was open 171% of the time the voice was audible; it is now
// 6 of 6 and 117%.
const HOP_SECONDS = 0.02;

// Thresholds on the normalised level. Below the first the mouth is shut, which
// is the gap between words; a mouth that never fully closes reads as
// slack-jawed. Above the second it is wide open, which should be vowels only -
// at 0.42 four syllables in five came out wide open, which is a mouth with no
// articulation in it.
const HALF_OPEN_AT = 0.14;
const WIDE_OPEN_AT = 0.55;

// How long the mouth takes to go from wide open to shut with nothing to hear.
// This one number is what decides whether she articulates: recognising the
// quiet costs one window, so this plus HOP_SECONDS has to fit inside the ~70ms
// gap between two syllables or the mouth never closes inside a phrase. A short
// dip - a stop consonant, the 30ms of near-silence inside a b/d/g - then only
// takes it part of the way down, which is what a real mouth does. Both fall out
// of the same ramp, with no special case for either.
const CLOSE_SECONDS = 0.04;

// What counts as "loud" is a moving target: one clip is quieter than another,
// and with streaming audio there is no complete clip to take a percentile
// over. Track a peak that decays, so a loud syllable sets the reference and
// the reference gives way again over the next few seconds.
const REFERENCE_HALF_LIFE = 2.0;
// Below this the input is silence or noise, not speech. Without a floor, the
// decaying reference would eventually amplify room tone into a talking mouth.
// It stays low deliberately: the analyser taps the audio element, so the volume
// slider scales everything it sees, and an absolute threshold high enough to
// reject room tone would also stop the mouth moving at a low volume.
const SILENCE_FLOOR = 0.004;
// The gap between syllables, on the other hand, can only be found relative to
// the speech around it - the gaps in a loud clip are louder than all of a quiet
// one. This far under the reference is a gap.
const SILENCE_RATIO = 0.06;

export class MouthTrack {
  constructor({ hop = HOP_SECONDS } = {}) {
    this.hop = hop;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.level = 0;
    this.reference = SILENCE_FLOOR;
    this._elapsed = 0;
    this._loudest = 0;
  }

  // `rms` is the loudness of the audio right now (0..1), `dt` seconds since
  // the last call. Call it as often as you like - the shape only moves on the
  // window boundary.
  push(rms, dt) {
    this._loudest = Math.max(this._loudest, rms);
    this._elapsed += dt;
    if (this._elapsed < this.hop) return this.index;

    const windows = Math.floor(this._elapsed / this.hop);
    const span = windows * this.hop;
    this._elapsed -= span;

    // The reference is what came BEFORE this window. Folding this window's own
    // peak in first - as the first version did - makes every rising window
    // normalise to exactly 1 and throws the loudness away, which is why the
    // mouth used to be wide open on every syllable however loud it really was.
    const decay = Math.pow(0.5, span / REFERENCE_HALF_LIFE);
    this.reference = Math.max(SILENCE_FLOOR, this.reference * decay);

    const quiet = this._loudest <= SILENCE_FLOOR
      || this._loudest <= this.reference * SILENCE_RATIO;
    const raw = quiet ? 0 : Math.min(1, this._loudest / this.reference);
    this.reference = Math.max(this.reference, this._loudest);

    // Rise at once, fall no faster than CLOSE_SECONDS - see the constant.
    this.level = Math.max(raw, this.level - span / CLOSE_SECONDS, 0);
    this.index = mouthIndexForLevel(this.level);
    this._loudest = 0;
    return this.index;
  }
}

// 0 closed, 1 half, 2 open - the variant order the portrait renderer expects.
export function mouthIndexForLevel(level) {
  if (level >= WIDE_OPEN_AT) return 2;
  if (level >= HALF_OPEN_AT) return 1;
  return 0;
}

// Root-mean-square of one analyser frame, as 0..1.
export function rmsOf(analyser, scratch) {
  analyser.getByteTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const sample = (scratch[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / scratch.length);
}

// A browser reports the output latency of its audio graph, and it can be big:
// a few tens of milliseconds out of a laptop speaker, but 150-200ms out of
// Bluetooth headphones, which is well past the point where a mouth and a voice
// stop looking like the same event. Never trust it past this, though - a wrong
// answer here would be worse than none.
const MAX_OUTPUT_DELAY = 0.25;

// Holds each mouth shape back by a fixed delay.
//
// The analyser taps the audio on its way TO the speaker, so the shape it
// produces is not late - it is EARLY, by however long the graph takes to reach
// the ear. Nothing in the maths can fix that; the mouth simply has to wait.
export class ShapeDelay {
  constructor(seconds = 0) {
    this.seconds = seconds;
    this.reset();
  }

  reset() {
    this.pending = [];
    this.index = 0;
    this._t = 0;
  }

  // `index` is the shape for the audio being queued right now.
  push(index, dt) {
    this._t += dt;
    if (!(this.seconds > 0)) {
      this.pending.length = 0;
      this.index = index;
      return index;
    }
    // Only changes need queueing, so this holds one entry per mouth movement
    // (about a dozen a second) rather than one per frame.
    const last = this.pending[this.pending.length - 1];
    if ((last ? last.index : this.index) !== index) this.pending.push({ at: this._t, index });
    const due = this._t - this.seconds;
    while (this.pending.length && this.pending[0].at <= due) this.index = this.pending.shift().index;
    return this.index;
  }
}

// What the browser says it takes for a sample to get from the graph to the ear.
// Safari and Firefox do not implement outputLatency, in which case there is
// nothing to correct for and the mouth is left alone.
export function outputDelayOf(audioContext) {
  const reported = audioContext?.outputLatency ?? audioContext?.baseLatency ?? 0;
  if (!Number.isFinite(reported) || reported <= 0) return 0;
  return Math.min(reported, MAX_OUTPUT_DELAY);
}

// Watches an audio element and reports the mouth shape for whatever it is
// playing. The element keeps doing the playing itself, so the volume control
// and the mobile autoplay unlock work exactly as they did.
export class MouthMeter {
  constructor(audioContext, mediaElement, { delay = null } = {}) {
    this.context = audioContext;
    this.fixedDelay = delay;
    this.track = new MouthTrack();
    this.delay = new ShapeDelay(delay ?? outputDelayOf(audioContext));
    this.analyser = audioContext.createAnalyser();
    // 512 samples is about 11ms at the usual 48kHz, so a 20ms window is two
    // reads of fresh audio rather than one read smeared across the boundary.
    this.analyser.fftSize = 512;
    this.scratch = new Uint8Array(this.analyser.fftSize);
    this.source = audioContext.createMediaElementSource(mediaElement);
    this.source.connect(this.analyser);
    this.analyser.connect(audioContext.destination);
  }

  update(dt) {
    // Re-read the latency rather than caching it: plugging in headphones
    // changes it, and it costs one property read a frame.
    if (this.fixedDelay === null) this.delay.seconds = outputDelayOf(this.context);
    return this.delay.push(this.track.push(rmsOf(this.analyser, this.scratch), dt), dt);
  }

  reset() {
    this.track.reset();
    this.delay.reset();
  }

  get index() {
    return this.delay.index;
  }
}

export {
  HOP_SECONDS, HALF_OPEN_AT, WIDE_OPEN_AT, CLOSE_SECONDS, SILENCE_FLOOR, SILENCE_RATIO,
  MAX_OUTPUT_DELAY,
};
