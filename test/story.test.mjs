// Story state and save/load tests.
//
// Node has no `localStorage` global, which is actually a useful test case in
// itself (it is exactly what a locked-down embed or an old runtime looks
// like) - the "no storage" path is exercised for free just by running under
// plain Node. A tiny in-memory fake is installed for the tests that need to
// verify persistence actually round-trips.

import { StoryState, DEFAULT_ABILITIES } from '../src/game/story-state.js';
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

console.log('\nabilities: unlocked by default (matches the pre-story game exactly)');
{
  const s = new StoryState();
  check('dash starts unlocked with no overrides', s.hasAbility('dash'));
  check('movement is unlocked by default', s.hasAbility('move'));
  check('every default ability is unlocked', ['fire', 'dash', 'doubleJump', 'wallJump']
    .every((a) => s.hasAbility(a)));
  check('granting an already-unlocked ability reports false', s.grantAbility('dash') === false);
  check('an unknown ability name reads as false rather than throwing',
    s.hasAbility('teleport') === false);
}

console.log('\nabilities: a level can opt into a gated, taught-in-stages start');
{
  const s = new StoryState({ fire: false, dash: false });
  check('overridden abilities start locked', !s.hasAbility('fire') && !s.hasAbility('dash'));
  check('abilities not mentioned in the override keep their default', s.hasAbility('doubleJump'));
  check('move is still unlocked even when other abilities are gated', s.hasAbility('move'));

  check('grantAbility reports true the first time', s.grantAbility('dash') === true);
  check('the ability now reads as unlocked', s.hasAbility('dash'));
  check('granting it again reports false', s.grantAbility('dash') === false);
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
    // Gated start, so granting fire (and leaving dash alone) is an observable
    // difference in the saved data rather than something true by default.
    const a = new StoryState({ fire: false, dash: false });
    a.setFlag('woke_up');
    a.setFlag('found_note');
    a.grantAbility('fire');
    a.setCheckpoint('opening', 'ward_exit');
    check('save succeeds when storage is available', a.save() === true);

    const b = new StoryState();
    check('a fresh instance does not see the save until load() is called',
      !b.hasFlag('woke_up'));
    check('load reports success', b.load() === true);
    check('flags survive the round-trip',
      b.hasFlag('woke_up') && b.hasFlag('found_note') && !b.hasFlag('never_set'));
    check('abilities survive the round-trip',
      b.hasAbility('fire') && !b.hasAbility('dash'));
    check('checkpoint survives the round-trip',
      b.levelId === 'opening' && b.checkpointId === 'ward_exit');
  } finally {
    delete globalThis.localStorage;
  }
}

console.log('\ncorrupted or foreign save data');
{
  globalThis.localStorage = fakeLocalStorage();
  try {
    localStorage.setItem('hollow-runner:save', 'not json at all {{{');
    const s = new StoryState({ dash: false });
    check('malformed JSON is rejected, not thrown', s.load() === false);
    check('rejecting a bad save leaves this instance\'s own starting state intact',
      !s.hasAbility('dash'));

    localStorage.setItem('hollow-runner:save', JSON.stringify({ v: 999, flags: ['x'] }));
    const s2 = new StoryState();
    check('a save from an incompatible future version is rejected', s2.load() === false);

    localStorage.setItem('hollow-runner:save', JSON.stringify({ v: 1, abilities: { dash: true } }));
    const s3 = new StoryState();
    check('a save missing fields loads with safe fallbacks for the rest',
      s3.load() === true && s3.hasAbility('dash') && s3.flags.size === 0 && s3.levelId === null);
  } finally {
    delete globalThis.localStorage;
  }
}

console.log('\nclear()');
{
  globalThis.localStorage = fakeLocalStorage();
  try {
    // Uses a gated start so granting dash is an observable change - clearing
    // a StoryState that started unlocked would trivially still read as
    // unlocked afterward and prove nothing.
    const s = new StoryState({ dash: false });
    s.setFlag('x');
    s.grantAbility('dash');
    s.save();
    s.clear();
    check('clear resets flags', !s.hasFlag('x'));
    check('clear resets abilities to this instance\'s own gated start, not the global default',
      !s.hasAbility('dash'));
    const fresh = new StoryState();
    check('clear also erases the persisted save', fresh.load() === false);
  } finally {
    delete globalThis.localStorage;
  }
}

console.log('\ndefault ability table');
{
  check('DEFAULT_ABILITIES has move enabled', DEFAULT_ABILITIES.move === true);
  check('DEFAULT_ABILITIES leaves everything unlocked by default',
    DEFAULT_ABILITIES.dash && DEFAULT_ABILITIES.doubleJump &&
    DEFAULT_ABILITIES.wallJump && DEFAULT_ABILITIES.fire);
}

process.exit(summary() ? 0 : 1);
