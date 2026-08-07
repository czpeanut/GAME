// StoryTrigger and Npc tests - pure logic, no rendering.

import { StoryTrigger, Npc } from '../src/game/trigger.js';
import { StoryState } from '../src/game/story-state.js';
import { check, summary } from './harness.mjs';

const inside = (x, y, w = 10, h = 10) => ({ x, y, w, h });
const rect = { x: 0, y: 0, w: 20, h: 20 };

console.log('\nStoryTrigger: basic firing');
{
  let fired = 0;
  const t = new StoryTrigger({ x: 0, y: 0, w: 20, h: 20, onEnter: () => fired++ });
  const game = { story: null };

  check('does not fire while outside', t.update(inside(100, 100), null, game) === false && fired === 0);
  check('fires the frame it enters', t.update(inside(5, 5), null, game) === true && fired === 1);
  check('does not re-fire while standing inside', t.update(inside(6, 6), null, game) === false && fired === 1);

  t.update(inside(100, 100), null, game); // leave
  check('does not re-fire on re-entry when once=true (default)',
    t.update(inside(5, 5), null, game) === false && fired === 1);
}

console.log('\nStoryTrigger: once=false repeats per entry');
{
  let fired = 0;
  const t = new StoryTrigger({ x: 0, y: 0, w: 20, h: 20, once: false, onEnter: () => fired++ });
  const game = { story: null };

  t.update(inside(5, 5), null, game);
  check('fires on first entry', fired === 1);
  t.update(inside(100, 100), null, game); // leave
  t.update(inside(5, 5), null, game); // re-enter
  check('fires again after leaving and re-entering', fired === 2);
  t.update(inside(6, 6), null, game); // still inside
  check('still does not fire twice for one continuous entry', fired === 2);
}

console.log('\nStoryTrigger: flag-backed permanence');
{
  const story = new StoryState();
  const game = { story };
  let fired = 0;
  const t = new StoryTrigger({ x: 0, y: 0, w: 20, h: 20, flag: 'saw_intro', onEnter: () => fired++ });

  t.update(inside(5, 5), null, game);
  check('fires once and sets the flag', fired === 1 && story.hasFlag('saw_intro'));

  // A brand new trigger instance (as if the level were reloaded) with the same
  // flag must not fire again - this is the whole point of using a flag instead
  // of the instance-local `fired` bit.
  const reloaded = new StoryTrigger({ x: 0, y: 0, w: 20, h: 20, flag: 'saw_intro', onEnter: () => fired++ });
  reloaded.update(inside(5, 5), null, game);
  check('a fresh instance backed by the same already-set flag does not fire',
    fired === 1);
}

console.log('\nStoryTrigger: works with no game.story at all');
{
  let fired = 0;
  const t = new StoryTrigger({ x: 0, y: 0, w: 20, h: 20, flag: 'x', onEnter: () => fired++ });
  const game = {}; // no .story property
  let threw = false;
  try {
    t.update(inside(5, 5), null, game);
  } catch {
    threw = true;
  }
  check('missing game.story does not throw', !threw);
  check('the trigger still fires when there is no story to consult', fired === 1);
}

console.log('\nNpc: proximity and interaction');
{
  let interacted = 0;
  const npc = new Npc({ x: 100, y: 100, onInteract: () => interacted++ });
  const near = { centerX: 108, centerY: 110, w: 20 };
  const far = { centerX: 500, centerY: 110, w: 20 };

  check('is not near a distant player', !npc.isNear(far));
  check('is near a player standing next to it', npc.isNear(near));

  npc.interact(null, null);
  check('interact runs the onInteract callback', interacted === 1);

  const noCallback = new Npc({ x: 0, y: 0 });
  let threw = false;
  try {
    noCallback.interact(null, null);
  } catch {
    threw = true;
  }
  check('an NPC with no onInteract does not throw on interact', !threw);
}

process.exit(summary() ? 0 : 1);
