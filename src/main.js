import { VIEW } from './game/constants.js';
import { Game } from './game/game.js';
import { Input } from './engine/input.js';
import { Loop } from './engine/loop.js';

// Bootstraps the canvas, wires up scaling, and starts the loop.
//
// The game always renders at a fixed internal resolution (VIEW) and the canvas
// is scaled to fit the window with integer-friendly maths. That keeps pixel
// sizes consistent everywhere instead of the world getting bigger on big
// monitors.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

canvas.width = VIEW.width;
canvas.height = VIEW.height;

// Crisp edges - this is a chunky pixel-ish look, so smoothing works against us.
ctx.imageSmoothingEnabled = false;

function resize() {
  const scale = Math.max(
    1,
    Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height)
  );
  // Snap to whole or half steps so tiles never land on fractional pixels.
  const snapped = scale >= 2 ? Math.floor(scale) : Math.floor(scale * 2) / 2;
  canvas.style.width = `${VIEW.width * snapped}px`;
  canvas.style.height = `${VIEW.height * snapped}px`;
}

window.addEventListener('resize', resize);
resize();

const input = new Input(window);

const loop = new Loop({
  update: (dt) => game.update(dt),
  render: () => game.render(),
});

const game = new Game(ctx, input, loop);

// Audio contexts must be created inside a user gesture; the title screen also
// unlocks on its own, this covers clicking the canvas directly.
const unlock = () => game.audio.unlock();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// Pausing on tab blur avoids the player returning to a corpse because enemies
// kept moving. The fixed-step loop already clamps huge deltas, but this is the
// behaviour a player expects.
window.addEventListener('blur', () => {
  if (game.state === 'playing') game.state = 'paused';
});

loop.start();

// Handy for poking at tuning values from the devtools console.
window.game = game;
