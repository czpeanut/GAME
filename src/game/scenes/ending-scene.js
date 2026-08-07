import { Scene } from '../../engine/scene.js';
import { drawOverlay, drawTitle, drawLine } from '../hud.js';

// A generic narrative close: heading + a few lines, dismissed with restart.
// Distinct from WinScene (which reports score/deaths/time - appropriate for
// the combat-arcade level, meaningless for a story beat) so a level's ending
// can say whatever it needs to without borrowing scoreboard language.
export class EndingScene extends Scene {
  constructor(game, opts = {}) {
    super(game);
    this.heading = opts.heading ?? 'THE END';
    this.lines = opts.lines ?? [];
    this.color = opts.color ?? '#9af0ff';
    // Defaults to reloading the current level; content that wants "return to
    // title" or "advance to the next level" instead can override this.
    this.onRestart = opts.onRestart ?? ((world) => world.reload());
  }

  enter() {
    this.game.world.simulate = false;
  }

  exit() {
    this.game.world.simulate = true;
  }

  update(dt, input) {
    if (input.pressed('restart')) {
      this.game.scenes.pop();
      this.onRestart(this.game.world, this.game);
    }
  }

  render(ctx) {
    drawOverlay(ctx, 0.8);
    drawTitle(ctx, this.heading, 120, 20, this.color);
    this.lines.forEach((l, i) => drawLine(ctx, l, 156 + i * 18, '#c8d8f8', 10));
    drawLine(ctx, 'press R', 320, '#7f93c0', 8);
  }
}
