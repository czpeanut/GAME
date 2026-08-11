// End-to-end smoke test: boots the real page in Chromium, drives it with real
// key events, and fails on any console error, page error or failed request.
//
// The unit tests cover physics and level geometry; this covers the things only
// a browser can prove - that the modules load, the canvas renders, and a whole
// frame of the game loop runs without throwing.
//
// Optional: requires `npm i` (playwright) and a running server. Skips cleanly
// if either is missing, so `npm test` never fails because of environment.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const URL_BASE = process.env.GAME_URL || 'http://localhost:8080/';

// Playwright pins an exact browser build; a preinstalled Chromium may differ,
// so locate one rather than trusting the default path.
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root)) {
    if (!dir.startsWith('chromium-')) continue;
    const candidate = join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function skip(reason) {
  console.log(`SKIP browser smoke test: ${reason}`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  skip('playwright is not installed (run: npm i)');
}

try {
  const res = await fetch(URL_BASE);
  if (!res.ok) skip(`server returned ${res.status} - start it with: npm start`);
} catch {
  skip(`no server at ${URL_BASE} - start it with: npm start`);
}

const executablePath = findChromium();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

await page.goto(URL_BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

console.log('\nboot');
check('game object is exposed', await page.evaluate(() => !!window.game));
check('starts on the title screen', (await page.evaluate(() => window.game.state)) === 'title');

// Start playing. The default game (main.js) opens on a story chapter whose
// wake-up beat is a cutscene that locks input until dismissed - press confirm
// a generous number of times to clear it before anything below assumes the
// player can move. A plain arcade level with no intro would just no-op these
// extra presses on an already-idle title/world, so this is safe either way.
await page.keyboard.press('Space');
await page.waitForTimeout(2500); // covers the wake-up fade-in
for (let i = 0; i < 15; i++) {
  const top = await page.evaluate(() => window.game.scenes.top.constructor.name);
  if (top === 'WorldScene') break;
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(150);
}
check('space starts the game', (await page.evaluate(() => window.game.state)) === 'playing');

console.log('\nmovement and combat');
// Run far enough right to leave the camera's dead zone and the level's left
// clamp - near the spawn the camera is *supposed* to stay put. A story level
// can have a narrative trigger along the way that opens a dialogue and
// blocks movement until dismissed (the default game does, right after
// spawn), so this dismisses anything that pops up rather than assuming a
// single blind hold of the movement key reaches the target distance.
async function walkRightUntil(targetX, maxSteps = 30) {
  for (let i = 0; i < maxSteps; i++) {
    const top = await page.evaluate(() => window.game.scenes.top.constructor.name);
    if (top === 'DialogueScene') {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(100);
      continue;
    }
    const x = await page.evaluate(() => window.game.player.x);
    if (x > targetX) return x;
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(150);
  }
  await page.keyboard.up('KeyD');
  return page.evaluate(() => window.game.player.x);
}

const reachedX = await walkRightUntil(400);
await page.keyboard.up('KeyD');
const cam = await page.evaluate(() => window.game.camera.x);
check('player moves right', reachedX > 400, `x=${reachedX.toFixed(0)}`);
check('camera scrolls with the player', cam > 0, `camX=${cam.toFixed(0)}`);

// Firing and dash may be gated by story progression in the default game
// (they are here: the player starts unarmed, and dash is locked). This
// checks the mechanisms themselves work once available, the same way
// picking up a weapon or an adrenaline shot eventually enables them - the
// pacing of *when* that happens is the story content's job to test
// (test/opening.test.mjs), not this one's.
await page.evaluate(() => {
  window.game.player.equipWeapon('pistol');
  window.game.story.grantAbility('dash');
});

// Checked via score/shots-fired bookkeeping rather than the live bullets
// array: a fired bullet can hit a wall or enemy and be swept from that array
// well within a longer wait, depending on where this lands in the level, so
// "was one ever spawned" needs a signal that survives the bullet's own
// lifetime - the total fired count does.
const firedBefore = await page.evaluate(() => window.game.world.bulletsFiredDebug ?? 0);
await page.evaluate(() => {
  // Count every spawnBullet call without changing production behaviour.
  const w = window.game.world;
  if (!w._spawnBulletWrapped) {
    const original = w.spawnBullet.bind(w);
    w.bulletsFiredDebug = 0;
    w.spawnBullet = (...args) => {
      w.bulletsFiredDebug++;
      return original(...args);
    };
    w._spawnBulletWrapped = true;
  }
});
await page.keyboard.down('KeyJ');
await page.waitForTimeout(120); // pistol's attackCd starts at 0 right after
// equip, so the first shot fires on the very next simulated frame - no need
// to wait out a full fireRate cycle just to observe it.
const firedAfter = await page.evaluate(() => window.game.world.bulletsFiredDebug ?? 0);
check('firing spawns bullets once armed', firedAfter > firedBefore,
  `fired before=${firedBefore} after=${firedAfter}`);
await page.keyboard.up('KeyJ');

await page.keyboard.down('KeyD');
await page.waitForTimeout(80);
await page.keyboard.press('ShiftLeft');
await page.waitForTimeout(80);
check('dash activates once granted', await page.evaluate(() => window.game.player.dashT > 0));
await page.waitForTimeout(400);
await page.keyboard.up('KeyD');

console.log('\nstability');
const finite = await page.evaluate(() => {
  const p = window.game.player;
  return [p.x, p.y, p.body.vx, p.body.vy, window.game.camera.x].every(Number.isFinite);
});
check('no NaN in player or camera state', finite);

const fps = await page.evaluate(() => window.game.loop.fps);
check('runs at a playable frame rate', fps > 45, `${fps.toFixed(0)} fps`);

console.log('\ndeath and respawn');
await page.evaluate(() => window.game.player.kill());
await page.waitForTimeout(700);
check('death is registered', (await page.evaluate(() => window.game.state)) === 'dead');
await page.keyboard.press('KeyR');
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  state: window.game.state,
  hp: window.game.player.health,
}));
check('respawn restores play', after.state === 'playing', `hp=${after.hp}`);

console.log('\nconsole output');
check('no errors logged', errors.length === 0, errors.join(' | ') || 'clean');

await browser.close();
console.log(`\n${failures === 0 ? 'browser smoke test passed' : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
