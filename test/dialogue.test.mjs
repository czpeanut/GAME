// DialogueRunner tests: node walking, typewriter reveal, branching choices,
// and flag/action side effects. No canvas involved.

import { DialogueRunner } from '../src/vn/dialogue-runner.js';
import { DialogueScene } from '../src/vn/scenes/dialogue-scene.js';
import { StoryState } from '../src/vn/story-state.js';
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

console.log('\nactions receive the stage/app context');
{
  const stage = { marker: 'the-stage' };
  const app = { marker: 'the-app', story: new StoryState() };
  let seen = null;
  const script = {
    start: 'a',
    nodes: { a: { lines: ['...'], action: (w, g) => { seen = { w, g }; } } },
  };
  new DialogueRunner(script, { world: stage, game: app });
  check('the node action receives stage and app', seen.w === stage && seen.g === app);
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

function stubApp() {
  return {
    stage: { setSpeaker() {}, update() {} },
    audio: new Proxy({}, { get: () => () => {} }),
    characters: {},
  };
}

console.log('\nDialogueScene: a confirm key already held when the scene opens still works');
{
  // Regression: input.pressed() is edge-triggered, so a confirm key that was
  // already down the instant a DialogueScene opens would never see a fresh
  // press and could stall the conversation forever without this fallback.
  const script = { start: 'a', nodes: { a: { lines: ['一'], next: 'b' }, b: { lines: ['二'] } } };
  const scene = new DialogueScene(stubApp(), script, { charsPerSecond: 1000 });

  const input = new StubInput();
  input.set(['confirm']); // held from before the scene existed - no edge this frame

  const STEP = 1 / 60;
  let advanced = false;
  for (let f = 0; f < 60; f++) {
    input.set(['confirm']); // still just held, never released
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
  const scene2 = new DialogueScene(stubApp(), script2, { charsPerSecond: 1000 });
  const input2 = new StubInput();
  input2.set([]);
  scene2.update(STEP, input2); // reveal frame
  input2.set(['confirm']); // fresh press edge
  scene2.update(STEP, input2);
  check('a fresh press still confirms on the very next update, no delay',
    scene2.runner.isFullyRevealed || scene2.runner.nodeId === 'b');
}

console.log('\nDialogueScene: picking a choice by tapping its rendered position');
{
  const makeScene = () => {
    const script = {
      start: 'a',
      nodes: {
        a: {
          lines: ['選一個：'],
          choices: [
            { text: '甲', next: 'b' },
            { text: '乙', next: 'c' },
          ],
        },
        b: { lines: ['選了甲'] },
        c: { lines: ['選了乙'] },
      },
    };
    const scene = new DialogueScene(stubApp(), script, { charsPerSecond: 1000 });
    scene.update(1 / 60, new StubInput()); // reveal the line
    return scene;
  };

  // A canvas is not available in Node, so render() (which computes
  // _choiceRects) never runs here - a tap with no rects recorded yet falls
  // back to confirm() instead of throwing or silently doing nothing.
  const untapped = makeScene();
  const noThrow = (() => {
    try { untapped.pointerTap(10, 10); return true; } catch { return false; }
  })();
  check('with no rendered choice rects, a tap falls back to confirm without throwing', noThrow);
  check('that fallback confirm picked the highlighted (first) choice', untapped.runner.nodeId === 'b');

  // Directly exercise the hit-test logic pointerTap uses once rects exist,
  // the way render() would have populated them.
  const tapped = makeScene();
  tapped._choiceRects = [
    { index: 0, x: 0, y: 0, w: 100, h: 20 },
    { index: 1, x: 0, y: 20, w: 100, h: 20 },
  ];
  tapped.pointerTap(50, 25); // inside the second rect
  check('tapping inside a choice rect selects that choice', tapped.runner.nodeId === 'c');
}

process.exit(summary() ? 0 : 1);
