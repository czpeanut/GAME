import { Scene } from '../../engine/scene.js';
import { DialogueRunner } from '../dialogue-runner.js';
import { wrapText } from '../../engine/text.js';
import { VIEW } from '../constants.js';

const BOX_MARGIN = 16;
const BOX_HEIGHT = 92;
const BOX_PAD = 14;
const LINE_HEIGHT = 16;
const FONT = '13px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
const NAME_FONT = '12px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';

// A conversation, drawn as a text box over the (frozen) world. Input is fully
// captured while this scene is on top: the player cannot move, shoot, or
// dash out from under a conversation.
//
// A separate PingFang/JhengHei/Noto stack is used here instead of the game's
// usual monospace HUD font because CJK glyphs in a monospace font are
// inconsistently supported and often fall back to a mismatched serif - a
// dedicated CJK-capable font stack renders Traditional Chinese correctly
// across platforms, which the rest of the (Latin-only) UI does not need to
// worry about.
export class DialogueScene extends Scene {
  constructor(game, script, opts = {}) {
    super(game);
    this.runner = new DialogueRunner(script, {
      world: game.world,
      game,
      charsPerSecond: opts.charsPerSecond ?? 42,
    });
    this.onClose = opts.onClose;
    this.wrapCache = null;
    this.wrapCacheKey = '';
  }

  enter() {
    this.game.world.simulate = false;
  }

  exit() {
    this.game.world.simulate = true;
    this.onClose?.(this.game.world, this.game);
  }

  update(dt, input) {
    this.runner.tick(dt);

    if (input.pressed('up')) this.runner.moveChoice(-1);
    if (input.pressed('down')) this.runner.moveChoice(1);
    if (input.pressed('interact') || input.pressed('fire') || input.pressed('jump')) {
      this.runner.confirm();
    }

    if (this.runner.finished) this.game.scenes.pop();
  }

  // Wraps the current line, caching by (text, box width) so a line that has
  // not changed is not re-measured on every single frame - measureText is not
  // free, and the typewriter reveal calls this every frame while typing.
  _wrappedLine(ctx, maxWidth) {
    const key = this.runner.nodeId + '|' + this.runner.lineIndex + '|' + maxWidth;
    if (this.wrapCacheKey !== key) {
      ctx.font = FONT;
      this.wrapCache = wrapText(this.runner.lineText, (s) => ctx.measureText(s).width, maxWidth);
      this.wrapCacheKey = key;
    }
    return this.wrapCache;
  }

  render(ctx) {
    const boxX = BOX_MARGIN;
    const boxY = VIEW.height - BOX_HEIGHT - BOX_MARGIN;
    const boxW = VIEW.width - BOX_MARGIN * 2;
    const boxH = BOX_HEIGHT;

    ctx.save();

    // Box. Nearly opaque - the persistent HUD message banner renders behind
    // this (world.showHud stays on during dialogue), and 0.88 alpha let it
    // show through as a distracting ghost when a banner happened to be up.
    ctx.fillStyle = 'rgba(8,10,20,0.97)';
    ctx.strokeStyle = 'rgba(127,212,255,0.4)';
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);

    // Speaker name tag.
    if (this.runner.speaker) {
      ctx.font = NAME_FONT;
      const nameW = ctx.measureText(this.runner.speaker).width + 16;
      ctx.fillStyle = 'rgba(127,212,255,0.85)';
      ctx.fillRect(boxX + 10, boxY - 11, nameW, 18);
      ctx.fillStyle = '#08131c';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.runner.speaker, boxX + 18, boxY - 2);
    }

    // Body text, wrapped and revealed up to the typewriter cursor.
    const lines = this._wrappedLine(ctx, boxW - BOX_PAD * 2);
    const revealed = this.runner.revealedText;

    ctx.font = FONT;
    ctx.fillStyle = '#eaf3ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let shown = 0;
    for (let i = 0; i < lines.length; i++) {
      const full = lines[i];
      const take = Math.max(0, Math.min(full.length, revealed.length - shown));
      const text = full.slice(0, take);
      shown += full.length;
      if (text) ctx.fillText(text, boxX + BOX_PAD, boxY + BOX_PAD + 6 + i * LINE_HEIGHT);
      if (take < full.length) break; // typewriter hasn't reached this line yet
    }

    if (this.runner.hasChoices && this.runner.isFullyRevealed) {
      this._renderChoices(ctx, boxX, boxY, boxW, boxH, lines.length);
    } else if (this.runner.isFullyRevealed) {
      this._renderContinuePrompt(ctx, boxX, boxY, boxW, boxH);
    }

    ctx.restore();
  }

  _renderChoices(ctx, boxX, boxY, boxW, boxH, bodyLines) {
    const choices = this.runner.choices;
    const startY = boxY + BOX_PAD + 6 + Math.max(bodyLines, 1) * LINE_HEIGHT + 6;

    ctx.font = FONT;
    choices.forEach((c, i) => {
      const y = startY + i * LINE_HEIGHT;
      const active = i === this.runner.choiceIndex;
      ctx.fillStyle = active ? '#ffe9a8' : '#9fb6e8';
      ctx.fillText(active ? `▸ ${c.text}` : `　${c.text}`, boxX + BOX_PAD, y);
    });
  }

  _renderContinuePrompt(ctx, boxX, boxY, boxW, boxH) {
    const blink = Math.sin(this.runner.revealT * 6) > 0;
    if (!blink) return;
    ctx.fillStyle = '#7fd4ff';
    ctx.textAlign = 'right';
    ctx.font = FONT;
    ctx.fillText('▼', boxX + boxW - BOX_PAD, boxY + boxH - 10);
  }
}
