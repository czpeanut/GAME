// Frame timing for sprite animations. No DOM, no canvas - it only tracks which
// frame index should be showing, so it is testable in plain Node.

export class Animator {
  constructor(anims, initial) {
    this.anims = anims;
    this.name = initial ?? Object.keys(anims)[0];
    this.time = 0;
    this.frame = 0;
    this.finished = false;
  }

  get current() {
    return this.anims[this.name];
  }

  get row() {
    return this.current.row;
  }

  // Switching to the animation already playing is a no-op unless `restart` is
  // set, otherwise a held state would reset to frame 0 every update.
  play(name, restart = false) {
    if (!this.anims[name]) return;
    if (this.name === name && !restart) return;
    this.name = name;
    this.time = 0;
    this.frame = 0;
    this.finished = false;
  }

  update(dt, timeScale = 1) {
    const anim = this.current;
    if (!anim) return;

    this.time += dt * timeScale;
    const frameDur = 1 / anim.fps;
    const index = Math.floor(this.time / frameDur);

    if (anim.loop) {
      this.frame = index % anim.frames;
    } else if (index >= anim.frames - 1) {
      // Non-looping animations hold on their last frame.
      this.frame = anim.frames - 1;
      this.finished = true;
    } else {
      this.frame = index;
    }
  }
}
