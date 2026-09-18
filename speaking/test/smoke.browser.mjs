// End-to-end smoke test: boots the real server and the real page in Chromium,
// stubs out only the two Gemini calls (no API key, no cost, no 10-second
// wait), and checks the thing this whole change is about - that the puppet's
// mouth follows the audio and shuts when the audio stops.
//
// Optional: needs playwright and a Chromium build. Skips cleanly without
// them, so `npm test` never fails because of the environment.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3123);
const BASE = `http://127.0.0.1:${PORT}/`;

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const dir = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith('chromium-')) continue;
    const candidate = join(dir, entry, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function skip(reason) {
  console.log(`SKIP browser smoke test: ${reason}`);
  process.exit(0);
}

// A speech-shaped WAV: three syllables with silence between them, so the
// mouth has something to follow and something to close on.
function speechWav({ rate = 24000 } = {}) {
  const pattern = [
    [0.45, 0.6], [0.25, 0], [0.45, 0.6], [0.25, 0], [0.45, 0.6], [0.3, 0],
  ];
  const frames = Math.round(pattern.reduce((sum, [s]) => sum + s, 0) * rate);
  const bytes = frames * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(bytes, 40);

  let at = 0;
  for (const [seconds, amplitude] of pattern) {
    const length = Math.round(seconds * rate);
    for (let i = 0; i < length && at < frames; i++, at++) {
      const value = amplitude * Math.sin((2 * Math.PI * 220 * at) / rate);
      buffer.writeInt16LE(Math.round(value * 32767), 44 + at * 2);
    }
  }
  return buffer;
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  skip('playwright is not installed (run: npm i)');
}
const executablePath = findChromium();
if (!executablePath) skip('no Chromium build found');
if (!existsSync(join(root, 'public', 'app.bundle.js'))) skip('run `npm run build` first');

// ---- boot the real server ----
const server = spawn('node', [join(root, 'server.js')], {
  env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stopServer = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stopServer);

let up = false;
for (let i = 0; i < 50 && !up; i++) {
  await new Promise((r) => setTimeout(r, 100));
  up = await fetch(BASE).then((r) => r.ok).catch(() => false);
}
if (!up) {
  stopServer();
  console.log('FAIL: the server did not come up');
  process.exit(1);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

// Two kinds of noise are expected and are not this app's problem: the parts
// of the rig that have no art yet 404 by design (the renderer skips them -
// that is how the character can be completed one part at a time), and the
// webfont stylesheet is fetched from Google, which a sandboxed test machine
// may not be able to reach.
const EXPECTED_MISSING = /\/assets\/characters\/[^/]+\/(eyes|hair_back|accessory)\//;
const isOurs = (url) => url.startsWith(BASE) && !EXPECTED_MISSING.test(url);

const errors = [];
page.on('console', (m) => {
  // A failed resource logs a console error with no URL attached to the text,
  // so use the location instead and let the response/requestfailed handlers
  // below do the actual judging.
  const url = m.location()?.url ?? '';
  if (m.type() === 'error' && (!url || isOurs(url))) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => {
  if (isOurs(r.url())) errors.push(`${r.url()} ${r.failure()?.errorText}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && isOurs(r.url())) errors.push(`${r.url()} -> ${r.status()}`);
});

const ANSWER = '先把題目念一次，再說說你卡在哪一步。';
await page.route('**/api/ask', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWER }) }));
await page.route('**/api/tts**', (route) =>
  route.fulfill({ status: 200, contentType: 'audio/wav', body: speechWav() }));

await page.goto(BASE, { waitUntil: 'networkidle' });

console.log('\nstartup');
await page.waitForFunction(() => window.puppet?.ready === true, null, { timeout: 10000 });
check('the puppet loads its art and the page is ready to take a question', true);
check('there is no connection step to wait through',
  await page.locator('#askBtn').isEnabled());
check('the loading overlay is gone', await page.locator('#loadingOverlay').isHidden());
check('the mouth starts closed', (await page.evaluate(() => window.puppet.mouthIndex)) === 0);

console.log('\nidle motion');
{
  const angles = [];
  for (let i = 0; i < 12; i++) {
    angles.push(await page.evaluate(() => {
      const rig = window.puppet.rig;
      return [rig.byName.get('torso').transform.scaleY, rig.byName.get('hair_front').worldAngle];
    }));
    await page.waitForTimeout(120);
  }
  check('the puppet breathes while it is idle',
    new Set(angles.map((a) => a[0])).size > 3);
  check('and the hair swings with it',
    new Set(angles.map((a) => a[1])).size > 3);
}

console.log('\nasking a question');
await page.fill('#questionInput', '這題我不會，可以教我嗎？');
await page.click('#askBtn');
await page.waitForSelector('.chat-row.ai:not(:first-child) .chat-bubble', { timeout: 10000 });
check('the answer lands in the thread',
  (await page.locator('.chat-row.ai .chat-bubble').last().textContent()) === ANSWER);

console.log('\nlip sync');
{
  await page.waitForFunction(() => {
    const a = document.getElementById('avatarAudio');
    return a && !a.paused && a.currentTime > 0;
  }, null, { timeout: 15000 });
  check('the browser plays the audio itself - no third-party stream', true);

  const track = [];
  const started = Date.now();
  while (Date.now() - started < 2600) {
    track.push(await page.evaluate(() => ({
      mouth: window.puppet.mouthIndex,
      at: document.getElementById('avatarAudio').currentTime,
    })));
    await page.waitForTimeout(40);
  }
  const shapes = new Set(track.map((s) => s.mouth));
  check('the mouth moves while the answer is spoken', shapes.size > 1,
    `shapes seen: ${[...shapes].sort().join(',')}`);
  check('it reaches wide open on the loud parts', shapes.has(2));
  check('and closes again in the gaps between syllables', shapes.has(0));

  // The clip is three 0.45s bursts separated by 0.25s of silence. The mouth
  // should be shut in the gaps and open in the bursts - that is the whole
  // claim, so check it against the clip rather than just "something moved".
  const inBurst = (t) => {
    const cycle = t % 0.7;
    return t < 1.85 && cycle < 0.45;
  };
  const sampled = track.filter((s) => s.at > 0.1);
  const wrong = sampled.filter((s) => (s.mouth > 0) !== inBurst(s.at));
  check('the mouth matches the audio, not a random flap',
    wrong.length / Math.max(sampled.length, 1) < 0.2,
    `${wrong.length}/${sampled.length} samples off`);

  await page.waitForFunction(() => document.getElementById('avatarAudio').ended, null, { timeout: 15000 });
  await page.waitForTimeout(200);
  check('the mouth shuts when the answer is over',
    (await page.evaluate(() => window.puppet.mouthIndex)) === 0);
  check('the speaking badge goes away', await page.locator('#speakingBadge').isHidden());
}

console.log('\nconsole output');
check('no errors logged', errors.length === 0, errors.join(' | ') || 'clean');

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

await browser.close();
stopServer();
console.log(failures ? `\n${failures} failed` : '\nbrowser smoke test passed');
process.exit(failures ? 1 : 0);
