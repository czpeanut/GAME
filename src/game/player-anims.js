// Sprite sheet layout and the animation state machine.
//
// This module is deliberately free of any DOM or canvas reference: it is pure
// data plus a pure function, so the animation logic can be unit tested in Node
// without a browser.
//
// `row` must match the row order in tools/make-spritesheet.mjs. Replacing the
// PNG with your own art only requires keeping the same grid and row order.

export const FRAME_W = 32;
export const FRAME_H = 40;

// The sprite is taller and wider than the 20x34 collision box on purpose - the
// horns and cloak overhang the hitbox, which is what makes the character read
// as a silhouette rather than a rectangle.
export const ANIMS = {
  idle: { row: 0, frames: 4, fps: 6, loop: true },
  run: { row: 1, frames: 6, fps: 14, loop: true },
  jump: { row: 2, frames: 2, fps: 10, loop: false },
  fall: { row: 3, frames: 2, fps: 10, loop: false },
  dash: { row: 4, frames: 2, fps: 18, loop: true },
  wall: { row: 5, frames: 2, fps: 8, loop: true },
  hurt: { row: 6, frames: 2, fps: 12, loop: false },
};

// Chooses an animation from the player's state.
//
// Order matters: the checks run most-specific first, so a dash reads as a dash
// even though the player is also airborne and moving.
export function pickPlayerAnimation(s) {
  if (s.dashT > 0) return 'dash';
  if (s.hurtT > 0) return 'hurt';
  if (s.wallSliding) return 'wall';
  if (!s.grounded) return s.vy < 0 ? 'jump' : 'fall';
  return Math.abs(s.vx) > 20 ? 'run' : 'idle';
}

// The run cycle plays faster the faster the player moves, so footfalls stay
// visually tied to actual movement instead of sliding.
export function animTimeScale(name, s, runSpeed) {
  if (name !== 'run') return 1;
  return Math.max(0.55, Math.min(1.6, Math.abs(s.vx) / runSpeed));
}
