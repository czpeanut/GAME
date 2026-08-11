// CutsceneRunner tests: step sequencing, timers, instant steps, dialogue
// hand-off, fades and skip. No canvas involved.

import { CutsceneRunner } from '../src/game/cutscene-runner.js';
import { StoryState } from '../src/game/story-state.js';
import { check, summary } from './harness.mjs';

console.log('\nwait steps advance on their own timer');
{
  const c = new CutsceneRunner([{ type: 'wait', seconds: 1 }, { type: 'wait', seconds: 1 }]);
  check('starts on the first step', c.index === 0 && !c.finished);
  c.tick(0.5);
  check('does not advance before the timer elapses', c.index === 0);
  c.tick(0.6);
  check('advances once the timer elapses', c.index === 1);
  c.tick(1.1);
  check('finishes after the last step\'s timer elapses', c.finished === true);
}

console.log('\ninstantaneous steps run without needing a tick');
{
  const story = new StoryState();
  const calls = [];
  const c = new CutsceneRunner(
    [
      { type: 'setFlag', name: 'woke_up' },
      { type: 'grantAbility', name: 'wallJump' },
      { type: 'call', fn: () => calls.push('ran') },
      { type: 'wait', seconds: 1 },
    ],
    { game: { story } }
  );
  check('a run of instant steps all execute before construction returns',
    story.hasFlag('woke_up') && story.hasAbility('wallJump') && calls.join() === 'ran');
  check('the runner lands on the first step that actually needs time', c.index === 3);
}

console.log('\ndialogue hand-off');
{
  const c = new CutsceneRunner([
    { type: 'call', fn: () => {} },
    { type: 'dialogue', script: { start: 'a', nodes: { a: { lines: ['hi'] } } } },
    { type: 'wait', seconds: 1 },
  ]);
  check('stops at the dialogue step and waits for an external signal',
    c.waitingForDialogue === true && !c.finished);
  c.tick(5);
  check('tick() alone does not progress past a dialogue step', c.waitingForDialogue === true);

  c.dialogueFinished();
  check('dialogueFinished() moves on to the next step',
    c.waitingForDialogue === false && c.index === 2);
}

console.log('\nfade progress');
{
  const c = new CutsceneRunner([{ type: 'fadeIn', seconds: 2 }]);
  check('fadeIn starts fully opaque', Math.abs(c.fadeAlpha - 1) < 0.01, c.fadeAlpha);
  c.tick(1);
  check('fadeIn is partway clear at the halfway point', Math.abs(c.fadeAlpha - 0.5) < 0.05, c.fadeAlpha);

  const out = new CutsceneRunner([{ type: 'fadeOut', seconds: 2 }]);
  check('fadeOut starts fully clear', Math.abs(out.fadeAlpha - 0) < 0.01, out.fadeAlpha);
  out.tick(2.1);
  check('fadeOut ends fully opaque just before advancing',
    out.finished === true); // sequence has only one step, so it finishes here

  const nonFade = new CutsceneRunner([{ type: 'wait', seconds: 1 }]);
  check('fadeAlpha is null on a non-fade step', nonFade.fadeAlpha === null);
}

console.log('\nunknown step types are skipped, not fatal');
{
  const c = new CutsceneRunner([
    { type: 'not-a-real-step' },
    { type: 'wait', seconds: 1 },
  ]);
  check('an unrecognised step is skipped over automatically', c.index === 1 && !c.finished);
}

console.log('\nempty script finishes immediately');
{
  const c = new CutsceneRunner([]);
  check('a cutscene with no steps is immediately finished', c.finished === true);
}

console.log('\nskip()');
{
  const calls = [];
  const c = new CutsceneRunner([
    { type: 'wait', seconds: 10 },
    { type: 'call', fn: () => calls.push('a') },
    { type: 'wait', seconds: 10 },
    { type: 'call', fn: () => calls.push('b') },
  ]);
  c.skip();
  check('skip fast-forwards through every timer', c.finished === true);
  check('skip still runs the instantaneous steps along the way',
    calls.join() === 'a,b');
}
{
  // Skipping must not barrel through a dialogue step - that would tear down
  // whatever the scene layer is currently showing without its cooperation.
  const c = new CutsceneRunner([
    { type: 'dialogue', script: { start: 'a', nodes: { a: { lines: ['x'] } } } },
    { type: 'wait', seconds: 1 },
  ]);
  c.skip();
  check('skip stops at a dialogue step rather than skipping past it',
    c.waitingForDialogue === true && !c.finished);
}

process.exit(summary() ? 0 : 1);
