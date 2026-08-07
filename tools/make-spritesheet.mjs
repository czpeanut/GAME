#!/usr/bin/env node
// Generates assets/player.png - the placeholder sprite sheet.
//
// The art is drawn parametrically so every frame stays consistent: one
// `drawCharacter` function takes a pose (bob, lean, leg positions, cloak flare)
// and each animation frame is just a different pose. Replace the generated PNG
// with your own art and the game will use it as long as the grid still matches
// FRAME_W x FRAME_H and the row order in src/game/player-anims.js.
//
//   node tools/make-spritesheet.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Pixels } from './png.mjs';

const FRAME_W = 32;
const FRAME_H = 40;

// Row order must match ANIMS in src/game/player-anims.js.
const ROWS = [
  { name: 'idle', frames: 4 },
  { name: 'run', frames: 6 },
  { name: 'jump', frames: 2 },
  { name: 'fall', frames: 2 },
  { name: 'dash', frames: 2 },
  { name: 'wall', frames: 2 },
  { name: 'hurt', frames: 2 },
];

const COLS = Math.max(...ROWS.map((r) => r.frames));

// The cloak is deliberately light. The background of this game is dark navy,
// and a dark cloak makes the character disappear into it - only the mask reads.
// In a platformer the player must never be hard to find, so contrast against
// the backdrop wins over a moodier palette.
const C = {
  cloakDark: [92, 112, 158, 255],
  cloakMid: [150, 170, 214, 255],
  cloakEdge: [214, 231, 255, 255],
  mask: [242, 248, 255, 255],
  maskShade: [186, 205, 238, 255],
  eye: [11, 16, 32, 255],
  glow: [127, 212, 255, 255],
  white: [255, 255, 255, 255],
};

// Draws the character into a frame cell. `o` is the pose.
function drawCharacter(px, ox, oy, o = {}) {
  const {
    bob = 0,
    lean = 0,
    flare = 0,
    legL = 0,
    legR = 0,
    squashY = 0,
    flash = false,
    facing = 1,
  } = o;

  const body = flash ? C.white : C.cloakMid;
  const bodyDark = flash ? C.white : C.cloakDark;
  const bodyEdge = flash ? C.white : C.cloakEdge;
  const maskCol = flash ? C.white : C.mask;

  const cx = ox + FRAME_W / 2 + lean;
  const feet = oy + FRAME_H - 1;
  const cloakTop = oy + 17 + bob + squashY;
  const cloakBot = feet - 2;

  // Legs first so the cloak overlaps them.
  px.rect(cx - 5, feet - 5 + legL, 3, 5 - legL, bodyDark);
  px.rect(cx + 2, feet - 5 + legR, 3, 5 - legR, bodyDark);

  // Cloak: a trapezoid that flares wider at the hem, with a darker underside
  // and a lit rim on the leading edge.
  px.trapezoid(cx, cloakTop, 13, cloakBot, 17 + flare, body);
  px.trapezoid(cx, cloakBot - 4, 15 + flare, cloakBot, 17 + flare, bodyDark);
  // Rim light down the facing side.
  for (let y = cloakTop; y <= cloakBot; y++) {
    const t = (y - cloakTop) / Math.max(1, cloakBot - cloakTop);
    const w = 13 + (17 + flare - 13) * t;
    px.set(cx + (facing > 0 ? w / 2 - 1 : -w / 2), y, bodyEdge);
  }

  // Shoulders.
  px.ellipse(cx, cloakTop + 1, 7, 4, body);

  // Mask.
  const headY = oy + 11 + bob + squashY;
  px.ellipse(cx, headY, 7, 6, maskCol);
  px.ellipse(cx, headY + 3, 6, 3, flash ? C.white : C.maskShade);

  // Horns sweeping up and outward. Kept short enough that even the highest
  // pose (jump) leaves a pixel of headroom inside the frame.
  px.triangle(
    [cx - 6, headY - 2], [cx - 1, headY - 4], [cx - 9, headY - 8],
    maskCol
  );
  px.triangle(
    [cx + 6, headY - 2], [cx + 1, headY - 4], [cx + 9, headY - 8],
    maskCol
  );

  // Eyes, biased toward the facing direction.
  if (!flash) {
    const ex = cx + facing * 1;
    px.ellipse(ex - 3, headY, 1.6, 2.3, C.eye);
    px.ellipse(ex + 3, headY, 1.6, 2.3, C.eye);
  }
}

// Motion streaks behind a dashing character.
function drawStreaks(px, ox, oy, facing) {
  for (let i = 0; i < 5; i++) {
    const y = oy + 14 + i * 4;
    const len = 6 + ((i * 5) % 9);
    const x = facing > 0 ? ox + 2 : ox + FRAME_W - 2 - len;
    px.rect(x, y, len, 1, [127, 212, 255, 150 - i * 18]);
  }
}

function poseFor(anim, i) {
  switch (anim) {
    case 'idle':
      // A slow two-up two-down breathing bob.
      return { bob: [0, 1, 1, 0][i], flare: [0, 0, 1, 1][i] };

    case 'run': {
      // Six-frame cycle: legs opposed, body leaning into the run, cloak
      // trailing behind.
      const legL = [0, 2, 3, 1, 0, 0][i];
      const legR = [2, 1, 0, 0, 1, 3][i];
      return { bob: [0, 1, 0, 0, 1, 0][i], lean: 1, flare: 3, legL, legR };
    }

    case 'jump':
      // Stretched upward, legs tucked, cloak pulled down. The rise is kept to
      // one pixel so the horns stay inside the frame.
      return { bob: -1, squashY: -1, flare: -2 - i, legL: 3, legR: 2 + i };

    case 'fall':
      // Cloak billows up, legs reach down.
      return { bob: 1, flare: 4 + i, legL: 0, legR: 1 };

    case 'dash':
      return { lean: 2 + i, flare: 5, squashY: 1, legL: 3, legR: 3 };

    case 'wall':
      // Pressed against a wall, cloak hanging on one side.
      return { lean: -2, flare: 1 + i, legL: 1, legR: 2 };

    case 'hurt':
      return { flash: i === 0, bob: 1, flare: 2, lean: -1, legL: 1, legR: 1 };

    default:
      return {};
  }
}

const sheet = new Pixels(COLS * FRAME_W, ROWS.length * FRAME_H);

ROWS.forEach((row, r) => {
  for (let i = 0; i < row.frames; i++) {
    // Each frame is drawn into its own cell-sized buffer, then blitted. A pose
    // that overshoots the cell is clipped at the cell edge rather than spilling
    // into the neighbouring animation row.
    const cell = new Pixels(FRAME_W, FRAME_H);
    if (row.name === 'dash') drawStreaks(cell, 0, 0, 1);
    drawCharacter(cell, 0, 0, { ...poseFor(row.name, i), facing: 1 });
    sheet.blit(cell, i * FRAME_W, r * FRAME_H);
  }
});

const out = resolve(import.meta.dirname, '..', 'assets', 'player.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sheet.toPNG());

console.log(`wrote ${out}`);
console.log(`  grid   ${COLS} x ${ROWS.length} frames of ${FRAME_W}x${FRAME_H}`);
console.log(`  size   ${sheet.width}x${sheet.height}px`);
ROWS.forEach((r, i) => console.log(`  row ${i}  ${r.name} (${r.frames} frames)`));
