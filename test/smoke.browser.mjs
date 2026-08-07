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

// Start playing.
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('space starts the game', (await page.evaluate(() => window.game.state)) === 'playing');

console.log('\nmovement and combat');
// Run far enough right to leave the camera's dead zone and the level's left
// clamp - near the spawn the camera is *supposed* to stay put.
await page.keyboard.down('KeyD');
await page.waitForTimeout(2000);
const moved = await page.evaluate(() => ({
  x: window.game.player.x,
  cam: window.game.camera.x,
}));
check('player moves right', moved.x > 400, `x=${moved.x.toFixed(0)}`);
check('camera scrolls with the player', moved.cam > 0, `camX=${moved.cam.toFixed(0)}`);

await page.keyboard.down('KeyJ');
await page.waitForTimeout(400);
check('firing spawns bullets', await page.evaluate(() => window.game.bullets.length >= 0));
await page.keyboard.up('KeyJ');

await page.keyboard.press('ShiftLeft');
await page.waitForTimeout(80);
check('dash activates', await page.evaluate(() => window.game.player.dashT > 0));
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
