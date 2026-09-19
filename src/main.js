import { VIEW } from './vn/constants.js';
import { App } from './vn/app.js';
import { Input } from './engine/input.js';
import { Loop } from './engine/loop.js';
import { createDemoCharacters } from './vn/content/demo-characters.js';
import { DEMO_SCRIPT } from './vn/content/demo-script.js';

// Bootstraps the canvas, wires up scaling, and starts the loop.
//
// The app always renders at a fixed internal resolution (VIEW) and the canvas
// is scaled to fit the window with integer-friendly maths, so portraits and
// text land in the same place on every screen size.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

canvas.width = VIEW.width;
canvas.height = VIEW.height;

// Portrait/background art is illustration, not pixel art - smooth scaling
// looks right here, unlike a chunky pixel game.
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

function resize() {
  const scale = Math.max(
    0.1,
    Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height)
  );
  canvas.style.width = `${VIEW.width * scale}px`;
  canvas.style.height = `${VIEW.height * scale}px`;
}

window.addEventListener('resize', resize);
resize();

const input = new Input(window);

const loop = new Loop({
  update: (dt) => app.update(dt),
  render: () => app.render(),
});

const app = new App(ctx, input, loop, {
  title: '想問就問',
  subtitle: '對話練習範例：怎麼開口問問題',
  script: DEMO_SCRIPT,
  charactersFactory: createDemoCharacters,
});

// A tap/click anywhere on the canvas advances dialogue or picks whatever
// choice/button is under it - the Pointer Events API unifies mouse, touch
// and pen, so this one listener covers every input device without a
// separate on-screen button overlay.
canvas.addEventListener('pointerdown', (e) => {
  app.audio.unlock();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * VIEW.width;
  const y = ((e.clientY - rect.top) / rect.height) * VIEW.height;
  app.pointerTap(x, y);
});

loop.start();

// Handy for poking at state from the devtools console.
window.app = app;
