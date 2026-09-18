// Splitting an answer into the pieces that get synthesised one at a time.
// Getting this wrong is audible: too many pieces and the speech stutters
// between requests, too few and the first one takes as long as the old
// whole-answer wait did.

import { splitSentences, MAX_LENGTH, FIRST_MAX_LENGTH } from '../public/src/puppet/sentences.js';
import { check, summary } from './harness.mjs';

console.log('\nsplits on Chinese sentence endings');
{
  const pieces = splitSentences('先把題目念一次。再說說你卡在哪一步。我陪你一起看看。');
  check('three sentences become three pieces', pieces.length === 3, JSON.stringify(pieces));
  check('the full stops stay attached', pieces.every((p) => p.endsWith('。')));
  check('nothing is lost', pieces.join('') === '先把題目念一次。再說說你卡在哪一步。我陪你一起看看。');
}

console.log('\nquestion and exclamation marks end a sentence too');
{
  // Each clause here is long enough to be worth its own request; a shorter one
  // would be merged into its neighbour on purpose, which the next block covers.
  const pieces = splitSentences('你看得懂這題在問什麼嗎？先從頭到尾念一次題目！然後告訴我哪裡卡住。');
  check('？ ！ and 。 all end a piece', pieces.length === 3, JSON.stringify(pieces));
  check('the marks stay with their own piece',
    pieces[0].endsWith('？') && pieces[1].endsWith('！') && pieces[2].endsWith('。'),
    JSON.stringify(pieces));
}

console.log('\na run of punctuation is one ending, not several');
{
  const pieces = splitSentences('這樣就對了！！！接下來換你試試看看好嗎。');
  check('"！！！" does not produce empty pieces', pieces.every((p) => p.trim().length > 0),
    JSON.stringify(pieces));
  check('it stays with the sentence it ends', pieces[0].endsWith('！！！'), JSON.stringify(pieces));
}

console.log('\nfragments too short to be worth a request get merged');
{
  const pieces = splitSentences('先讀一次題目看看。好嗎？');
  check('a short tail joins the sentence before it', pieces.length === 1, JSON.stringify(pieces));
  check('and the text is still complete', pieces[0] === '先讀一次題目看看。好嗎？');
}

console.log('\na long sentence with no full stop is broken at a comma');
{
  const long = '你先把題目從頭到尾念一次，然後把已知條件圈出來，再看看題目問的是什麼，最後才開始列式子計算答案';
  const pieces = splitSentences(long);
  check('it does not come back as one long piece', pieces.length > 1, JSON.stringify(pieces));
  check('every piece is within the length cap', pieces.every((p) => p.length <= MAX_LENGTH),
    pieces.map((p) => p.length).join(','));
  check('nothing is lost', pieces.join('') === long);
}

console.log('\nthe first piece - the only one anyone waits for - is kept short');
{
  const answer = '你先把題目從頭到尾念一次，把已知條件圈出來，再看看題目問的是什麼。這樣通常就找得到卡住的地方了。';
  const pieces = splitSentences(answer);
  check('the opening piece is within the tighter first cap',
    pieces[0].length <= FIRST_MAX_LENGTH, `${pieces[0].length}: ${pieces[0]}`);
  check('it still breaks at a comma rather than mid-phrase',
    /[，、；;,。！？!?]$/.test(pieces[0]), pieces[0]);
  check('and the whole answer survives', pieces.join('') === answer, JSON.stringify(pieces));

  const short = '先讀一次題目看看。好嗎？';
  check('a short answer is not chopped up for no reason',
    splitSentences(short).length === 1, JSON.stringify(splitSentences(short)));
}

console.log('\ntext with no punctuation at all still comes back');
{
  const pieces = splitSentences('好的我知道了');
  check('one piece', pieces.length === 1, JSON.stringify(pieces));
  check('unchanged', pieces[0] === '好的我知道了');
}

console.log('\nedge cases return nothing rather than an empty piece');
{
  check('empty string', splitSentences('').length === 0);
  check('whitespace only', splitSentences('   \n  ').length === 0);
  check('not a string', splitSentences(null).length === 0);
  check('punctuation only does not produce blanks',
    splitSentences('。。。').every((p) => p.trim().length > 0));
}

console.log('\nthe pieces always reassemble into the original');
{
  const samples = [
    '先讀題目。再想想看。',
    '這題要先通分，再把分子相加，最後約分。',
    '你說得對！不過還有一個條件沒有用到喔。要不要再看一次？',
    '答案是3.14嗎',
  ];
  check('no sample loses or gains characters',
    samples.every((s) => splitSentences(s).join('') === s.trim()),
    samples.map((s) => JSON.stringify(splitSentences(s))).join(' '));
}

process.exit(summary() ? 0 : 1);
