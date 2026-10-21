// Looter (Walker) AI tests: every attack is telegraphed, only the stab
// hurts, it never outruns the player, and a hit interrupts it.

import { LevelBuilder } from '../src/game/level.js';
import { T } from '../src/engine/tilemap.js';
import { TILE, PLAYER } from '../src/game/constants.js';
import { Walker, WALKER } from '../src/game/enemy.js';
import { stubGame, check, summary } from './harness.mjs';

const STEP = 1 / 60;
const GROUND_ROW = 15;

function arena() {
  const b = new LevelBuilder(60, 20);
  b.fill(0, GROUND_ROW, 59, 19, T.DIRT);
  return b.build('t').map;
}
const map = arena();

function setup(walkerCol = 20) {
  const game = { ...stubGame(), onEnemyKilled() {} };
  const w = new Walker(walkerCol * TILE, (GROUND_ROW - 1) * TILE, game);
  // A stand-in for the player: only position and liveness are read.
  const player = { centerX: -9999, centerY: (GROUND_ROW - 0.5) * TILE, alive: true };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) w.update(STEP, player, map);
  };
  step(10); // land
  return { w, player, step };
}

const frames = (sec) => Math.ceil(sec / STEP);

console.log('\npatrolling');
{
  const { w, step } = setup();
  step(30);
  check('starts out patrolling', w.state === 'patrol');
  check('patrols well below the player\'s running speed',
    Math.abs(w.body.vx) <= WALKER.patrolSpeed + 1 && WALKER.patrolSpeed < PLAYER.runSpeed / 3,
    w.body.vx.toFixed(1));
  check('cannot hurt anyone while patrolling', w.harmRect() === null);
}

console.log('\nspotting the player: stop, then approach at a walk');
{
  const { w, player, step } = setup();
  player.centerX = w.centerX + 150;
  step(1);
  check('seeing the player triggers the alert', w.state === 'alert');
  step(10);
  check('it stands still while alerted', Math.abs(w.body.vx) < 5, w.body.vx.toFixed(1));
  check('and turns to face the player', w.facing === 1);

  step(frames(WALKER.alertTime));
  check('then approaches', w.state === 'approach');
  step(40);
  check('approaching never reaches the player\'s running speed',
    Math.abs(w.body.vx) <= WALKER.approachSpeed + 1 && WALKER.approachSpeed < PLAYER.runSpeed / 2,
    w.body.vx.toFixed(1));
  check('still harmless while approaching', w.harmRect() === null);
}

console.log('\nthe attack: a long wind-up, a short stab, then an opening');
{
  const { w, player, step } = setup();
  player.centerX = w.centerX + WALKER.stabRange - 10;
  w.facing = 1;
  w._enter('approach');
  step(1);
  check('in range, it starts winding up', w.state === 'windup');

  let windupFrames = 0;
  while (w.state === 'windup' && windupFrames < 200) {
    if (w.harmRect() !== null) break;
    step(1);
    windupFrames++;
  }
  check('the wind-up lasts long enough to react to (>= 0.4s)', windupFrames * STEP >= 0.4,
    `${(windupFrames * STEP).toFixed(2)}s`);
  check('...and is harmless the whole time', w.state === 'stab');

  check('the stab is when it hurts', w.harmRect() !== null);
  const harm = w.harmRect();
  check('the blade reaches past its body in front', harm.x + harm.w > w.rect.x + w.rect.w);

  step(frames(WALKER.stabTime) + 1);
  check('after the stab it is left recovering', w.state === 'recover');
  check('recovering is harmless - the window to hit back', w.harmRect() === null);
  check('the recovery window is generous (>= 0.5s)', WALKER.recoverTime >= 0.5);
}

console.log('\na hit interrupts it');
{
  const { w, player, step } = setup();
  player.centerX = w.centerX + 30;
  w.facing = 1;
  w._enter('windup', WALKER.windupTime);
  step(5);
  w.hurt(1, -1, 90);
  check('getting hit mid wind-up staggers it', w.state === 'stagger');
  let stabbed = false;
  for (let i = 0; i < frames(WALKER.staggerTime) - 1; i++) {
    step(1);
    if (w.harmRect()) stabbed = true;
  }
  check('no stab comes out of a stagger', !stabbed);
}

console.log('\nlosing the player');
{
  const { w, player, step } = setup();
  player.centerX = w.centerX + 150;
  step(frames(WALKER.alertTime) + 5);
  player.centerX = w.centerX + 2000; // ran away
  step(frames(WALKER.loseTime) + 5);
  check('gives up and patrols again', w.state === 'patrol');
}

process.exit(summary() ? 0 : 1);
