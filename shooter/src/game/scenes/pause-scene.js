import { Scene } from '../../engine/scene.js';
import { drawOverlay, drawTitle, drawLine } from '../hud.js';

// A hard freeze: pushed on top of the world, which stops updating *anything*
// (not even ambient particles/background) while this is up, then resumes
// exactly where it left off on pop. Distinct from Title/Death/Win, which let
// the world keep breathing behind them.
export class PauseScene extends Scene {
  enter() {
    this.game.world.frozen = true;
  }

  exit() {
    this.game.world.frozen = false;
  }

  update(dt, input) {
    if (input.pressed('restart')) {
      this.game.scenes.pop();
      this.game.world.respawn();
    }
  }

  render(ctx) {
    drawOverlay(ctx);
    drawTitle(ctx, 'PAUSED', 130);
    drawLine(ctx, 'ESC / P  resume', 164);
    drawLine(ctx, 'R  restart from checkpoint', 180);
    drawLine(ctx, 'M  toggle sound', 196);
    drawLine(ctx, 'MOVE  A D / arrows      JUMP  SPACE / K', 220, '#6a7ea8', 8);
    drawLine(ctx, 'FIRE  J / Z             DASH  SHIFT / L', 234, '#6a7ea8', 8);
    drawLine(ctx, 'TALK  E                 aim up/down while firing', 248, '#55688f', 8);
  }
}
