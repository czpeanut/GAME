import { Scene } from '../../engine/scene.js';
import { VIEW } from '../constants.js';

// The title screen: game name, a one-line subtitle, and "點擊開始" -
// deliberately the only thing on screen so it reads clearly on a phone.
export class TitleScene extends Scene {
  update(dt, input) {
    if (input.pressed('confirm')) this._start();
  }

  pointerTap() {
    this._start();
  }

  _start() {
    this.game.audio.unlock();
    this.game.audio.confirm();
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
    ctx.font = '44px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 22;
    ctx.fillText(this.game.title, VIEW.width / 2, VIEW.height / 2 - 20);
    ctx.shadowBlur = 0;

    if (this.game.subtitle) {
      ctx.font = '18px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
      ctx.fillStyle = '#8fa7d8';
      ctx.fillText(this.game.subtitle, VIEW.width / 2, VIEW.height / 2 + 20);
    }

    const blink = Math.sin(performance.now() / 220) > -0.3;
    if (blink) {
      ctx.font = '18px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
      ctx.fillStyle = '#9af0ff';
      ctx.fillText('點擊畫面或按 Enter 開始', VIEW.width / 2, VIEW.height / 2 + 80);
    }
  }
}
