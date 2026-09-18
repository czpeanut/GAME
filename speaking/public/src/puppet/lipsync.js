// Turns what is being heard right now into a mouth shape.
//
// The first version measured the whole clip up front and looked the shape up
// by playback position. That only works if the whole clip exists before a word
// is spoken - which was true when every answer waited for one big synthesis,
// and is exactly the wait we are trying to get rid of. Audio now arrives while
// it is still being generated, so the mouth is driven live instead.
//
// MouthTrack is the part worth testing: pure maths on a sequence of loudness
// readings, no Web Audio, no canvas. The analyser is a thin shell around it.

// 60ms windows: fast enough to catch syllables (Mandarin runs about 5-7 a
// second), slow enough that the mouth never strobes - it caps the mouth at
// ~16 changes a second, past which lip movement stops reading as speech.
const HOP_SECONDS = 0.06;

// Thresholds on the normalised level. Below the first the mouth is shut, which
// is the gap between words; a mouth that never fully closes reads as
// slack-jawed. Above the second it is wide open, which should be vowels only.
const HALF_OPEN_AT = 0.14;
const WIDE_OPEN_AT = 0.42;

// Speech has near-silent holes inside words (stops like b/d/g). Closing on
// every one of them reads as a stutter, so a level rises instantly but falls
// only this far per window.
const CLOSE_RATE = 0.45;

// What counts as "loud" is a moving target: one clip is quieter than another,
// and with streaming audio there is no complete clip to take a percentile
// over. Track a peak that decays, so a loud syllable sets the reference and
// the reference gives way again over the next few seconds.
const REFERENCE_HALF_LIFE = 2.0;
// Below this the input is silence or noise, not speech. Without a floor, the
// decaying reference would eventually amplify room tone into a talking mouth.
const SILENCE_FLOOR = 0.004;

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
    this._elapsed -= windows * this.hop;

    const decay = Math.pow(0.5, (windows * this.hop) / REFERENCE_HALF_LIFE);
    this.reference = Math.max(SILENCE_FLOOR, this.reference * decay, this._loudest);

    const raw = Math.min(1, this._loudest / this.reference);
    // Fall gradually, rise at once - see CLOSE_RATE.
    const floor = this.level - CLOSE_RATE * windows;
    this.level = this._loudest <= SILENCE_FLOOR ? 0 : Math.max(raw, floor);
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

// Watches an audio element and reports the mouth shape for whatever it is
// playing. The element keeps doing the playing itself, so the volume control
// and the mobile autoplay unlock work exactly as they did.
export class MouthMeter {
  constructor(audioContext, mediaElement) {
    this.track = new MouthTrack();
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.scratch = new Uint8Array(this.analyser.fftSize);
    this.source = audioContext.createMediaElementSource(mediaElement);
    this.source.connect(this.analyser);
    this.analyser.connect(audioContext.destination);
  }

  update(dt) {
    return this.track.push(rmsOf(this.analyser, this.scratch), dt);
  }

  reset() {
    this.track.reset();
  }

  get index() {
    return this.track.index;
  }
}

export { HOP_SECONDS, HALF_OPEN_AT, WIDE_OPEN_AT, CLOSE_RATE, SILENCE_FLOOR };
