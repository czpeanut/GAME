// Fixed-timestep game loop. Physics runs at a constant rate so that jump arcs,
// dash distances and knockback are identical on every machine; rendering happens
// once per animation frame with whatever the latest simulated state is.

const STEP = 1 / 60;
const MAX_FRAME = 0.25; // never simulate more than this in one frame (tab was hidden)

export class Loop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.accumulator = 0;
    this.last = 0;
    this.running = false;
    this.frame = 0;
    this.fps = 60;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
  }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);

    let delta = (now - this.last) / 1000;
    this.last = now;
    if (delta > MAX_FRAME) delta = MAX_FRAME;

    this.accumulator += delta;
    while (this.accumulator >= STEP) {
      this.update(STEP);
      this.accumulator -= STEP;
      this.frame++;
    }

    this.render(delta);

    this._fpsAccum += delta;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }
}

export { STEP };
