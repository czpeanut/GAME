// Art-set tests: the ?art= switch, and that every generated sheet on disk
// actually matches the grid the code will slice it with. A re-run of
// tools/ai_spritesheet.py with a different config would otherwise only show
// up as garbled frames in a browser.

import { readFileSync, existsSync } from 'node:fs';
import { pickArtSet, WALKER_ANIMS } from '../src/game/art.js';
import { ANIMS, SHEETS } from '../src/game/player-anims.js';
import { WEAPONS } from '../src/game/weapons.js';
import { ATTACK_TIPS } from '../src/game/attack-tips.js';
import { PLAYER } from '../src/game/constants.js';
import { check, summary } from './harness.mjs';

// Width/height straight from the PNG's IHDR chunk - no image library needed.
function pngSize(path) {
  const buf = readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const asset = (src) => new URL('../' + src.replace(/^\.\//, ''), import.meta.url);

console.log('\npickArtSet');
{
  check('defaults to the AI art', pickArtSet('') === 'ai');
  check('?art=classic switches back', pickArtSet('?art=classic') === 'classic');
  check('an unknown value falls back to AI art', pickArtSet('?art=bogus') === 'ai');
  check('other query params are ignored', pickArtSet('?debug=1&art=classic') === 'classic');
}

function checkGrid(label, src, frameW, frameH, anims) {
  const path = asset(src);
  check(`${label}: sheet exists`, existsSync(path), src);
  if (!existsSync(path)) return;
  const { w, h } = pngSize(path);
  const rows = Math.max(...Object.values(anims).map((a) => a.row)) + 1;
  const cols = Math.max(...Object.values(anims).map((a) => a.frames));
  check(`${label}: sheet is exactly cols x rows cells`,
    w === cols * frameW && h === rows * frameH,
    `${w}x${h} vs ${cols}x${rows} of ${frameW}x${frameH}`);
}

console.log('\ngenerated sheets match their grids');
{
  checkGrid('player (ai)', SHEETS.ai.src, SHEETS.ai.frameW, SHEETS.ai.frameH, ANIMS);
  // The classic sheet has no attack rows (hasAttacks: false) - attacks there
  // fall back to the standing pose plus a drawn weapon.
  const attackRows = new Set(Object.values(WEAPONS).map((w) => w.anim).filter(Boolean));
  const baseAnims = Object.fromEntries(Object.entries(ANIMS).filter(([name]) => !attackRows.has(name)));
  check('every melee weapon has an attack row in the AI sheet',
    [...attackRows].every((name) => ANIMS[name]) && SHEETS.ai.hasAttacks);
  checkGrid('player (classic)', SHEETS.classic.src, SHEETS.classic.frameW, SHEETS.classic.frameH, baseAnims);
  checkGrid('walker', './assets/ai/walker.png', 48, 48, WALKER_ANIMS);
  checkGrid('zhou', './assets/ai/zhou.png', 48, 48, { idle: { row: 0, frames: 3 } });
}

console.log('\nattack tips (generated from the strike frames)');
{
  for (const w of Object.values(WEAPONS).filter((x) => x.anim)) {
    const tip = ATTACK_TIPS[w.anim];
    check(`${w.anim}: has a measured tip`, !!tip);
    if (!tip) continue;
    check(`${w.anim}: the tip is in front of the body`, tip.x > PLAYER.w / 2, `x=${tip.x}`);
    check(`${w.anim}: the tip is between the feet and the top of the head`,
      tip.y < 0 && tip.y > -PLAYER.h - 8, `y=${tip.y}`);
  }
}

console.log('\nbackdrop and tiles');
{
  for (const f of ['bg_sky', 'bg_far', 'bg_mid', 'tile_fill', 'tile_cap']) {
    check(`${f}.png exists`, existsSync(asset(`./assets/ai/${f}.png`)));
  }
  const sky = pngSize(asset('./assets/ai/bg_sky.png'));
  check('sky layer is exactly the view height (drawn unscaled)', sky.h === 360, `${sky.w}x${sky.h}`);
  const fill = pngSize(asset('./assets/ai/tile_fill.png'));
  check('fill texture is a whole number of tiles', fill.w % 32 === 0 && fill.h % 32 === 0, `${fill.w}x${fill.h}`);
  const cap = pngSize(asset('./assets/ai/tile_cap.png'));
  check('cap strip is a whole number of tiles wide', cap.w % 32 === 0, `${cap.w}x${cap.h}`);
}

process.exit(summary() ? 0 : 1);
