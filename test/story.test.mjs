// Story state and save/load tests.
//
// Node has no `localStorage` global, which is actually a useful test case in
// itself (it is exactly what a locked-down embed or an old runtime looks
// like) - the "no storage" path is exercised for free just by running under
// plain Node. A tiny in-memory fake is installed for the tests that need to
// verify persistence actually round-trips.

import { StoryState } from '../src/vn/story-state.js';
import { check, summary } from './harness.mjs';

function fakeLocalStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _data: data,
  };
}

console.log('\nflags');
{
  const s = new StoryState();
  check('a flag starts unset', !s.hasFlag('met_stranger'));
  check('setFlag reports true the first time', s.setFlag('met_stranger') === true);
  check('the flag now reads as set', s.hasFlag('met_stranger'));
  check('setFlag reports false once already set', s.setFlag('met_stranger') === false);
}

console.log('\nvars: numeric progress (score, affinity, attempts, ...)');
{
  const s = new StoryState();
  check('an unset var reads as the given fallback', s.getVar('score', 0) === 0);
  check('addVar creates the var starting from 0 by default', s.addVar('score') === 1);
  check('addVar accumulates', s.addVar('score', 2) === 3);
  check('the var now reads back the accumulated value', s.getVar('score') === 3);
  s.setVar('score', 10);
  check('setVar overwrites directly', s.getVar('score') === 10);
  check('addVar can go negative (a wrong-answer penalty, say)', s.addVar('score', -3) === 7);
}

console.log('\nwithout storage available (plain Node, locked-down webview, etc.)');
{
  check('localStorage is absent in this test environment', typeof localStorage === 'undefined');
  const s = new StoryState();
  check('constructing with no storage does not throw', true);
  check('save() reports failure rather than throwing', s.save() === false);
  check('load() reports failure rather than throwing', s.load() === false);
  s.setFlag('x');
  check('gameplay state still works with no persistence', s.hasFlag('x'));
}

console.log('\nsave / load round-trip (with a fake storage backend)');
{
  globalThis.localStorage = fakeLocalStorage();
  try {
    const a = new StoryState();
    a.setFlag('asked_well');
    a.addVar('score', 2);
    a.setCheckpoint('intro');
    check('save succeeds when storage is available', a.save() === true);

    const b = new StoryState();
    check('a fresh instance does not see the save until load() is called',
      !b.hasFlag('asked_well'));
    check('load reports success', b.load() === true);
    check('flags survive the round-trip',
      b.hasFlag('asked_well') && !b.hasFlag('never_set'));
    check('vars survive the round-trip', b.getVar('score') === 2);
    check('the checkpoint survives the round-trip', b.sceneId === 'intro');
  } finally {
    delete globalThis.localStorage;
  }
}

console.log('\ncorrupted or foreign save data');
{
  globalThis.localStorage = fakeLocalStorage();
  try {
    localStorage.setItem('vn-dialogue:save', 'not json at all {{{');
    const s = new StoryState();
    s.setFlag('kept');
    check('malformed JSON is rejected, not thrown', s.load() === false);
    check('rejecting a bad save leaves this instance\'s own state intact', s.hasFlag('kept'));

    localStorage.setItem('vn-dialogue:save', JSON.stringify({ v: 999, flags: ['x'] }));
    const s2 = new StoryState();
    check('a save from an incompatible future version is rejected', s2.load() === false);

    localStorage.setItem('vn-dialogue:save', JSON.stringify({ v: 1, vars: { score: 5 } }));
    const s3 = new StoryState();
    check('a save missing fields loads with safe fallbacks for the rest',
      s3.load() === true && s3.getVar('score') === 5 && s3.flags.size === 0 && s3.sceneId === null);
  } finally {
    delete globalThis.localStorage;
  }
}

console.log('\nclear()');
{
  globalThis.localStorage = fakeLocalStorage();
  try {
    const s = new StoryState();
    s.setFlag('x');
    s.addVar('score', 5);
    s.save();
    s.clear();
    check('clear resets flags', !s.hasFlag('x'));
    check('clear resets vars', s.getVar('score') === 0);
    const fresh = new StoryState();
    check('clear also erases the persisted save', fresh.load() === false);
  } finally {
    delete globalThis.localStorage;
  }
}

process.exit(summary() ? 0 : 1);
