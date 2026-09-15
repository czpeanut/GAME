// Procedural "life" for an otherwise-static layered portrait - no frame
// animation or Live2D-style mesh needed. Three cheap effects sell a
// character as present rather than a pasted-on sticker:
//
//   - idle bob: a slow vertical sine wave, like breathing/weight-shifting.
//   - blink: the eyes layer swaps to a closed variant for a short beat at
//     randomised intervals, so a character never looks like a frozen photo.
//   - talk bounce: a small scale pulse while `speaking` is true, timed to
//     read as "this is the one talking" without needing lip-synced mouth art.
//
// Pure timers - no canvas, no image loading - so the "should the eyes be
// closed right now" question is testable in plain Node. PortraitRenderer
// reads `blinking`/`bobY`/`talkScale` each frame and does the actual drawing.
export class PortraitMotion {
  constructor({
    bobAmplitude = 2.5,
    bobPeriod = 3.4,
    blinkEvery = [2.5, 5.5],
    blinkDuration = 0.12,
    talkPulseSpeed = 11,
    talkPulseAmount = 0.02,
  } = {}) {
    this.bobAmplitude = bobAmplitude;
    this.bobPeriod = bobPeriod;
    this.blinkEvery = blinkEvery;
    this.blinkDuration = blinkDuration;
    this.talkPulseSpeed = talkPulseSpeed;
    this.talkPulseAmount = talkPulseAmount;

    this.t = 0;
    this.blinkT = 0;
    this.nextBlinkAt = this._rollNextBlink();
    this.blinking = false;
  }

  _rollNextBlink() {
    const [lo, hi] = this.blinkEvery;
    return lo + Math.random() * (hi - lo);
  }

  update(dt, speaking = false) {
    this.t += dt;
    this.speaking = speaking;

    this.blinkT += dt;
    if (this.blinking) {
      if (this.blinkT >= this.blinkDuration) {
        this.blinking = false;
        this.blinkT = 0;
        this.nextBlinkAt = this._rollNextBlink();
      }
    } else if (this.blinkT >= this.nextBlinkAt) {
      this.blinking = true;
      this.blinkT = 0;
    }
  }

  get bobY() {
    return Math.sin((this.t / this.bobPeriod) * Math.PI * 2) * this.bobAmplitude;
  }

  // Slightly-off-tempo pulse so several talking characters on screen at once
  // don't all bounce in perfect unison.
  get talkScale() {
    if (!this.speaking) return 1;
    return 1 + (Math.sin(this.t * this.talkPulseSpeed) * 0.5 + 0.5) * this.talkPulseAmount;
  }
}
