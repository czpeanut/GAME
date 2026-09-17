// A damped spring chasing a moving target.
//
// This is what makes a cut-out puppet read as a modern game's animated
// portrait rather than a set of sliding cardboard pieces: hair and loose
// clothing do not rotate in lockstep with the head, they lag behind it and
// then overshoot slightly before settling. That follow-through is the single
// strongest "this is alive" cue available to a rigid-parts rig, and it is
// just this one equation applied per part.
//
// Pure maths - no canvas, no DOM - so the lag/overshoot behaviour is
// testable in plain Node.
//
// Stepped at a fixed internal sub-step rather than the caller's dt: a stiff
// spring integrated with an explicit Euler step blows up once dt gets large
// (a background tab resuming, a slow frame), and a portrait exploding off
// screen because the browser stalled for 300ms is not an acceptable failure
// mode.
const SUB_STEP = 1 / 120;
const MAX_STEP = 0.25; // never integrate more than this in one update

export class Spring {
  // `stiffness` pulls toward the target, `damping` bleeds off velocity.
  // Higher stiffness = snappier catch-up; higher damping = less overshoot.
  constructor({ stiffness = 90, damping = 11, value = 0 } = {}) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.value = value;
    this.velocity = 0;
  }

  step(target, dt) {
    let remaining = Math.min(dt, MAX_STEP);
    while (remaining > 0) {
      const h = Math.min(SUB_STEP, remaining);
      const accel = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += accel * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }

  // Jumps to the target with no motion - used when a character first
  // appears, so it does not visibly swing into place from zero.
  reset(value = 0) {
    this.value = value;
    this.velocity = 0;
  }
}
