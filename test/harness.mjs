// Headless test harness.
//
// The player, physics and level modules never touch the DOM, so the whole
// simulation can run in plain Node. That makes it possible to assert things
// that are genuinely hard to check in a browser - "is this gap clearable",
// "is this shaft climbable" - deterministically and in milliseconds.

import { Player } from '../src/game/player.js';

// Stand-in for Game: swallows every audiovisual side effect the player triggers.
export function stubGame() {
  return {
    loopFrame: 0,
    particles: { spawn() {}, burst() {}, update() {}, clear() {} },
    // Any audio method resolves to a no-op, so adding a new sound to the game
    // never breaks the tests.
    audio: new Proxy({}, { get: () => () => {} }),
    camera: { addTrauma() {} },
    freeze() {},
    bullets: [],
    spawnBullet(x, y, dx, dy, opts) { this.bullets.push({ x, y, dx, dy, ...opts }); },
    meleeHits: [],
    meleeAttack(rect, weapon, dir) { this.meleeHits.push({ rect, weapon, dir }); },
    deaths: 0,
    onPlayerDeath() { this.deaths++; },
  };
}

// Stand-in for Input. The controller function sets which actions are held each
// frame; press/release edges are derived exactly the way the real Input does.
export class StubInput {
  constructor() {
    this.actions = new Set();
    this.prev = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.axisX = 0;
    this.axisY = 0;
  }

  set(held) {
    this.actions = new Set(held);
    this.justPressed = new Set([...this.actions].filter((a) => !this.prev.has(a)));
    this.justReleased = new Set([...this.prev].filter((a) => !this.actions.has(a)));
    this.prev = new Set(this.actions);
    this.axisX = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    this.axisY = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
  }

  down(a) { return this.actions.has(a); }
  pressed(a) { return this.justPressed.has(a); }
  released(a) { return this.justReleased.has(a); }
}

const STEP = 1 / 60;

// Runs the simulation, calling `controller(player, frame)` each step to decide
// which actions are held. Returns a trace of the run.
// `stopWhen(player)` ends the run early once its objective is met, so a test
// measures the thing it asked about instead of whatever the bot does afterwards.
export function simulate({ map, startX, startY, controller, frames = 600, stopWhen }) {
  const game = stubGame();
  const input = new StubInput();
  const player = new Player(startX, startY, game);

  const trace = {
    player,
    game,
    minY: startY,
    maxX: startX,
    died: false,
    frames: 0,
  };

  for (let f = 0; f < frames; f++) {
    game.loopFrame = f;
    input.set(controller(player, f) ?? []);
    player.update(STEP, input, map);

    trace.minY = Math.min(trace.minY, player.y);
    trace.maxX = Math.max(trace.maxX, player.x);
    trace.frames = f + 1;
    if (!player.alive) {
      trace.died = true;
      break;
    }
    if (stopWhen && stopWhen(player)) {
      trace.reachedGoal = true;
      break;
    }
  }
  return trace;
}

// Builds a controller that holds jump for a stretch of frames instead of a
// single one. Variable jump height means a one-frame tap is deliberately cut to
// ~42% of full height, so any test that taps jump is testing the short hop, not
// the jump the level was designed around.
export function jumpHolder(holdFrames = 16, gapFrames = 6) {
  let hold = 0;
  let gap = 0;
  return {
    // Returns true while jump should be held this frame.
    tick() {
      if (hold > 0) {
        hold--;
        return true;
      }
      if (gap > 0) gap--;
      return false;
    },
    // Can a fresh jump be started? (needs a released frame in between so the
    // next press registers as an edge)
    ready() {
      return hold === 0 && gap === 0;
    },
    trigger() {
      hold = holdFrames;
      gap = gapFrames;
    },
  };
}

// Tiny assertion helpers so the tests read as a checklist.
let passed = 0;
let failed = 0;

export function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}
