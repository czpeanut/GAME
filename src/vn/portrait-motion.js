// The idle-motion clock for one character on stage.
//
// This produces normalised *channels* (-1..1 or 0..1), not pixel amounts -
// how far any given body part actually moves in response is the rig's
// business (see rig.js), because the same breath should scale a torso a lot
// and a head barely at all.
//
// Channels:
//   breathe     0..1, the breath cycle - 0 at rest, 1 at full inhale
//   tilt        slow sine - idle postural drift
//   sway        slow sine on a different period - a second, independent drift
//   blinking    boolean, short closures at randomised intervals
//   eyeVariant  'open' | 'half' | 'closed' - the same blink, but passing
//               through a half-lidded frame on the way down and back up,
//               for characters whose art has one
//   mouthIndex  0..2 while speaking - which mouth shape to show
//
// The idle periods are deliberately not multiples of each other. If they
// were, they would repeatedly line up and the character would visibly
// "pulse" on a fixed beat, which is the tell that something is looping.
//
// There is deliberately no "talking bounce" channel. An earlier version
// bounced the whole body at ~4Hz while a character spoke, which in a
// single-character script (where someone is always the speaker) never
// stopped - it read as the character shaking, not talking. Talking is the
// mouth's job; who is speaking is already shown by dimming everyone else.
//
// Pure timers - no canvas, no image loading - so all of this is testable in
// plain Node.
export class PortraitMotion {
  constructor({
    breathePeriod = 4.2,
    inhaleFraction = 0.32,
    exhaleFraction = 0.48,
    tiltPeriod = 7.5,
    swayPeriod = 5.6,
    blinkEvery = [2.5, 5.5],
    blinkDuration = 0.12,
    doubleBlinkChance = 0.25,
    mouthFps = 9,
  } = {}) {
    this.breathePeriod = breathePeriod;
    this.inhaleFraction = inhaleFraction;
    this.exhaleFraction = exhaleFraction;
    this.tiltPeriod = tiltPeriod;
    this.swayPeriod = swayPeriod;
    this.blinkEvery = blinkEvery;
    this.blinkDuration = blinkDuration;
    this.doubleBlinkChance = doubleBlinkChance;
    this.mouthFps = mouthFps;

    // Randomised start so two characters on screen never breathe in unison.
    this.t = Math.random() * 10;
    this.blinkT = 0;
    this.nextBlinkAt = this._rollNextBlink();
    this.blinking = false;
    this.pendingDoubleBlink = false;
    this.speaking = false;
    this._mouthIndex = 0;
    this._mouthT = 0;
  }

  _rollNextBlink() {
    const [lo, hi] = this.blinkEvery;
    return lo + Math.random() * (hi - lo);
  }

  update(dt, speaking = false) {
    this.t += dt;
    this.speaking = speaking;

    this._updateBlink(dt);
    this._updateMouth(dt, speaking);
  }

  _updateBlink(dt) {
    this.blinkT += dt;
    if (this.blinking) {
      if (this.blinkT >= this.blinkDuration) {
        this.blinking = false;
        this.blinkT = 0;
        // Real blinks often come in quick pairs; always spacing them evenly
        // is another way a loop gives itself away.
        if (this.pendingDoubleBlink) {
          this.pendingDoubleBlink = false;
          this.nextBlinkAt = this.blinkDuration * 1.5;
        } else {
          this.nextBlinkAt = this._rollNextBlink();
        }
      }
    } else if (this.blinkT >= this.nextBlinkAt) {
      this.blinking = true;
      this.blinkT = 0;
      this.pendingDoubleBlink = Math.random() < this.doubleBlinkChance;
    }
  }

  // Which eye drawing to show. A blink that cuts straight from open to shut
  // and back reads as a glitch at close range; passing through a half-lidded
  // frame at each end costs two frames and reads as an eyelid. A character
  // with no `half` art simply never sees that variant, because the renderer
  // falls back when the file is missing.
  get eyeVariant() {
    if (!this.blinking) return 'open';
    const progress = this.blinkDuration > 0 ? this.blinkT / this.blinkDuration : 1;
    return progress < 0.25 || progress > 0.75 ? 'half' : 'closed';
  }

  _updateMouth(dt, speaking) {
    if (!speaking) {
      this._mouthIndex = 0;
      this._mouthT = 0;
      return;
    }
    this._mouthT += dt;
    const frameDur = 1 / this.mouthFps;
    while (this._mouthT >= frameDur) {
      this._mouthT -= frameDur;
      // Random walk rather than a fixed cycle: a mouth flapping through
      // closed->half->open->closed on a metronome reads as a machine.
      this._mouthIndex = Math.floor(Math.random() * 3);
    }
  }

  // A real breath is not a sine: the inhale is quicker than the exhale, and
  // there is a short rest before the next one. That asymmetry is most of
  // what separates "breathing" from "oscillating" - a symmetric wave reads
  // as a machine no matter how small you make it.
  //
  // Returns 0 at rest and 1 at full inhale, so a part at rest sits at
  // exactly its drawn size rather than permanently contracted.
  get breathe() {
    const phase = (this.t / this.breathePeriod) % 1;
    const { inhaleFraction: inhale, exhaleFraction: exhale } = this;
    if (phase < inhale) {
      return 0.5 - 0.5 * Math.cos((phase / inhale) * Math.PI);
    }
    if (phase < inhale + exhale) {
      return 0.5 + 0.5 * Math.cos(((phase - inhale) / exhale) * Math.PI);
    }
    return 0; // the pause at the bottom of the breath
  }

  get tilt() {
    return Math.sin((this.t / this.tiltPeriod) * Math.PI * 2 + 1.7);
  }

  get sway() {
    return Math.sin((this.t / this.swayPeriod) * Math.PI * 2 + 0.6);
  }

  get mouthIndex() {
    return this.speaking ? this._mouthIndex : 0;
  }
}
