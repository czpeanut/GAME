// Animation state machine tests.
//
// The picker and the frame timer are deliberately DOM-free, so the logic that
// decides "which frame is showing" can be verified without a browser.

import { Animator } from '../src/engine/animator.js';
import { ANIMS, pickPlayerAnimation, animTimeScale, FRAME_W, FRAME_H } from '../src/game/player-anims.js';
import { PLAYER } from '../src/game/constants.js';
import { check, summary } from './harness.mjs';

const base = { dashT: 0, hurtT: 0, wallSliding: false, grounded: true, vy: 0, vx: 0 };
const st = (o) => ({ ...base, ...o });

console.log('\nanimation selection');
{
  check('standing still -> idle', pickPlayerAnimation(st({})) === 'idle');
  check('running -> run', pickPlayerAnimation(st({ vx: 200 })) === 'run');
  check('running left -> run', pickPlayerAnimation(st({ vx: -200 })) === 'run');
  check('a tiny drift still reads as idle', pickPlayerAnimation(st({ vx: 5 })) === 'idle');
  check('rising -> jump', pickPlayerAnimation(st({ grounded: false, vy: -300 })) === 'jump');
  check('falling -> fall', pickPlayerAnimation(st({ grounded: false, vy: 300 })) === 'fall');
  check('wall sliding -> wall',
    pickPlayerAnimation(st({ grounded: false, vy: 120, wallSliding: true })) === 'wall');

  // Precedence: a dash beats every other state it overlaps with.
  check('dash beats airborne',
    pickPlayerAnimation(st({ dashT: 0.1, grounded: false, vy: 200, vx: 600 })) === 'dash');
  check('dash beats wall slide',
    pickPlayerAnimation(st({ dashT: 0.1, wallSliding: true, grounded: false })) === 'dash');
  check('hurt beats running',
    pickPlayerAnimation(st({ hurtT: 0.2, vx: 240 })) === 'hurt');
  check('dash beats hurt',
    pickPlayerAnimation(st({ dashT: 0.1, hurtT: 0.2 })) === 'dash');
}

console.log('\nsheet layout');
{
  const rows = Object.values(ANIMS).map((a) => a.row);
  check('every animation has a unique row', new Set(rows).size === rows.length);
  check('rows are contiguous from 0',
    Math.min(...rows) === 0 && Math.max(...rows) === rows.length - 1);
  check('every animation has at least one frame',
    Object.values(ANIMS).every((a) => a.frames >= 1));
  check('every animation has a positive fps',
    Object.values(ANIMS).every((a) => a.fps > 0));
  check('frame size is sane', FRAME_W > 0 && FRAME_H > 0, `${FRAME_W}x${FRAME_H}`);
  // The sprite must cover the collision box or the character would look like it
  // is floating inside its own hitbox.
  check('sprite covers the collision box',
    FRAME_W >= PLAYER.w && FRAME_H >= PLAYER.h,
    `sprite ${FRAME_W}x${FRAME_H} vs body ${PLAYER.w}x${PLAYER.h}`);
}

console.log('\nframe timing');
{
  const a = new Animator(ANIMS, 'idle');
  check('starts on frame 0', a.frame === 0 && a.name === 'idle');

  // idle is 6fps / 4 frames: advance one frame at a time.
  a.update(1 / 6 + 0.001);
  check('advances after one frame duration', a.frame === 1, `frame ${a.frame}`);

  // Loop back around.
  a.update(1 / 6 * 3);
  check('loops back to the start', a.frame === 0, `frame ${a.frame}`);

  // Non-looping animations hold their final frame instead of wrapping.
  const j = new Animator(ANIMS, 'jump');
  j.update(10);
  check('non-looping animation holds its last frame',
    j.frame === ANIMS.jump.frames - 1 && j.finished, `frame ${j.frame}`);

  // Switching animations resets timing, but re-selecting the same one must not.
  const r = new Animator(ANIMS, 'run');
  r.update(1 / 14 + 0.001);
  const mid = r.frame;
  r.play('run');
  check('re-playing the current animation does not restart it', r.frame === mid,
    `frame ${r.frame}`);
  r.play('idle');
  check('switching animation resets to frame 0', r.frame === 0 && r.name === 'idle');
  r.play('run', true);
  check('restart flag forces a reset', r.frame === 0 && r.name === 'run');

  // An unknown name must be ignored rather than blanking the character.
  r.play('does-not-exist');
  check('unknown animation is ignored', r.name === 'run');
}

console.log('\nrun cycle speed');
{
  const slow = animTimeScale('run', st({ vx: 60 }), PLAYER.runSpeed);
  const fast = animTimeScale('run', st({ vx: PLAYER.runSpeed }), PLAYER.runSpeed);
  check('run cycle speeds up with movement', fast > slow, `${slow.toFixed(2)} -> ${fast.toFixed(2)}`);
  check('run cycle never stops entirely', slow > 0, `${slow.toFixed(2)}`);
  check('non-run animations are unscaled', animTimeScale('idle', st({ vx: 900 }), PLAYER.runSpeed) === 1);
}

process.exit(summary() ? 0 : 1);
