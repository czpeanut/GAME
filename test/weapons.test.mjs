// Weapon system tests: melee swings resolve as instant hitbox checks against
// the world (never a projectile), ranged weapons narrow their spread the
// longer fire is held and reset the moment it's released, and equipping a
// weapon takes effect on the very next input - no respawn or reconstruction
// needed, matching the same live-read contract abilities already have.

import { LevelBuilder } from '../src/game/level.js';
import { T } from '../src/engine/tilemap.js';
import { TILE, PLAYER } from '../src/game/constants.js';
import { WEAPONS, getWeapon } from '../src/game/weapons.js';
import { stubGame, StubInput, check, summary } from './harness.mjs';
import { Player } from '../src/game/player.js';

const STEP = 1 / 60;
const GROUND_ROW = 15;

function arena() {
  const b = new LevelBuilder(40, 20);
  b.fill(0, GROUND_ROW, 39, 19, T.DIRT);
  return b.build('t').map;
}
const map = arena();

function makePlayer() {
  const game = stubGame();
  const p = new Player(5 * TILE, (GROUND_ROW - 2) * TILE + (TILE * 2 - PLAYER.h), game);
  return { p, game, input: new StubInput() };
}

function run(ctx, controller, frames) {
  for (let f = 0; f < frames; f++) {
    ctx.input.set(controller(f) ?? []);
    ctx.p.update(STEP, ctx.input, map);
  }
}

console.log('\ngetWeapon');
{
  check('returns a known weapon by id', getWeapon('knife').id === 'knife');
  check('falls back to fists for an unknown id', getWeapon('bazooka').id === 'fists');
  check('falls back to fists for undefined', getWeapon(undefined).id === 'fists');
}

console.log('\ndefault loadout');
{
  const { p } = makePlayer();
  check('starts with fists', p.weaponId === 'fists');
  check('fists are melee', p.weapon.type === 'melee');
}

console.log('\nequipWeapon');
{
  const { p } = makePlayer();
  p.equipWeapon('knife');
  check('equipping changes the weapon', p.weaponId === 'knife');
  p.attackCd = 5;
  p.aimHoldT = 3;
  p.equipWeapon('pistol');
  check('equipping resets the attack cooldown', p.attackCd === 0);
  check('equipping resets any in-progress aim', p.aimHoldT === 0);
  p.equipWeapon('pistol');
  check('re-equipping the same weapon is a harmless no-op', p.weaponId === 'pistol');
}

console.log('\nmelee: instant hitbox, not a projectile');
{
  const ctx = makePlayer();
  run(ctx, () => [], 5);
  run(ctx, (f) => (f === 0 ? ['fire'] : []), 1);
  check('a melee press resolves through meleeAttack', ctx.game.meleeHits.length === 1);
  check('a melee press never spawns a bullet', ctx.game.bullets.length === 0);

  const hit = ctx.game.meleeHits[0];
  check('the swing uses the equipped weapon\'s stats', hit.weapon.id === 'fists');
  check('the hitbox sits in front of the player on the facing side',
    ctx.p.facing > 0 ? hit.rect.x >= ctx.p.body.right - 1 : hit.rect.x + hit.rect.w <= ctx.p.body.x + 1);
}

console.log('\nmelee: multiple enemies in one swing (tested via the callback contract)');
{
  // WorldScene.meleeAttack is what actually applies damage to every
  // overlapping enemy in one call (see world-scene.js) - here we only prove
  // Player hands it a single rect once per swing, which is the contract that
  // makes "hits everyone in the box" possible in the first place.
  const ctx = makePlayer();
  ctx.p.equipWeapon('stick');
  run(ctx, () => [], 5);
  run(ctx, (f) => (f === 0 ? ['fire'] : []), 1);
  check('exactly one swing call per press', ctx.game.meleeHits.length === 1);
}

console.log('\nmelee: respects its own cooldown, not a fixed rate');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('stick'); // longer cooldown than fists
  run(ctx, () => [], 5);
  let swings = 0;
  const before = ctx.game.meleeHits.length;
  for (let f = 0; f < 10; f++) {
    ctx.input.set(['fire']); // held, not tapped
    ctx.p.update(STEP, ctx.input, map);
  }
  swings = ctx.game.meleeHits.length - before;
  // 10 frames = 1/6s; stick's cooldown (0.32s) allows at most one swing in
  // that window.
  check('holding fire does not swing faster than the weapon\'s cooldown allows',
    swings === 1, `${swings} swings in 10 frames`);
}

console.log('\nranged: aim spread narrows the longer fire is held, resets on release');
{
  const { p } = makePlayer();
  p.equipWeapon('pistol');
  const w = WEAPONS.pistol;

  check('spread starts at maximum with no hold time', p._currentSpread(w) === w.spreadMax);

  p.aimHoldT = w.aimRampTime * 0.5;
  const mid = p._currentSpread(w);
  check('spread narrows partway through the ramp',
    mid < w.spreadMax && mid > w.spreadMin, mid);

  p.aimHoldT = w.aimRampTime * 5; // well past full steadiness
  check('spread bottoms out at spreadMin, never tighter',
    Math.abs(p._currentSpread(w) - w.spreadMin) < 1e-9, p._currentSpread(w));
}

console.log('\nranged: holding fire accumulates aim time; releasing resets it');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('pistol');
  run(ctx, () => [], 5);

  run(ctx, () => ['fire'], 30); // hold for half a second
  const heldT = ctx.p.aimHoldT;
  check('aimHoldT grows while fire is held', heldT > 0.4, heldT.toFixed(2));

  run(ctx, () => [], 2); // release
  check('releasing fire resets aimHoldT to zero', ctx.p.aimHoldT === 0);
}

console.log('\nranged: shots carry the weapon\'s own damage/speed/knockback, not a fixed default');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('pistol');
  run(ctx, () => [], 5);
  run(ctx, () => ['fire'], 5); // let a shot actually fire (fireRate cooldown)
  check('at least one shot was fired', ctx.game.bullets.length > 0, ctx.game.bullets.length);

  const b = ctx.game.bullets.at(-1);
  check('bullet damage matches the pistol\'s damage stat', b.damage === WEAPONS.pistol.damage);
  check('bullet speed matches the pistol\'s bulletSpeed stat', b.speed === WEAPONS.pistol.bulletSpeed);
  check('bullet knockback matches the pistol\'s knockback stat', b.knockback === WEAPONS.pistol.knockback);
}

console.log('\nranged: an early (unsteadied) shot can land far off the aimed direction');
{
  // Fire the instant fire is pressed (aimHoldT ~= 0, so spread = spreadMax)
  // and confirm the shot's actual direction can differ meaningfully from
  // dead-ahead - proof the "unpracticed shooter" spread is actually applied
  // to the fired bullet, not just displayed.
  let sawScatter = false;
  for (let trial = 0; trial < 40 && !sawScatter; trial++) {
    const ctx = makePlayer();
    ctx.p.equipWeapon('pistol');
    run(ctx, () => [], 5);
    run(ctx, (f) => (f === 0 ? ['fire'] : []), 1);
    const b = ctx.game.bullets[0];
    if (!b) continue;
    const angle = Math.atan2(b.dy, b.dx);
    if (Math.abs(angle) > 0.05) sawScatter = true;
  }
  check('an unsteadied first shot visibly scatters from dead-ahead across repeated attempts',
    sawScatter);
}

console.log('\nranged: a fully steadied shot is close to dead-on');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('pistol');
  run(ctx, () => [], 5);
  ctx.p.aimHoldT = WEAPONS.pistol.aimRampTime * 3; // already steadied
  run(ctx, (f) => (f === 0 ? ['fire'] : []), 1);
  const b = ctx.game.bullets[0];
  check('a steadied shot fires', !!b);
  const angle = Math.atan2(b.dy, b.dx);
  check('a steadied shot lands within the tight spreadMin cone',
    Math.abs(angle) <= WEAPONS.pistol.spreadMin + 0.01, angle.toFixed(3));
}

console.log('\nweapon persists across respawn but not across a fresh Player');
{
  const { p } = makePlayer();
  p.equipWeapon('pistol');
  p.respawn(0, 0);
  check('dying and respawning does not strip the weapon', p.weaponId === 'pistol');

  const fresh = makePlayer().p;
  check('a newly constructed player starts unarmed regardless', fresh.weaponId === 'fists');
}

process.exit(summary() ? 0 : 1);
