// DialogueRunner tests: node walking, typewriter reveal, branching choices,
// and flag/action side effects. No canvas involved.

import { DialogueRunner } from '../src/game/dialogue-runner.js';
import { DialogueScene } from '../src/game/scenes/dialogue-scene.js';
import { StoryState } from '../src/game/story-state.js';
import { StubInput, check, summary } from './harness.mjs';

console.log('\nlinear script: lines advance, then the conversation ends');
{
  const script = {
    start: 'a',
    nodes: {
      a: { speaker: '???', lines: ['第一句。', '第二句。'] },
    },
  };
  const d = new DialogueRunner(script, { charsPerSecond: 1000 });
  check('starts on the first line', d.lineText === '第一句。');
  check('not finished yet', !d.finished);

  d.tick(10); // reveal fully
  check('typewriter reveals the whole line given enough time', d.revealedText === '第一句。');

  d.confirm(); // advance to line 2 (already fully revealed, no choices, not last line)
  check('confirm advances to the next line', d.lineText === '第二句。');

  d.tick(10);
  d.confirm(); // last line, no next, no choices -> ends
  check('confirming past the final line with nowhere to go ends the conversation',
    d.finished === true);
}

console.log('\ntypewriter: confirm mid-reveal snaps to full text instead of advancing');
{
  const script = { start: 'a', nodes: { a: { lines: ['一二三四五'] } } };
  const d = new DialogueRunner(script, { charsPerSecond: 1 }); // very slow reveal
  d.tick(0.001);
  check('only a little text is revealed so far', d.revealedText.length < 5);

  d.confirm();
  check('confirm while typing reveals the rest of the line immediately',
    d.revealedText === '一二三四五');
  check('the conversation has not advanced past this line yet (single-line node ends here)',
    d.finished === false, 'confirm should have only finished the reveal, not advanced');
}

console.log('\nnode chaining via `next`');
{
  const script = {
    start: 'a',
    nodes: {
      a: { lines: ['A'], next: 'b' },
      b: { lines: ['B'], next: 'c' },
      c: { lines: ['C'] },
    },
  };
  const d = new DialogueRunner(script, { charsPerSecond: 1000 });
  d.tick(1); d.confirm(); // finish node a -> enters b
  check('advances from node a to node b', d.nodeId === 'b' && d.lineText === 'B');
  d.tick(1); d.confirm(); // finish node b -> enters c
  check('advances from node b to node c', d.nodeId === 'c' && d.lineText === 'C');
  d.tick(1); d.confirm(); // finish node c -> no next, ends
  check('ends after the final node with no `next`', d.finished === true);
}

console.log('\nbranching choices');
{
  let choseKind = null;
  const script = {
    start: 'ask',
    nodes: {
      ask: {
        lines: ['你要跟他走嗎？'],
        choices: [
          { text: '跟他走', next: 'follow' },
          { text: '不要', next: 'refuse' },
        ],
      },
      follow: { lines: ['好。'], action: () => { choseKind = 'follow'; } },
      refuse: { lines: ['……'], action: () => { choseKind = 'refuse'; } },
    },
  };
  const d = new DialogueRunner(script, { charsPerSecond: 1000 });
  d.tick(1);
  check('reaching the last line with choices exposes them', d.hasChoices === true);
  check('choice index starts at zero', d.choiceIndex === 0);

  d.moveChoice(1);
  check('moveChoice advances the selection', d.choiceIndex === 1);
  d.moveChoice(1);
  check('moveChoice wraps around past the last option', d.choiceIndex === 0);
  d.moveChoice(-1);
  check('moveChoice wraps backward past the first option', d.choiceIndex === 1);

  d.confirm(); // selects index 1 -> "不要" -> refuse
  check('confirm picks the currently highlighted choice', d.nodeId === 'refuse');
  check('the chosen branch\'s action ran', choseKind === 'refuse');
}

console.log('\nflags: node and choice flags reach StoryState');
{
  const story = new StoryState();
  const script = {
    start: 'a',
    nodes: {
      a: {
        lines: ['...'],
        flag: 'entered_convo',
        choices: [{ text: 'ok', next: 'b', flag: 'agreed' }],
      },
      b: { lines: ['...'] },
    },
  };
  const d = new DialogueRunner(script, { game: { story }, charsPerSecond: 1000 });
  check('entering a node with a flag sets it immediately', story.hasFlag('entered_convo'));
  d.tick(1);
  d.confirm(); // picks the only choice
  check('picking a choice with a flag sets it', story.hasFlag('agreed'));
}

console.log('\nactions receive the world/game context');
{
  const world = { marker: 'the-world' };
  const game = { marker: 'the-game', story: new StoryState() };
  let seen = null;
  const script = {
    start: 'a',
    nodes: { a: { lines: ['...'], action: (w, g) => { seen = { w, g }; } } },
  };
  new DialogueRunner(script, { world, game });
  check('the node action receives world and game', seen.w === world && seen.g === game);
}

console.log('\nrobustness');
{
  const script = { start: 'a', nodes: { a: { lines: ['x'], next: 'missing' } } };
  const d = new DialogueRunner(script, { charsPerSecond: 1000 });
  d.tick(1);
  d.confirm(); // next points nowhere
  check('an unresolvable `next` ends the conversation instead of throwing',
    d.finished === true);

  const empty = new DialogueRunner({ start: 'a', nodes: { a: { lines: [] } } });
  check('a node with zero lines does not throw on construction or confirm', (() => {
    try { empty.confirm(); return true; } catch { return false; }
  })());

  const noGame = new DialogueRunner({ start: 'a', nodes: { a: { lines: ['x'], flag: 'f' } } });
  check('a flag on a node with no game/story attached does not throw', !noGame.finished);
}

console.log('\nDialogueScene: a confirm key already held when the box opens still works');
{
  // Regression: input.pressed() is edge-triggered, so a fire/interact key
  // that was already down the instant a DialogueScene opens (very plausible
  // once melee combat made "hold fire" normal) would never see a fresh press
  // and could stall the conversation forever without this fallback.
  const script = { start: 'a', nodes: { a: { lines: ['一'], next: 'b' }, b: { lines: ['二'] } } };
  const popped = { value: false };
  const game = { world: {}, scenes: { pop: () => { popped.value = true; } } };
  const scene = new DialogueScene(game, script, { charsPerSecond: 1000 });

  const input = new StubInput();
  input.set(['fire']); // held from before the scene existed - no edge this frame

  const STEP = 1 / 60;
  let advanced = false;
  for (let f = 0; f < 60; f++) {
    input.set(['fire']); // still just held, never released
    scene.update(STEP, input);
    if (scene.runner.nodeId === 'b') {
      advanced = true;
      break;
    }
  }
  check('a continuously-held confirm key eventually advances the dialogue',
    advanced, `ended on node "${scene.runner.nodeId}" after up to 1s of holding`);

  // A quick tap still behaves exactly as before: no artificial delay.
  const script2 = { start: 'a', nodes: { a: { lines: ['一'], next: 'b' }, b: { lines: ['二'] } } };
  const scene2 = new DialogueScene(game, script2, { charsPerSecond: 1000 });
  const input2 = new StubInput();
  input2.set([]);
  scene2.update(STEP, input2); // reveal frame
  input2.set(['fire']); // fresh press edge
  scene2.update(STEP, input2);
  check('a fresh press still confirms on the very next update, no delay',
    scene2.runner.isFullyRevealed || scene2.runner.nodeId === 'b');
}

process.exit(summary() ? 0 : 1);
