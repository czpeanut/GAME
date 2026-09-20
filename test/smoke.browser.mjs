// End-to-end smoke test: boots the real page in Chromium, drives it with real
// key/pointer events, and fails on any console error, page error or failed
// request.
//
// The unit tests cover DialogueRunner/Stage/StoryState logic; this covers the
// things only a browser can prove - that the modules load, the canvas
// renders, and a whole run through the demo script works without throwing.
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
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });

// The demo content ships with no art (see README - that's by design, the
// user supplies it later), so every portrait/background PNG the renderer
// probes for is an *expected* 404: PortraitRenderer's whole point is to fall
// back to a labelled placeholder instead of breaking. Chromium logs a missing
// subresource as a console "error" regardless of whether the app handled it
// gracefully, so those specific 404s against assets/ are not failures here -
// anything else still is.
const isExpectedAssetMiss = (url) => /\/assets\/(characters|backgrounds)\//.test(url);

const errors = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // A failed-resource console error's URL lives in location(), not text() -
  // the text itself is just the generic "...responded with 404..." message.
  if (isExpectedAssetMiss(m.location()?.url ?? '')) return;
  errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  if (isExpectedAssetMiss(r.url())) return;
  errors.push(`requestfailed: ${r.url()}`);
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

await page.goto(URL_BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

console.log('\nboot');
check('app object is exposed', await page.evaluate(() => !!window.app));
check('starts on the title screen',
  (await page.evaluate(() => window.app.scenes.top.constructor.name)) === 'TitleScene');

console.log('\nstarting the script');
await page.mouse.click(500, 310); // tap the canvas to start
await page.waitForTimeout(200);
check('a tap on the title screen starts the dialogue',
  (await page.evaluate(() => window.app.scenes.top.constructor.name)) === 'DialogueScene');

console.log('\nwalking the script through to the end');
// The demo script is linear now - 學姊 introducing herself - so this walks it
// rather than looking for a branch. Choices, flags and tapping a rendered
// choice are covered by test/dialogue.test.mjs against its own fixtures, so
// dropping them here loses no coverage.
//
// hasChoices/isFullyRevealed still matter for pacing: a confirm press while
// the typewriter is still running finishes the reveal instead of advancing,
// which is exactly what a player sees, so pressing repeatedly is the honest
// way to walk it.
const spoken = new Set();
let reachedEnd = false;
for (let i = 0; i < 60; i++) {
  const state = await page.evaluate(() => {
    const top = window.app.scenes.top;
    return {
      scene: top.constructor.name,
      text: top.runner?.lineText ?? '',
      speaker: top.runner?.speaker ?? null,
    };
  });
  if (state.scene === 'EndScene') { reachedEnd = true; break; }
  if (state.text) spoken.add(state.text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(110);
}

check('the script reaches the end screen', reachedEnd);
check('it showed several lines on the way', spoken.size >= 5, `${spoken.size} distinct lines`);
check('學姊 is the one speaking',
  [...spoken].length > 0 && (await page.evaluate(() => Object.keys(window.app.characters))).includes('senpai'));
check('she says the thing the script is about',
  [...spoken].some((t) => t.includes('全學年第一')), [...spoken].slice(0, 3).join(' / '));

console.log('\nrestarting');
await page.keyboard.press('Enter'); // restart from the end screen
await page.waitForTimeout(250);
check('restarting goes straight back into a fresh dialogue',
  (await page.evaluate(() => window.app.scenes.top.constructor.name)) === 'DialogueScene');
check('story state is cleared on restart',
  (await page.evaluate(() => Object.keys(window.app.story.vars).length)) === 0);

console.log('\nstability');
const fps = await page.evaluate(() => window.app.loop.fps);
check('runs at a playable frame rate', fps > 45, `${fps.toFixed(0)} fps`);

console.log('\nconsole output');
check('no errors logged', errors.length === 0, errors.join(' | ') || 'clean');

await browser.close();
console.log(`\n${failures === 0 ? 'browser smoke test passed' : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
