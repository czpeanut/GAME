// The idle-motion clock for one character on stage.
//
// This produces normalised *channels* (-1..1 or 0..1), not pixel amounts -
// how far any given body part actually moves in response is the rig's
// business (see rig.js), because the same breath should scale a torso a lot
// and a head barely at all.
//
// Channels:
//   breathe     slow sine - the breath cycle
//   tilt        slow sine on a different period - idle head/posture drift
//   sway        slow sine on a third period - weight shifting side to side
//   talkBounce  fast, 0 unless speaking - the beat under a talking head
//   blinking    boolean, short closures at randomised intervals
//   mouthIndex  0..2 while speaking - which mouth shape to show
//
// The three idle periods are deliberately not multiples of each other. If
// they were, they would repeatedly line up and the character would visibly
// "pulse" on a fixed beat, which is the tell that something is looping.
//
// Pure timers - no canvas, no image loading - so all of this is testable in
// plain Node.
export class PortraitMotion {
  constructor({
    breathePeriod = 3.7,
    tiltPeriod = 6.2,
    swayPeriod = 5.4,
    blinkEvery = [2.5, 5.5],
    blinkDuration = 0.12,
    doubleBlinkChance = 0.25,
    mouthFps = 9,
  } = {}) {
    this.breathePeriod = breathePeriod;
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

  get breathe() {
    return Math.sin((this.t / this.breathePeriod) * Math.PI * 2);
  }

  get tilt() {
    return Math.sin((this.t / this.tiltPeriod) * Math.PI * 2 + 1.7);
  }

  get sway() {
    return Math.sin((this.t / this.swayPeriod) * Math.PI * 2 + 0.6);
  }

  // Always >= 0: a talking character settles into its stance on each beat
  // rather than floating up off its feet.
  get talkBounce() {
    if (!this.speaking) return 0;
    return Math.abs(Math.sin(this.t * 13));
  }

  get mouthIndex() {
    return this.speaking ? this._mouthIndex : 0;
  }
}
