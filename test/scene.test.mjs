// Scene stack tests. Pure logic, no canvas - a scene here is just an object
// that records what happened to it, so the assertions are about ordering and
// dispatch, not drawing.

import { Scene, SceneStack } from '../src/engine/scene.js';
import { check, summary } from './harness.mjs';

function makeScene(log, name, overrides = {}) {
  class TestScene extends Scene {
    enter() { log.push(`${name}:enter`); }
    exit() { log.push(`${name}:exit`); }
    pause() { log.push(`${name}:pause`); }
    resume() { log.push(`${name}:resume`); }
    update() { log.push(`${name}:update`); }
    render() { log.push(`${name}:render`); }
    get updatesBelow() { return overrides.updatesBelow ?? true; }
    get rendersBelow() { return overrides.rendersBelow ?? true; }
  }
  return new TestScene({});
}

console.log('\npush / pop lifecycle');
{
  const log = [];
  const stack = new SceneStack({});
  const world = makeScene(log, 'world');
  const pause = makeScene(log, 'pause');

  stack.push(world);
  check('pushing calls enter', log.join() === 'world:enter');

  log.length = 0;
  stack.push(pause);
  check('pushing on top pauses the scene below, then enters the new one',
    log.join() === 'world:pause,pause:enter', log.join());

  log.length = 0;
  stack.pop();
  check('popping exits the popped scene, then resumes the one below',
    log.join() === 'pause:exit,world:resume', log.join());

  check('top reflects the current stack', stack.top === world);

  log.length = 0;
  stack.pop();
  check('popping the last scene does not resume anything (nothing below)',
    log.join() === 'world:exit', log.join());

  log.length = 0;
  const result = stack.pop();
  check('popping an empty stack is a safe no-op', result === undefined && log.length === 0);
}

console.log('\nupdate dispatch order');
{
  const log = [];
  const stack = new SceneStack({});
  stack.push(makeScene(log, 'world'));
  stack.push(makeScene(log, 'dialogue', { updatesBelow: false }));
  log.length = 0;
  stack.update(1 / 60, {});
  check('a scene that blocks below only lets the top scene update',
    log.join() === 'dialogue:update', log.join());
}
{
  const log = [];
  const stack = new SceneStack({});
  stack.push(makeScene(log, 'world'));
  stack.push(makeScene(log, 'overlay')); // updatesBelow defaults true
  log.length = 0;
  stack.update(1 / 60, {});
  check('a transparent-to-update scene lets the world underneath keep updating',
    log.join() === 'overlay:update,world:update', log.join());
}

console.log('\nrender dispatch order');
{
  const log = [];
  const stack = new SceneStack({});
  stack.push(makeScene(log, 'world'));
  stack.push(makeScene(log, 'dialogue')); // rendersBelow defaults true
  log.length = 0;
  stack.render({});
  check('render walks bottom-to-top so overlays draw on top of the world',
    log.join() === 'world:render,dialogue:render', log.join());
}
{
  const log = [];
  const stack = new SceneStack({});
  stack.push(makeScene(log, 'world'));
  stack.push(makeScene(log, 'fadeCut', { rendersBelow: false }));
  log.length = 0;
  stack.render({});
  check('a scene that hides what is below it is the only thing drawn',
    log.join() === 'fadeCut:render', log.join());
}

console.log('\nreplace');
{
  const log = [];
  const stack = new SceneStack({});
  stack.push(makeScene(log, 'title'));
  log.length = 0;
  stack.replace(makeScene(log, 'world'));
  check('replace pops the current top then pushes the new scene',
    log.join() === 'title:exit,world:enter', log.join());
  check('the stack has exactly the new scene at this depth', stack.stack.length === 1);
}

console.log('\nhas()');
{
  class Foo extends Scene {}
  class Bar extends Scene {}
  const stack = new SceneStack({});
  stack.push(new Foo({}));
  check('has() finds a pushed scene by class', stack.has(Foo));
  check('has() is false for a class never pushed', !stack.has(Bar));
}

process.exit(summary() ? 0 : 1);
