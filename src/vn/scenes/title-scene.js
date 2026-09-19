import { Scene } from '../../engine/scene.js';
import { VIEW } from '../constants.js';
import { THEME, paintSky, roundedRect } from '../theme.js';

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
    paintSky(ctx, VIEW.width, VIEW.height);

    // A few soft blossoms drifting behind the title. Cheap (six circles, no
    // art) but it stops the screen reading as a blank gradient.
    const t = performance.now() / 1000;
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const x = VIEW.width * (0.12 + 0.16 * i) + Math.sin(t * 0.4 + i) * 18;
      const y = ((t * 14 + i * 190) % (VIEW.height + 120)) - 60;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = i % 2 ? '#ffb7c5' : '#ffd3cf';
      ctx.beginPath();
      ctx.arc(x, y, 14 + (i % 3) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.titleText;
    ctx.font = '46px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    ctx.shadowColor = THEME.titleGlow;
    ctx.shadowBlur = 18;
    ctx.fillText(this.game.title, VIEW.width / 2, VIEW.height / 2 - 24);
    ctx.shadowBlur = 0;

    if (this.game.subtitle) {
      ctx.font = '17px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
      ctx.fillStyle = THEME.textSoft;
      ctx.fillText(this.game.subtitle, VIEW.width / 2, VIEW.height / 2 + 18);
    }

    // A soft pill, pulsing rather than blinking.
    const label = '點擊畫面或按 Enter 開始';
    ctx.font = '17px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
    const w = ctx.measureText(label).width + 44;
    const h = 44;
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height / 2 + 66;
    ctx.save();
    ctx.globalAlpha = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(performance.now() / 420));
    ctx.fillStyle = THEME.plate;
    roundedRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = THEME.plateText;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, VIEW.width / 2, y + h / 2 + 1);
    ctx.restore();
  }
}
