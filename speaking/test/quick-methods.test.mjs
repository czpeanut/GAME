// Matching a question against the teacher's prepared methods. Pure string
// work, no server, no model - which is the point of keeping the matcher out of
// server.js.
//
// Two things are being tested, and the second matters more: that the topics
// the library claims to cover really do fire, and that they do NOT fire on
// everything else. A quick method pasted under an unrelated question is worse
// than no quick method at all.

import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check, summary } from './harness.mjs';

const require = createRequire(import.meta.url);
const qm = require('../lib/quick-methods.js');

const library = qm.loadLibrary();
const idsFor = (question) => qm.findMethods(question, library).map((m) => m.id);
const hits = (question) => idsFor(question).join(',') || '(none)';

console.log('\nthe library loads');
{
  check('there are methods in it', library.length > 0, `${library.length}`);
  check('every one has an id and a title', library.every((m) => m.id && m.title));
  check('every one has at least one rule', library.every((m) => m._rules.length > 0),
    library.filter((m) => !m._rules.length).map((m) => m.id).join(',') || 'all have rules');
  check('every one has steps to show', library.every((m) => (m.steps || []).length > 0));
  check('the ids are unique', new Set(library.map((m) => m.id)).size === library.length);
}

console.log('\n三角函數疊合 - the topic this was built for');
{
  const asked = [
    '三角函數疊合要怎麼做？',
    '老師說的疊合我聽不懂',
    '輔助角公式是什麼',
    '請問 a sin θ + b cos θ 的最大值怎麼求',
    'asinθ+bcosθ 這種的',
    '3sinx + 4cosx 的值域是多少',
    '怎麼把 sin 和 cos 合成一個',
    'sinx+cosx 的最小值',
  ];
  for (const question of asked) {
    check(`「${question}」`, idsFor(question).includes('trig-superposition'), hits(question));
  }
}

console.log('\nthe same question typed the way students actually type it');
{
  // Full-width letters from a phone keyboard, spaces everywhere, mixed case.
  const awkward = [
    'ａ　ｓｉｎ　θ　＋　ｂ　ｃｏｓ　θ　的最大值',
    'A SIN X + B COS X 最大值怎麼算',
    '疊    合',
  ];
  for (const question of awkward) {
    check(`「${question}」`, idsFor(question).includes('trig-superposition'), hits(question));
  }
}

console.log('\nand the questions it must keep its hands off');
{
  const unrelated = [
    '什麼是光合作用',
    '明天要考什麼',
    '我不會寫作文的開頭',
    '三角形的面積公式是什麼',
    'sin 30 度是多少',
    'cos 的圖形長什麼樣子',
    '學姊你有在社團嗎',
    '',
    '   ',
  ];
  for (const question of unrelated) {
    check(`「${question || '(空的)'}」沒有命中`, idsFor(question).length === 0, hits(question));
  }
}

console.log('\nexclude wins over a rule that would otherwise match');
{
  const fixture = [{
    id: 'x',
    title: 'x',
    rules: [['sin', 'cos', '最大值']],
    exclude: ['反函數'],
    steps: ['...'],
  }];
  const dir = mkdtempSync(join(tmpdir(), 'qm-'));
  const file = join(dir, 'fixture.json');
  writeFileSync(file, JSON.stringify({ methods: fixture }));
  const loaded = qm.loadLibrary(file);
  check('the rule matches on its own',
    qm.findMethods('sin 和 cos 的最大值', loaded).length === 1);
  check('but not with the excluded word present',
    qm.findMethods('sin 和 cos 反函數的最大值', loaded).length === 0);
}

console.log('\none question does not drag in the whole library');
{
  const dir = mkdtempSync(join(tmpdir(), 'qm-'));
  const file = join(dir, 'many.json');
  writeFileSync(file, JSON.stringify({
    methods: Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`, title: `m${i}`, rules: [['數學']], steps: ['...'],
    })),
  }));
  const many = qm.loadLibrary(file);
  const matched = qm.findMethods('數學', many);
  check(`at most ${qm.MAX_MATCHES} methods come back`, matched.length === qm.MAX_MATCHES,
    `${matched.length}`);
}

console.log('\nwhat the model is told');
{
  const matched = qm.findMethods('三角函數疊合', library);
  const guidance = qm.buildGuidance(matched);
  check('it carries the method itself', guidance.includes('R·sin(θ + φ)'), guidance.slice(0, 40));
  check('it carries every step', matched[0].steps.every((step) => guidance.includes(step)));
  check('it tells the model to use it rather than invent one',
    guidance.includes('不要自己另外想一套做法'));
  check('and not to read the symbols aloud', guidance.includes('不要把公式的符號唸出來'));
  check('nothing to say when nothing matched', qm.buildGuidance([]) === '');
}

console.log('\nwhat the page is sent');
{
  const card = qm.toCard(qm.findMethods('輔助角', library)[0]);
  check('the card has what it needs to render',
    card.title && card.formula && card.steps.length > 0);
  check('and none of the matching internals leak to the browser',
    !('rules' in card) && !('_rules' in card) && !('exclude' in card),
    Object.keys(card).join(','));
}

console.log('\nthe methods that ship with it are reachable');
{
  // Every method in the library has to be findable by SOMETHING, or it is dead
  // content. Its own title is the cheapest thing to try.
  for (const method of library) {
    check(`「${method.title}」can be reached by its own title`,
      qm.findMethods(method.title, library).some((m) => m.id === method.id),
      hits(method.title));
  }
}

process.exit(summary() ? 0 : 1);
