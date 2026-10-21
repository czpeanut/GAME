import { Scene } from '../../engine/scene.js';
import { VIEW } from '../constants.js';
import { UI_FONT } from '../hud.js';

// The title screen. Rendered on top of the (paused, hidden-HUD) world, so the
// player character is visible standing at the spawn point behind the text -
// deliberate, not a leftover: it is the cheapest possible "hello" a game can
// give before the player has touched anything.
export class TitleScene extends Scene {
  enter() {
    this.game.world.simulate = false;
    this.game.world.showHud = false;
  }

  exit() {
    this.game.world.simulate = true;
    this.game.world.showHud = true;
  }

  update(dt, input) {
    if (input.pressed('jump') || input.pressed('fire') || input.pressed('pause')) {
      this.game.audio.unlock();
      this.game.scenes.pop();
      if (this.game.onStart) this.game.onStart(this.game);
      else this.game.hud.showMessage(this.game.startMessage ?? '', 4);
    }
  }

  render(ctx) {
    const w = this.game.world;

    ctx.fillStyle = 'rgba(6,8,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf3ff';
    ctx.font = `26px ${UI_FONT}`;
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 18;
    ctx.fillText(this.game.title ?? 'HOLLOW RUNNER', VIEW.width / 2, 120);
    ctx.shadowBlur = 0;

    ctx.font = `9px ${UI_FONT}`;
    ctx.fillStyle = '#8fa7d8';
    ctx.fillText(this.game.subtitle ?? 'a 2D action shooter', VIEW.width / 2, 142);

    const rows = this.game.titleHints ?? [
      'MOVE      A D  /  arrows',
      'JUMP      SPACE  /  K        (hold higher, tap lower)',
      'FIRE      J  /  Z            (hold up or down to aim)',
      'DASH      SHIFT  /  L        (8 directions, i-frames)',
      'TALK      E                  (near a person or object)',
    ];
    ctx.font = `8px ${UI_FONT}`;
    rows.forEach((r, i) => {
      ctx.fillStyle = '#7f93c0';
      ctx.fillText(r, VIEW.width / 2, 186 + i * 14);
    });

    const blink = Math.sin(w.goalPulse * 4) > -0.3;
    if (blink) {
      ctx.font = `10px ${UI_FONT}`;
      ctx.fillStyle = '#9af0ff';
      ctx.fillText('press SPACE to begin', VIEW.width / 2, 286);
    }
  }
}
