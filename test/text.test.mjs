// Text wrapping tests.
//
// `measure` is synthetic here (no canvas available in Node), but it models
// the one property that actually matters for these tests: CJK glyphs render
// roughly twice as wide as Latin ones in most fonts. Getting the wrapping
// algorithm right against a fake measure function proves the logic; the real
// game supplies ctx.measureText instead at runtime.

import { wrapText, wrappedLength } from '../src/engine/text.js';
import { check, summary } from './harness.mjs';

// 1 unit per Latin char/space, 2 units per CJK-or-other char.
const isAscii = (ch) => ch.charCodeAt(0) < 128;
const measure = (s) => [...s].reduce((n, ch) => n + (isAscii(ch) ? 1 : 2), 0);

console.log('\nbasic Latin wrapping (sanity check - not the main use case)');
{
  const lines = wrapText('the quick brown fox jumps', measure, 11);
  check('wraps at word boundaries', lines.every((l) => measure(l) <= 11), lines.join('|'));
  check('produces more than one line', lines.length > 1, lines.join('|'));
  check('no line starts or ends with a stray space',
    lines.every((l) => l === l.trim()), JSON.stringify(lines));
}

console.log('\nCJK wrapping with no spaces');
{
  const text = '五年前的那場戰爭，把這座島嶼變成了一片焦土，沒有人知道真相。';
  const lines = wrapText(text, measure, 20);
  check('every line fits within the box', lines.every((l) => measure(l) <= 20 + 2),
    lines.map((l) => `${l}(${measure(l)})`).join(' / '));
  check('no characters are lost or duplicated',
    lines.join('') === text, lines.join(''));
  check('produces multiple lines for a long paragraph', lines.length > 1);
}

console.log('\nkinsoku: forbidden line-start characters');
{
  // Force a break that would naturally land right before a closing bracket /
  // punctuation mark, and confirm it gets pulled back instead of leading a
  // new line with it.
  const text = '他說「不要回頭」，然後就消失在濃霧之中了。';
  for (let w = 6; w <= 30; w += 2) {
    const lines = wrapText(text, measure, w);
    const violations = lines.slice(1).filter((l) => '」』、。，！？：；'.includes(l[0]));
    check(`width ${w}: no line starts with forbidden punctuation`,
      violations.length === 0, JSON.stringify(lines));
    check(`width ${w}: text is preserved exactly`, lines.join('') === text);
  }
}

console.log('\nkinsoku: forbidden line-end characters');
{
  const text = '她低聲說道「你還記得我們的家嗎？」但沒有人回答。';
  for (let w = 6; w <= 30; w += 2) {
    const lines = wrapText(text, measure, w);
    const violations = lines.slice(0, -1).filter((l) => '「『'.includes(l[l.length - 1]));
    check(`width ${w}: no line ends with an opening bracket`,
      violations.length === 0, JSON.stringify(lines));
    check(`width ${w}: text is preserved exactly`, lines.join('') === text);
  }
}

console.log('\nmixed CJK and Latin/numeric runs stay intact');
{
  // A digit run is free to break from an adjacent CJK character (that is
  // normal CJK typesetting, same as breaking between any two ideographs) -
  // what must never happen is splitting *inside* "GPS" itself, since that is
  // one Latin word.
  const text = '失去意識長達5年之後，他在GPS訊號全滅的廢墟中醒來。';
  const lines = wrapText(text, measure, 14);
  const gpsLines = lines.filter((l) => l.includes('GPS'));
  check('"GPS" appears whole, never split across a line break',
    gpsLines.length === 1, JSON.stringify(lines));
  check('text is preserved exactly', lines.join('') === text);
}

console.log('\nexplicit newlines force a break');
{
  const lines = wrapText('第一行\n第二行', measure, 100);
  check('an explicit \\n always breaks the line', lines.length === 2, JSON.stringify(lines));
  check('each side of the newline is intact', lines[0] === '第一行' && lines[1] === '第二行');
}

console.log('\nedge cases');
{
  check('empty string produces one empty line, not zero lines',
    JSON.stringify(wrapText('', measure, 100)) === JSON.stringify(['']));

  const oneWord = wrapText('霧', measure, 100);
  check('a single character that fits produces one line', oneWord.length === 1 && oneWord[0] === '霧');

  // A pathological case: a run of Latin characters longer than the box, with
  // no space to break on. Must terminate and must not silently drop text.
  const long = 'a'.repeat(50);
  const forced = wrapText(long, measure, 10);
  check('an over-long unbreakable word is force-split rather than looping forever',
    forced.join('') === long, `${forced.length} lines`);
  check('every forced line respects the width budget',
    forced.every((l) => measure(l) <= 10));
}

console.log('\nwrappedLength');
{
  const lines = ['abc', 'de'];
  check('sums characters across all lines', wrappedLength(lines) === 5);
  check('empty input sums to zero', wrappedLength([]) === 0);
}

process.exit(summary() ? 0 : 1);
