// Procedural "life" for an otherwise-static single-image portrait - no frame
// animation, no Live2D-style mesh, no extra art needed. A flat illustration
// can only ever be translated/scaled/rotated as one rigid piece, so a single
// uniform "grow/shrink" pulse reads as a zoom, not breathing - the fix is to
// combine several small, independently-timed motions instead of one:
//
//   - breathe: a slow, small *vertical-only* scale (not uniform), pivoted at
//     the feet (the portrait's own anchor point - see portrait-renderer.js),
//     so the character stretches subtly upward rather than visibly growing
//     from its center or shrinking toward it. Kept to ~1.5% so it reads as
//     a chest rising, not a zoom.
//   - sway: a slow horizontal drift, like a relaxed weight shift. Runs on a
//     different period than breathing (5.4s vs 3.7s) so the two never fall
//     into a synced, obviously-mechanical rhythm.
//   - tilt: a tiny rotation around the feet, same reasoning as sway - real
//     idle posture drifts in more than one axis at once, not just up/down.
//   - blink: the eyes layer swaps to a closed variant for a short beat at
//     randomised intervals, so a character never looks like a frozen photo.
//   - talk bounce: while `speaking` is true, a quick, small vertical bounce
//     at a much faster tempo than the idle motions above - deliberately a
//     different *kind* of movement (fast bounce vs. slow drift) so a talking
//     character reads as visibly distinct from an idle one at a glance,
//     without needing lip-synced mouth art.
//
// This is a ceiling, not a full solution - genuinely convincing breathing
// (chest visibly rising while legs stay put) needs either layered art (a
// separate chest piece) or a short breathing frame sequence; a single rigid
// image can only approximate it. This is that approximation, tuned to read
// as "alive" rather than "pulsing."
//
// Pure timers - no canvas, no image loading - so "where should everything be
// right now" is testable in plain Node. PortraitRenderer reads these getters
// each frame and does the actual drawing.
export class PortraitMotion {
  constructor({
    breatheAmplitude = 0.016,
    breathePeriod = 3.7,
    swayAmplitude = 3,
    swayPeriod = 5.4,
    tiltAmplitudeDeg = 0.9,
    tiltPeriod = 6.2,
    blinkEvery = [2.5, 5.5],
    blinkDuration = 0.12,
    talkBounceSpeed = 13,
    talkBounceAmount = 3.5,
  } = {}) {
    this.breatheAmplitude = breatheAmplitude;
    this.breathePeriod = breathePeriod;
    this.swayAmplitude = swayAmplitude;
    this.swayPeriod = swayPeriod;
    this.tiltAmplitudeRad = (tiltAmplitudeDeg * Math.PI) / 180;
    this.tiltPeriod = tiltPeriod;
    this.blinkEvery = blinkEvery;
    this.blinkDuration = blinkDuration;
    this.talkBounceSpeed = talkBounceSpeed;
    this.talkBounceAmount = talkBounceAmount;

    this.t = 0;
    this.blinkT = 0;
    this.nextBlinkAt = this._rollNextBlink();
    this.blinking = false;
    this.speaking = false;
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

  get breatheScaleY() {
    return 1 + Math.sin((this.t / this.breathePeriod) * Math.PI * 2) * this.breatheAmplitude;
  }

  get swayX() {
    return Math.sin((this.t / this.swayPeriod) * Math.PI * 2) * this.swayAmplitude;
  }

  get tiltRad() {
    // Phase-offset from sway so the two don't peak at the same instant.
    return Math.sin((this.t / this.tiltPeriod) * Math.PI * 2 + 1.7) * this.tiltAmplitudeRad;
  }

  // Always >= 0: the portrait's feet anchor never lifts, only bounces down
  // and back - a talking character nodding into its stance, not floating.
  get talkBounceY() {
    if (!this.speaking) return 0;
    return Math.abs(Math.sin(this.t * this.talkBounceSpeed)) * this.talkBounceAmount;
  }
}
