// Sprite sheet layout and the animation state machine.
//
// This module is deliberately free of any DOM or canvas reference: it is pure
// data plus a pure function, so the animation logic can be unit tested in Node
// without a browser.
//
// `row` must match the row order in tools/make-spritesheet.mjs. Replacing the
// PNG with your own art only requires keeping the same grid and row order.

import { ART_SET } from './art.js';

// Two interchangeable art sets share this one ANIMS layout (see art.js):
//   ai      - Gemini-generated frames, packed by tools/ai_spritesheet.py
//   classic - the procedural sheet drawn by tools/make-spritesheet.mjs
export const SHEETS = {
  ai: { src: './assets/ai/player.png', frameW: 48, frameH: 48 },
  classic: { src: './assets/player.png', frameW: 32, frameH: 40 },
};

export { ART_SET };
export const FRAME_W = SHEETS[ART_SET].frameW;
export const FRAME_H = SHEETS[ART_SET].frameH;

// The sprite cell is larger than the 20x34 collision box on purpose - limbs
// in motion overhang the hitbox, which is what makes the character read as a
// silhouette rather than a rectangle.
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
