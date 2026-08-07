import { PLAYER, COLORS, VIEW } from './constants.js';
import { clamp } from '../engine/math.js';

// Screen-space overlay. Drawn after the camera transform is popped, so nothing
// here is affected by scrolling or screen shake.
export class HUD {
  constructor() {
    this.messageText = '';
    this.messageT = 0;
  }

  showMessage(text, duration = 2.2) {
    this.messageText = text;
    this.messageT = duration;
  }

  update(dt) {
    this.messageT -= dt;
  }

  render(ctx, game) {
    const p = game.player;

    this._health(ctx, p);
    this._dash(ctx, p);
    this._progress(ctx, game);
    this._score(ctx, game);

    if (this.messageT > 0) this._message(ctx);
    if (game.state === 'paused') this._pause(ctx);
    if (game.state === 'dead') this._dead(ctx, game);
    if (game.state === 'won') this._won(ctx, game);
    if (game.showDebug) this._debug(ctx, game);
  }

  _health(ctx, p) {
    for (let i = 0; i < PLAYER.maxHealth; i++) {
      const x = 12 + i * 17;
      const y = 12;
      const filled = i < p.health;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 1, y - 1, 14, 14);
      ctx.fillStyle = filled ? COLORS.hp : COLORS.hpLost;
      if (filled) {
        ctx.shadowColor = COLORS.hp;
        ctx.shadowBlur = 8;
      }
      // Diamond pips read better than squares at this size.
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 12, y + 6);
      ctx.lineTo(x + 6, y + 12);
      ctx.lineTo(x, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _dash(ctx, p) {
    const x = 12;
    const y = 32;
    const w = 66;
    const ready = p.hasDash && p.dashCd <= 0;
    const t = ready ? 1 : clamp(1 - p.dashCd / PLAYER.dashCooldown, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#243050';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = ready ? COLORS.playerDash : '#4a6ea0';
    if (ready) {
      ctx.shadowColor = COLORS.playerDash;
      ctx.shadowBlur = 8;
    }
    ctx.fillRect(x, y, w * t, 5);
    ctx.shadowBlur = 0;

    ctx.font = '7px monospace';
    ctx.fillStyle = ready ? '#bfe8ff' : '#6a7ea8';
    ctx.textAlign = 'left';
    ctx.fillText('DASH', x + w + 6, y + 5);
  }

  // A thin bar showing how far through the level the player is.
  _progress(ctx, game) {
    const w = 120;
    const x = VIEW.width - w - 12;
    const y = 14;
    const t = clamp(game.player.centerX / game.level.map.width, 0, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#243050';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = '#7fd4ff';
    ctx.fillRect(x, y, w * t, 3);

    ctx.font = '7px monospace';
    ctx.fillStyle = '#8fa7d8';
    ctx.textAlign = 'right';
    ctx.fillText(game.level.name.toUpperCase(), x + w, y - 4);
  }

  _score(ctx, game) {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#c8d8f8';
    ctx.textAlign = 'right';
    ctx.fillText(`${game.score}`, VIEW.width - 12, 32);
    ctx.font = '7px monospace';
    ctx.fillStyle = '#6a7ea8';
    ctx.fillText(`DEATHS ${game.deaths}`, VIEW.width - 12, 42);
  }

  _message(ctx) {
    const alpha = clamp(this.messageT, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const w = ctx.measureText(this.messageText).width + 20;
    ctx.fillRect(VIEW.width / 2 - w / 2, VIEW.height - 54, w, 18);
    ctx.fillStyle = '#dbe8ff';
    ctx.fillText(this.messageText, VIEW.width / 2, VIEW.height - 42);
    ctx.globalAlpha = 1;
  }

  _overlay(ctx, alpha = 0.68) {
    ctx.fillStyle = `rgba(6,8,16,${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  _title(ctx, text, y, size = 20, color = '#eaf3ff') {
    ctx.font = `${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, VIEW.width / 2, y);
  }

  _line(ctx, text, y, color = '#8fa7d8', size = 9) {
    ctx.font = `${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, VIEW.width / 2, y);
  }

  _pause(ctx) {
    this._overlay(ctx);
    this._title(ctx, 'PAUSED', 130);
    this._line(ctx, 'ESC / P  resume', 164);
    this._line(ctx, 'R  restart from checkpoint', 180);
    this._line(ctx, 'M  toggle sound', 196);
    this._line(ctx, '', 210);
    this._line(ctx, 'MOVE  A D / arrows      JUMP  SPACE / K', 226, '#6a7ea8', 8);
    this._line(ctx, 'FIRE  J / Z             DASH  SHIFT / L', 240, '#6a7ea8', 8);
    this._line(ctx, 'aim up or down while firing', 254, '#55688f', 8);
  }

  _dead(ctx, game) {
    this._overlay(ctx, 0.55);
    this._title(ctx, 'YOU DIED', 140, 20, '#ff8fa8');
    this._line(ctx, `deaths: ${game.deaths}`, 170);
    this._line(ctx, 'press R to respawn at the last checkpoint', 192, '#c8d8f8');
  }

  _won(ctx, game) {
    this._overlay(ctx, 0.6);
    this._title(ctx, 'ESCAPED', 128, 22, '#9af0ff');
    this._line(ctx, `score  ${game.score}`, 158, '#eaf3ff');
    this._line(ctx, `deaths ${game.deaths}`, 174);
    this._line(ctx, `time   ${game.elapsed.toFixed(1)}s`, 190);
    this._line(ctx, 'press R to play again', 216, '#c8d8f8');
  }

  _debug(ctx, game) {
    const p = game.player;
    const lines = [
      `fps   ${game.loop.fps.toFixed(0)}`,
      `pos   ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`,
      `vel   ${p.body.vx.toFixed(0)}, ${p.body.vy.toFixed(0)}`,
      `grnd  ${p.grounded}  wall ${p.body.wallLeft ? 'L' : ''}${p.body.wallRight ? 'R' : ''}`,
      `dash  ${p.dashT.toFixed(2)} cd ${Math.max(0, p.dashCd).toFixed(2)}`,
      `ents  e:${game.enemies.length} b:${game.bullets.length} p:${game.particles.activeCount}`,
    ];
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, VIEW.height - 8 - lines.length * 10, 150, lines.length * 10 + 4);
    ctx.fillStyle = '#8ff0a8';
    lines.forEach((l, i) => {
      ctx.fillText(l, 12, VIEW.height - 12 - (lines.length - 1 - i) * 10);
    });
  }
}
