import { Scene } from '../../engine/scene.js';
import { drawOverlay, drawTitle, drawLine } from '../hud.js';

// Pushed the instant the player dies. The world underneath keeps its ambient
// tick (particles, background, camera) so the death particle burst keeps
// drifting and settling while this is up, but full simulation (physics,
// enemies, bullets) is suspended - re-derived death-drop motion aside, there
// is nothing left to simulate once the player is not moving under input.
//
// A short delay before `restart` is accepted stops a still-held key from the
// moment of death from instantly bouncing the player back in.
const RESTART_DELAY = 0.5;

export class DeathScene extends Scene {
  constructor(game) {
    super(game);
    this.t = 0;
  }

  enter() {
    this.game.world.simulate = false;
  }

  exit() {
    this.game.world.simulate = true;
  }

  update(dt, input) {
    this.t += dt;
    if (this.t > RESTART_DELAY && input.pressed('restart')) {
      this.game.scenes.pop();
      this.game.world.respawn();
    }
  }

  render(ctx) {
    drawOverlay(ctx, 0.55);
    drawTitle(ctx, 'YOU DIED', 140, 20, '#ff8fa8');
    drawLine(ctx, `deaths: ${this.game.world.deaths}`, 170);
    drawLine(ctx, 'press R to respawn at the last checkpoint', 192, '#c8d8f8');
  }
}
