// Weapon system tests: melee swings resolve as instant hitbox checks against
// the world (never a projectile), firearms aim and fire on separate inputs -
// aiming narrows the fan, every shot blooms it - and equipping a
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
  p.equipWeapon('pistol');
  check('equipping resets the attack cooldown', p.attackCd === 0);
  check('equipping a gun starts it at its widest fan', p.spread === WEAPONS.pistol.spreadMax);
  p.equipWeapon('pistol');
  check('re-equipping the same weapon is a harmless no-op', p.weaponId === 'pistol');
}

const frames = (sec) => Math.ceil(sec * 60);

console.log('\nmelee: wind-up, then the strike, then recovery');
{
  const ctx = makePlayer();
  const fists = WEAPONS.fists;
  run(ctx, () => [], 5);
  run(ctx, (f) => (f === 0 ? ['fire'] : []), 1);
  check('pressing attack starts the wind-up, with no hit yet',
    ctx.p.meleePhase === 0 && ctx.game.meleeHits.length === 0);

  // The press frame starts the clock; the strike lands on the first frame
  // the clock reaches the end of the wind-up.
  run(ctx, () => [], frames(fists.windup));
  check('the strike resolves once the wind-up is over', ctx.game.meleeHits.length === 1,
    `${ctx.game.meleeHits.length} hits`);
  check('...and the strike frame is on screen while it does', ctx.p.meleePhase === 1);
  check('a melee strike never fires a shot', ctx.game.shots.length === 0);

  const hit = ctx.game.meleeHits[0];
  check('the strike uses the equipped weapon\'s stats', hit.weapon.id === 'fists');
  check('the hitbox sits in front of the player on the facing side',
    ctx.p.facing > 0 ? hit.rect.x >= ctx.p.body.right - 4 : hit.rect.x + hit.rect.w <= ctx.p.body.x + 4);

  run(ctx, () => [], frames(fists.active + fists.recover) + 1);
  check('the attack ends after its recovery', ctx.p.meleePhase === -1);
  check('one attack, one strike', ctx.game.meleeHits.length === 1);
}

console.log('\nmelee: a heavier weapon commits you longer');
{
  const { stick, fists } = WEAPONS;
  check('the stick winds up longer than a punch', stick.windup > fists.windup);
  check('...and recovers slower', stick.recover > fists.recover);
  for (const w of [WEAPONS.fists, WEAPONS.stick, WEAPONS.knife]) {
    check(`${w.id}: cooldown covers the whole attack`, w.cooldown >= w.windup + w.active + w.recover - 1e-9);
  }
}

console.log('\nmelee: planted while striking on the ground, with a step in');
{
  const ctx = makePlayer();
  run(ctx, () => [], 5);
  run(ctx, (f) => (f === 0 ? ['fire', 'right'] : ['right']), frames(WEAPONS.fists.windup));
  check('holding a direction during the wind-up does not walk', Math.abs(ctx.p.body.vx) < 5,
    ctx.p.body.vx.toFixed(1));
  run(ctx, () => ['right'], 1);
  check('the strike steps forward', ctx.p.body.vx > 20, ctx.p.body.vx.toFixed(1));

  const turn = makePlayer();
  run(turn, () => [], 5);
  run(turn, (f) => (f === 0 ? ['fire'] : ['left']), 4);
  check('turning around mid-attack does not flip the swing', turn.p.meleeDir === 1);
}

console.log('\nmelee: respects its own cooldown when held');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('stick');
  run(ctx, () => [], 5);
  run(ctx, () => ['fire'], frames(WEAPONS.stick.cooldown) - 2);
  check('holding attack gives one stick swing per cooldown', ctx.game.meleeHits.length === 1,
    `${ctx.game.meleeHits.length} swings`);
  run(ctx, () => ['fire'], frames(WEAPONS.stick.cooldown) + 2);
  check('...and keeps chaining at that pace', ctx.game.meleeHits.length === 2,
    `${ctx.game.meleeHits.length} swings`);
}

const pistol = WEAPONS.pistol;
function armed() {
  const ctx = makePlayer();
  ctx.p.equipWeapon('pistol');
  run(ctx, () => [], 5); // settle onto the ground
  return ctx;
}

console.log('\nranged: the fan starts wide and narrows only while aiming');
{
  const ctx = armed();
  check('a freshly drawn gun starts at its widest fan',
    Math.abs(ctx.p.spread - pistol.spreadMax) < 1e-9, ctx.p.spread);

  run(ctx, () => ['aim'], Math.round(pistol.aimRampTime * 0.5 * 60));
  check('half the ramp time of aiming lands partway',
    ctx.p.spread < pistol.spreadMax && ctx.p.spread > pistol.spreadMin, ctx.p.spread.toFixed(3));

  run(ctx, () => ['aim'], Math.round(pistol.aimRampTime * 60));
  check('aiming for the full ramp time bottoms out at spreadMin, never tighter',
    Math.abs(ctx.p.spread - pistol.spreadMin) < 1e-6, ctx.p.spread.toFixed(4));
  check('steadiness reads 1 when fully steadied', ctx.p.steadiness() > 0.999);

  run(ctx, () => [], 60);
  check('letting go of aim widens the fan back out (faster than it narrowed)',
    Math.abs(ctx.p.spread - pistol.spreadMax) < 1e-6, ctx.p.spread.toFixed(3));
}

console.log('\nranged: aim and trigger are separate inputs');
{
  const ctx = armed();
  run(ctx, () => ['aim'], 90);
  check('holding aim alone never fires', ctx.game.shots.length === 0);
  check('holding aim alone never swings either', ctx.game.meleeHits.length === 0);

  run(ctx, () => ['aim', 'fire'], 1);
  check('a trigger pull while aiming fires one shot', ctx.game.shots.length === 1);
  check('the shot carries the equipped weapon', ctx.game.shots[0].weapon.id === 'pistol');

  run(ctx, () => ['aim', 'fire'], 60);
  check('holding the trigger does not auto-fire (semi-automatic)',
    ctx.game.shots.length === 1, `${ctx.game.shots.length} shots`);
}

console.log('\nranged: every shot blooms the fan, then aiming tightens it again');
{
  const ctx = armed();
  run(ctx, () => ['aim'], Math.round(pistol.aimRampTime * 60) + 10);
  const before = ctx.p.spread;
  run(ctx, () => ['aim', 'fire'], 1);
  const after = ctx.p.spread;
  check('a shot widens the fan by about `bloom`',
    Math.abs(after - before - pistol.bloom) < 0.02, `${before.toFixed(3)} -> ${after.toFixed(3)}`);

  run(ctx, () => ['aim'], 60);
  check('continuing to aim narrows it again after the shot',
    ctx.p.spread < after - 0.1, ctx.p.spread.toFixed(3));

  ctx.p.spread = pistol.spreadMax;
  run(ctx, () => [], pistol.fireRate * 60 + 2);
  run(ctx, () => ['fire'], 1);
  check('bloom never pushes the fan past spreadMax', ctx.p.spread <= pistol.spreadMax + 1e-9);
}

console.log('\nranged: rate of fire is capped, but an early pull is buffered');
{
  const ctx = armed();
  // Three quick taps inside one fireRate window.
  run(ctx, (f) => (f % 4 === 0 ? ['fire'] : []), 12);
  check('taps faster than fireRate produce a single shot', ctx.game.shots.length === 1,
    `${ctx.game.shots.length}`);

  const shots = ctx.game.shots.length;
  run(ctx, () => [], Math.round(pistol.fireRate * 60) - 8);
  run(ctx, (f) => (f === 0 ? ['fire'] : []), 12);
  check('a pull just before the cooldown ends still fires when it does',
    ctx.game.shots.length === shots + 1);
}

console.log('\nranged: shots land inside the fan');
{
  const ctx = armed();
  run(ctx, () => ['aim'], Math.round(pistol.aimRampTime * 60) + 10);
  run(ctx, () => ['aim', 'fire'], 1);
  const a = ctx.game.shots[0].angle;
  check('a steadied shot lands within the tight spreadMin fan',
    Math.abs(a - ctx.p.aimAngle) <= pistol.spreadMin + 1e-9, a.toFixed(4));

  let maxDev = 0;
  let outside = 0;
  for (let i = 0; i < 40; i++) {
    const c = armed();
    run(c, () => ['fire'], 1);
    const dev = Math.abs(c.game.shots[0].angle - c.p.aimAngle);
    maxDev = Math.max(maxDev, dev);
    if (dev > pistol.spreadMax + 1e-9) outside++;
  }
  check('hip-fired shots visibly scatter', maxDev > 0.15, maxDev.toFixed(3));
  check('...but never outside the widest fan', outside === 0);
}

console.log('\nranged: moving or jumping keeps the fan from fully tightening');
{
  const ctx = armed();
  run(ctx, () => ['aim', 'right'], 240);
  check('running while aiming stays wider than standing still',
    ctx.p.spread > pistol.spreadMin + pistol.moveSpread * 0.5, ctx.p.spread.toFixed(3));
}

console.log('\nranged: the mouse cursor steers the gun');
{
  const ctx = armed();
  ctx.game.camera.x = 0;
  ctx.game.camera.y = 0;
  ctx.input.pointerActive = true;
  // Cursor up and to the left of the player.
  ctx.input.pointerX = ctx.p.centerX - 100;
  ctx.input.pointerY = ctx.p.gunY - 100;
  run(ctx, () => ['aim'], 1);
  check('the aim angle points at the cursor',
    Math.abs(ctx.p.aimAngle - Math.atan2(-100, -100)) < 0.05, ctx.p.aimAngle.toFixed(3));
  check('aiming turns the body to face the cursor', ctx.p.facing === -1);
}

console.log('\nmelee ignores aim');
{
  const ctx = makePlayer();
  ctx.p.equipWeapon('stick');
  run(ctx, () => ['aim'], 30);
  check('holding aim with a melee weapon does nothing',
    ctx.game.meleeHits.length === 0 && ctx.game.shots.length === 0 && !ctx.p.isAiming);
}

console.log('\nweapon persists across respawn but not across a fresh Player');
{
  const { p } = makePlayer();
  p.equipWeapon('pistol');
  p.spread = WEAPONS.pistol.spreadMin;
  p.respawn(0, 0);
  check('dying and respawning does not strip the weapon', p.weaponId === 'pistol');
  check('...but the steadied aim does not survive it', p.spread === WEAPONS.pistol.spreadMax);

  const fresh = makePlayer().p;
  check('a newly constructed player starts unarmed regardless', fresh.weaponId === 'fists');
}

process.exit(summary() ? 0 : 1);
