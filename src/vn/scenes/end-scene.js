import { Scene } from '../../engine/scene.js';
import { VIEW } from '../constants.js';

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
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#141b33');
    grad.addColorStop(1, '#05070e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf3ff';
    ctx.font = '30px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillText('本段對話結束', VIEW.width / 2, VIEW.height / 2 - 30);

    ctx.font = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = '#9fb6e8';
    const vars = this.game.story.vars;
    const summary = Object.keys(vars).length
      ? Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('　')
      : '';
    if (summary) ctx.fillText(summary, VIEW.width / 2, VIEW.height / 2 + 10);

    ctx.font = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.fillStyle = '#9af0ff';
    ctx.fillText('點擊畫面或按 Enter 重新開始', VIEW.width / 2, VIEW.height / 2 + 60);
  }
}
