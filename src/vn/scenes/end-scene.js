import { Scene } from '../../engine/scene.js';
import { VIEW } from '../constants.js';
import { THEME, paintSky, roundedRect } from '../theme.js';

// Shown once a script's dialogue graph has nowhere left to go. Not a "win/
// lose" screen - a practice script's whole point is repeatable attempts, so
// this just confirms it's over and offers to run it again.
export class EndScene extends Scene {
  enter() {
    this.game.audio.complete();
  }

  update(dt, input) {
    if (input.pressed('confirm')) this._restart();
  }

  pointerTap() {
    this._restart();
  }

  _restart() {
    this.game.startScript();
  }

  render(ctx) {
    paintSky(ctx, VIEW.width, VIEW.height);

    const cardW = VIEW.width - 64;
    const cardH = 190;
    const cardX = 32;
    const cardY = VIEW.height / 2 - cardH / 2;
    ctx.save();
    ctx.shadowColor = THEME.panelShadow;
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = THEME.panel;
    roundedRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.text;
    ctx.font = '28px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillText('今天就聊到這裡', VIEW.width / 2, cardY + 62);

    // Story vars only if the script kept any - a linear scene has none, and an
    // empty "0" would look like a score the player failed to get.
    const vars = this.game.story.vars;
    const summary = Object.keys(vars).length
      ? Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('　')
      : '';
    ctx.font = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = THEME.textSoft;
    if (summary) ctx.fillText(summary, VIEW.width / 2, cardY + 96);

    const label = '再聊一次';
    ctx.font = '17px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    const w = ctx.measureText(label).width + 52;
    const h = 46;
    const x = (VIEW.width - w) / 2;
    const y = cardY + cardH - 68;
    ctx.save();
    ctx.globalAlpha = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(performance.now() / 420));
    ctx.fillStyle = THEME.plate;
    roundedRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = THEME.plateText;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, VIEW.width / 2, y + h / 2 + 1);
    ctx.restore();
  }
}
