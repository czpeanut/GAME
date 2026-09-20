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
import { startFakeGemini } from './fake-gemini.mjs';

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

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  skip('playwright is not installed (run: npm i)');
}
const executablePath = findChromium();
if (!executablePath) skip('no Chromium build found');
if (!existsSync(join(root, 'public', 'app.bundle.js'))) skip('run `npm run build` first');

// ---- boot a fake Gemini, then the real server pointed at it ----
const ANSWER = '你先把題目從頭到尾念一次，把已知的條件圈出來。然後看看題目到底在問什麼。這樣通常就找得到卡住的地方了。';
const fake = await startFakeGemini({ answer: ANSWER });

const server = spawn('node', [join(root, 'server.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    GEMINI_API_KEY: 'test-key',
    GEMINI_BASE: fake.base,
    GEMINI_INTERACTIONS: fake.interactions,
    GEMINI_TTS_MODEL: 'fake-tts',
    ...(process.env.FORCE_BUFFERED === '1' ? { GEMINI_TTS_STREAM_MODEL: '' } : {}),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stopServer = () => {
  try { server.kill(); } catch { /* already gone */ }
  fake.stop().catch(() => {});
};
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
// The last two sections break the API on purpose to check that the failure is
// reported to the person. Everything they log is expected, so stop collecting
// once they start - otherwise the test fails on the errors it asked for.
let expectFailures = false;
page.on('console', (m) => {
  if (expectFailures) return;
  // A failed resource logs a console error with no URL attached to the text,
  // so use the location instead and let the response/requestfailed handlers
  // below do the actual judging.
  const url = m.location()?.url ?? '';
  if (m.type() === 'error' && (!url || isOurs(url))) errors.push(`${m.text()} @ ${url || '(no url)'}`);
});
page.on('pageerror', (e) => { if (!expectFailures) errors.push(String(e)); });
page.on('requestfailed', (r) => {
  if (!expectFailures && isOurs(r.url())) errors.push(`${r.url()} ${r.failure()?.errorText}`);
});
page.on('response', (r) => {
  if (!expectFailures && r.status() >= 400 && isOurs(r.url())) errors.push(`${r.url()} -> ${r.status()}`);
});

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// /api/ask and /api/tts are NOT stubbed: they go to the real server, which
// talks to the fake Gemini. That is the point - it exercises the streaming
// response handling and the browser playing a WAV whose length is not known
// when the header goes out.
const ttsRequests = [];
page.on('request', (r) => {
  if (r.url().includes('/api/tts')) ttsRequests.push(r.url());
});

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
// The "thinking" row is also .chat-row.ai, so wait for it to be replaced
// rather than for any AI row to exist.
await page.waitForFunction(() => document.querySelectorAll('.chat-bubble-thinking').length === 0,
  null, { timeout: 20000 });
check('the answer lands in the thread',
  (await page.locator('.chat-row.ai .chat-bubble').last().textContent()) === ANSWER);

console.log('\nspeaking a clause at a time');
{
  // Not just "something is playing": unlock() plays a moment of silence inside
  // the submit gesture, which would satisfy that before a word is synthesised.
  await page.waitForFunction(() => {
    const els = [document.getElementById('avatarAudio'), document.getElementById('avatarAudioNext')];
    return els.some((a) => a && !a.paused && a.currentTime > 0 && a.currentSrc.includes('/api/tts'));
  }, null, { timeout: 20000 });
  check('the browser plays the audio itself - no third-party stream', true);

  const firstText = new URL(ttsRequests[0] || BASE, BASE).searchParams.get('text') || '';
  check('the first request is for one short clause, not the whole answer',
    firstText.length > 0 && firstText.length <= 24 && firstText.length < ANSWER.length / 2,
    `${firstText.length} chars: ${firstText}`);
  check('the clause is a prefix of the answer', ANSWER.startsWith(firstText), firstText);

  // Sample the mouth every frame from inside the page. Polling from out here
  // tops out around 25 samples a second, which cannot resolve the 70ms gap
  // between two syllables - and whether the mouth shuts in that gap is the
  // whole question.
  await page.evaluate(() => {
    window.__mouthTrace = [];
    const audible = () => [document.getElementById('avatarAudio'), document.getElementById('avatarAudioNext')]
      .some((el) => el && !el.paused && !el.ended);
    const tick = () => {
      window.__mouthTrace.push([performance.now(), window.puppet.mouthIndex, audible() ? 1 : 0]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const track = [];
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const state = await page.evaluate(() => ({
      mouth: window.puppet.mouthIndex,
      playing: [document.getElementById('avatarAudio'), document.getElementById('avatarAudioNext')]
        .some((a) => a && !a.paused && !a.ended),
    }));
    track.push(state);
    if (!state.playing && track.length > 20 && track.slice(-8).every((s) => !s.playing)) break;
    await page.waitForTimeout(40);
  }

  const whileSpeaking = track.filter((s) => s.playing);
  const shapes = new Set(whileSpeaking.map((s) => s.mouth));
  check('the mouth moves while the answer is spoken', shapes.size > 1,
    `shapes seen: ${[...shapes].sort().join(',')}`);
  check('it reaches wide open', shapes.has(2));
  check('and closes again between syllables', shapes.has(0));

  // The end-to-end measurement: real audio, real analyser, real canvas. The
  // fake clip is syllable-timed (see fake-gemini.mjs), so a mouth that is
  // following it spends well under all of the speech open, and shuts several
  // times a second. Before the mouth track learned to close inside a phrase it
  // was open for ~98% of the audio and shut about once a second.
  const trace = await page.evaluate(() => window.__mouthTrace);
  const speaking = trace.filter(([, , playing]) => playing);
  const openFrames = speaking.filter(([, mouth]) => mouth > 0).length;
  const openRatio = speaking.length ? openFrames / speaking.length : 1;
  const span = speaking.length > 1 ? (speaking[speaking.length - 1][0] - speaking[0][0]) / 1000 : 0;
  let closures = 0;
  speaking.forEach(([, mouth], i) => {
    if (i > 0 && mouth === 0 && speaking[i - 1][1] > 0) closures++;
  });
  check('the trace has enough frames to say anything', speaking.length > 60 && span > 1,
    `${speaking.length} frames over ${span.toFixed(1)}s`);
  check('the mouth is not simply hanging open through the speech', openRatio < 0.85,
    `open ${(openRatio * 100).toFixed(0)}% of the speaking frames`);
  check('nor mostly shut', openRatio > 0.3, `open ${(openRatio * 100).toFixed(0)}%`);
  // At 5-6 syllables a second the mouth should shut for most of the gaps
  // between them. Many more closures than there are syllables would be a
  // strobing mouth, which stops reading as speech altogether.
  check('it shuts several times a second, in the gaps between syllables',
    span > 0 && closures / span >= 3, `${(closures / span).toFixed(1)} closures/s`);
  check('but not more often than anyone could be speaking',
    span > 0 && closures / span <= 12, `${(closures / span).toFixed(1)} closures/s`);
  check('and it uses the half-open shape, not just open and shut',
    speaking.some(([, mouth]) => mouth === 1));
  check('the mouth is shut whenever nothing is playing',
    track.filter((s) => !s.playing).every((s) => s.mouth === 0));

  await page.waitForFunction(() => window.puppet.speaking === false, null, { timeout: 25000 });
  check('the whole answer was split into several requests', ttsRequests.length > 1,
    `${ttsRequests.length} requests`);
  check('every clause reached the server in order',
    ttsRequests
      .map((u) => new URL(u, BASE).searchParams.get('text'))
      .join('') === ANSWER,
    ttsRequests.map((u) => new URL(u, BASE).searchParams.get('text')).join(' | '));
  check('the mouth shuts when the answer is over',
    (await page.evaluate(() => window.puppet.mouthIndex)) === 0);
}

console.log('\nwhich synthesis path the server used');
{
  const res = await page.request.get(`${BASE}api/tts?text=${encodeURIComponent('測試一小段語音就好')}`);
  const path = res.headers()['x-tts-path'] || '';
  const expected = process.env.FORCE_BUFFERED === '1' ? 'buffered:' : 'stream:';
  check(`the server reports its path (${path || 'missing'})`, path.startsWith(expected), path);
  const body = await res.body();
  check('it answers with a WAV', body.slice(0, 4).toString() === 'RIFF' && body.length > 1000,
    `${body.length} bytes`);
}

console.log('\na question the teacher has already written a method for');
{
  const before = fake.calls.systemInstructions.length;
  const ttsBefore = ttsRequests.length;
  await page.fill('#questionInput', 'a sin θ + b cos θ 的最大值要怎麼求？');
  await page.click('#askBtn');
  await page.waitForSelector('.method-card', { timeout: 20000 });

  const card = await page.evaluate(() => {
    const el = document.querySelector('.method-card');
    return {
      title: el.querySelector('.method-title')?.textContent || '',
      formula: el.querySelector('.method-formula')?.textContent || '',
      steps: [...el.querySelectorAll('.method-steps li')].length,
      // The card must not be a chat bubble - it is not something she said.
      isBubble: Boolean(el.closest('.chat-bubble')),
    };
  });
  check('the prepared method is on screen', card.title.includes('疊合'), card.title);
  check('with the formula shown rather than described',
    card.formula.includes('R·sin'), card.formula);
  check('and the steps to follow', card.steps >= 3, `${card.steps} steps`);
  check('it is not presented as something she said', !card.isBubble);

  const sent = fake.calls.systemInstructions[before] || '';
  check('the model was given the method as instructions',
    sent.includes('不要自己另外想一套做法') && sent.includes('R·sin'), sent.slice(0, 60));
  check('and the ordinary speech rules are still in there',
    sent.includes('語音合成朗讀'), sent.slice(0, 40));

  // The whole reason for splitting the card off: symbols are unusable read
  // aloud. So wait for this answer to actually start being spoken, then check
  // that nothing from the card went with it.
  const deadline = Date.now() + 15000;
  while (ttsRequests.length === ttsBefore && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  check('the answer is being spoken', ttsRequests.length > ttsBefore,
    `${ttsRequests.length - ttsBefore} requests`);
  const spoken = ttsRequests.map((url) => new URL(url, BASE).searchParams.get('text') || '').join(' ');
  check('but the formula never reached the speech endpoint',
    !spoken.includes(card.formula) && !spoken.includes('R·sin') && !/[√·±]/.test(spoken),
    spoken.slice(-60));
}

console.log('\nand an ordinary question gets no card');
{
  const cardsBefore = await page.locator('.method-card').count();
  await page.fill('#questionInput', '學姊你平常都幾點睡？');
  await page.click('#askBtn');
  await page.waitForFunction(() => document.querySelectorAll('.chat-bubble-thinking').length === 0,
    null, { timeout: 20000 });
  await page.waitForTimeout(300);
  check('no method card was added',
    (await page.locator('.method-card').count()) === cardsBefore,
    `${await page.locator('.method-card').count()} vs ${cardsBefore}`);
  const sent = fake.calls.systemInstructions[fake.calls.systemInstructions.length - 1] || '';
  check('and the model got no extra instructions', !sent.includes('速解法'), sent.slice(0, 60));
}

console.log('\npicking a voice and a tone');
{
  const listed = await (await page.request.get(`${BASE}api/voices`)).json();
  check('the server publishes its voice list', Array.isArray(listed.voices) && listed.voices.length > 10,
    `${listed.voices?.length} voices`);
  check('every entry has a name and a style',
    listed.voices.every((v) => v.name && v.style));
  check('and it says which one this deployment defaults to', typeof listed.voice === 'string' && listed.voice,
    listed.voice);

  const options = await page.evaluate(() => ({
    voices: [...document.getElementById('voiceSelect').options].length,
    tones: [...document.getElementById('toneSelect').options].map((o) => o.value),
    selected: document.getElementById('voiceSelect').value,
  }));
  check('the page built the picker from it', options.voices === listed.voices.length,
    `${options.voices} options`);
  check('starting on the deployment default', options.selected === listed.voice, options.selected);
  check('and the tone presets are there', options.tones.includes('lively'), options.tones.join(','));

  // Choose a voice and a tone that are not the defaults, press 試聽, and check
  // that both reach Gemini - the voice as the voice, the tone as a direction in
  // front of the line.
  const before = fake.calls.ttsTexts.length;
  await page.selectOption('#voiceSelect', 'Sadachbia');
  await page.selectOption('#toneSelect', 'lively');
  await page.click('#previewBtn');
  const deadline = Date.now() + 8000;
  while (fake.calls.ttsTexts.length === before && Date.now() < deadline) {
    await page.waitForTimeout(50);
  }
  check('the chosen voice is what Gemini is asked for',
    fake.calls.ttsVoices[before] === 'Sadachbia', String(fake.calls.ttsVoices[before]));
  check('the chosen tone arrives as a direction',
    (fake.calls.ttsTexts[before] || '').startsWith('請用活潑開朗、充滿精神的語氣說：'),
    fake.calls.ttsTexts[before]);
  check('and the line itself is still in there',
    (fake.calls.ttsTexts[before] || '').includes('我是學姊'), fake.calls.ttsTexts[before]);
}

console.log('\nneither is taken on trust');
{
  const bad = await page.request.get(`${BASE}api/tts?text=${encodeURIComponent('一句話')}&voice=Nonexistent`);
  check('an unknown voice is refused, not forwarded', bad.status() === 400, String(bad.status()));
  const badTone = await page.request.get(`${BASE}api/tts?text=${encodeURIComponent('一句話')}&tone=whatever`);
  check('an unknown tone is refused too', badTone.status() === 400, String(badTone.status()));
  const fine = await page.request.get(`${BASE}api/tts?text=${encodeURIComponent('一句話')}&voice=Kore`);
  check('a known one still works', fine.ok(), String(fine.status()));
}

console.log('\nconsole output');
check('no errors logged', errors.length === 0, errors.join(' | ') || 'clean');

console.log('\na failure is visible in the thread, not just in a hint line');
{
  expectFailures = true;
  await page.unroute('**/api/ask');
  await page.route('**/api/ask', (route) =>
    json(route, { error: '尚未設定 GEMINI_API_KEY，請在環境變數加入後重新啟動伺服器。' }, 500));

  await page.fill('#questionInput', '這題怎麼算？');
  await page.click('#askBtn');
  await page.waitForSelector('.chat-bubble-error', { timeout: 10000 });
  const message = await page.locator('.chat-bubble-error').last().textContent();
  check('a failed question puts the reason in the conversation', message.includes('GEMINI_API_KEY'),
    message);
  check('the thinking row is cleared', (await page.locator('.chat-bubble-thinking').count()) === 0);
  check('and you can ask again', await page.locator('#askBtn').isEnabled());
}

console.log('\na server with no key says so on load');
{
  await page.unroute('**/api/health');
  await page.route('**/api/health', (route) => json(route, { ok: true, gemini: false }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.chat-bubble-error', { timeout: 10000 });
  const message = await page.locator('.chat-bubble-error').first().textContent();
  check('the missing key is reported before anyone asks anything',
    message.includes('GEMINI_API_KEY'), message);
}

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

await browser.close();
stopServer();
console.log(failures ? `\n${failures} failed` : '\nbrowser smoke test passed');
process.exit(failures ? 1 : 0);
