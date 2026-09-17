import { Spring } from './spring.js';

// A cut-out puppet: the character's artwork split into separate parts, each
// with its own pivot, parent, and reaction to the idle-motion channels.
//
// This is the "rigid parts" tier of animated portraits - the same technique
// cut-out animation has always used, and enough for breathing, head tilt,
// hair follow-through, blinking and mouth flaps. It is NOT mesh deformation
// (Live2D/Spine): parts stay rigid rectangles, so they can be moved, turned
// and stretched but never bent or squashed organically. Keeping the motion
// amplitudes small is what keeps that limitation invisible.
//
// Every part's image is the SAME full canvas size with everything outside
// that part transparent (see tools/split-parts.py) - so parts are already
// aligned with each other by construction, and a part's pivot is the only
// per-part geometry to get right.
//
// Pure maths - no canvas, no image loading. PortraitRenderer reads the
// computed transforms and does the drawing.

// Base amounts at weight 1. Translations are fractions of the portrait's
// height so the rig stays resolution-independent; the renderer multiplies
// them back up. Deliberately small: on rigid parts, big amplitudes are
// exactly when the seams between pieces start to show.
const BREATHE_SCALE = 0.022; // vertical scale delta
const TILT_RAD = 0.026; // ~1.5 degrees
const SWAY_FRAC = 0.008;
const NOD_FRAC = 0.005;
const BOUNCE_FRAC = 0.006;

export class Rig {
  // `parts` is the draw order, back to front. Each entry:
  //   name     asset slot name -> assets/characters/<id>/<name>/<variant>.png
  //   parent   name of the part this one hangs off (transforms compose)
  //   pivot    [x, y] as fractions of the portrait box, x from the left and
  //            y from the TOP - the joint this part rotates around
  //   breathe/tilt/sway/nod/bounce   0..1 weights on each motion channel
  //   spring   { stiffness, damping, amount } - lag behind the parent's
  //            rotation instead of following it rigidly (hair, loose sleeves)
  //   blink    true: variant is driven by the blink timer (open/closed)
  //   talk     true: variant is driven by the mouth timer while speaking
  constructor(parts = []) {
    this.parts = parts.map((p) => ({
      name: p.name,
      parent: p.parent ?? null,
      pivot: p.pivot ?? [0.5, 1],
      breathe: p.breathe ?? 0,
      tilt: p.tilt ?? 0,
      sway: p.sway ?? 0,
      nod: p.nod ?? 0,
      bounce: p.bounce ?? 0,
      blink: p.blink ?? false,
      talk: p.talk ?? false,
      springConfig: p.spring ?? null,
      spring: p.spring ? new Spring(p.spring) : null,
      transform: { x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1 },
      worldAngle: 0,
    }));

    this.byName = new Map(this.parts.map((p) => [p.name, p]));
    // Transforms and springs must resolve parents first, which is a
    // different order from drawing: hair drawn *behind* the head is still
    // parented *to* it.
    this.updateOrder = [...this.parts].sort((a, b) => this._depth(a) - this._depth(b));
  }

  _depth(part) {
    let depth = 0;
    let current = part;
    const seen = new Set();
    while (current?.parent && !seen.has(current.name)) {
      seen.add(current.name);
      current = this.byName.get(current.parent);
      if (!current) break;
      depth++;
    }
    return depth;
  }

  // `motion` is a PortraitMotion: normalised channels, not pixel amounts.
  update(dt, motion) {
    for (const part of this.updateOrder) {
      const t = part.transform;

      t.x = motion.sway * part.sway * SWAY_FRAC;
      t.y = -motion.breathe * part.nod * NOD_FRAC + motion.talkBounce * part.bounce * BOUNCE_FRAC;
      t.scaleX = 1;
      t.scaleY = 1 + motion.breathe * part.breathe * BREATHE_SCALE;
      t.angle = motion.tilt * part.tilt * TILT_RAD;

      const parentAngle = part.parent ? (this.byName.get(part.parent)?.worldAngle ?? 0) : 0;

      if (part.spring) {
        // The spring chases the parent's world angle. Subtracting the
        // parent's angle back out turns "where the spring currently is"
        // into this part's LOCAL rotation, so the part's world angle ends
        // up being the spring value itself - lagging on the way out,
        // overshooting on the way back.
        const springAngle = part.spring.step(parentAngle, dt);
        t.angle += (springAngle - parentAngle) * (part.springConfig.amount ?? 1);
      }

      part.worldAngle = parentAngle + t.angle;
    }
  }

  // Called when a character comes on stage, so springs start settled at
  // their target instead of visibly swinging in from zero.
  settle() {
    for (const part of this.parts) part.spring?.reset(0);
  }

  chainTo(name) {
    const chain = [];
    let current = this.byName.get(name);
    const seen = new Set();
    while (current && !seen.has(current.name)) {
      seen.add(current.name);
      chain.unshift(current);
      current = current.parent ? this.byName.get(current.parent) : null;
    }
    return chain;
  }
}
