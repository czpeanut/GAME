import { Scene } from '../../engine/scene.js';
import { drawOverlay, drawTitle, drawLine } from '../hud.js';

export class WinScene extends Scene {
  enter() {
    this.game.world.simulate = false;
  }

  exit() {
    this.game.world.simulate = true;
  }

  update(dt, input) {
    if (input.pressed('restart')) {
      this.game.scenes.pop();
      this.game.world.reload();
    }
  }

  render(ctx) {
    const w = this.game.world;
    drawOverlay(ctx, 0.6);
    drawTitle(ctx, 'ESCAPED', 128, 22, '#9af0ff');
    drawLine(ctx, `score  ${w.score}`, 158, '#eaf3ff');
    drawLine(ctx, `deaths ${w.deaths}`, 174);
    drawLine(ctx, `time   ${w.elapsed.toFixed(1)}s`, 190);
    drawLine(ctx, 'press R to play again', 216, '#c8d8f8');
  }
}
