import { Scene } from '../../engine/scene.js';
import { DialogueRunner } from '../dialogue-runner.js';
import { wrapText } from '../../engine/text.js';
import { coverRect } from '../../engine/math.js';
import { VIEW, FONT, NAME_FONT } from '../constants.js';
import { THEME, roundedRect } from '../theme.js';

const BOX_MARGIN = 16;
const BOX_HEIGHT = 214;
const BOX_PAD = 24;
const LINE_HEIGHT = 30;
const BOX_RADIUS = 18;
// The box a portrait is drawn into. Its shape has to match the art's own
// aspect (both characters' part canvases are ~0.558 wide for their height) or
// the character is stretched; the SIZE is just how big she reads on screen.
const PORTRAIT_W = 422;
const PORTRAIT_H = 760;

// Closer together than a landscape layout could afford - VIEW is much
// narrower now, and two portraits at POSITION_X's spread naturally overlap a
// little near the dialogue box, which reads as "standing next to each
// other" rather than looking broken.
const POSITION_X = { left: 0.3, center: 0.5, right: 0.7 };

// A conversation: background, one or more animated/dressed-up portraits, and
// a dialogue box with typewriter text and branching choices. This is the
// whole "遊戲" for a practice script - DialogueRunner walks the node graph
// and this scene is purely its view + input handling (click/tap, keyboard,
// gamepad all funnel into the same runner calls).
export class DialogueScene extends Scene {
  constructor(app, script, opts = {}) {
    super(app);
    this.runner = new DialogueRunner(script, {
      world: app.stage,
      game: app,
      charsPerSecond: opts.charsPerSecond ?? 38,
    });
    this.onFinish = opts.onFinish;
    this._finishedHandled = false;
    this.wrapCache = null;
    this.wrapCacheKey = '';
    this._choiceRects = [];
    // A confirm key already held the instant this scene opens (e.g. the same
    // key that opened it) would never see a fresh press edge and could stall
    // the conversation forever - a continuously-held key still repeat-fires
    // confirm() after a short delay, the same affordance most text-heavy
    // games give a held key, without making a single tap double-advance.
    this._holdT = 0;
  }

  update(dt, input) {
    this.game.stage.setSpeaker(this.runner.speaker || null);
    this.game.stage.update(dt);
    this.runner.tick(dt);

    if (input.pressed('up')) {
      this.runner.moveChoice(-1);
      this.game.audio.select();
    }
    if (input.pressed('down')) {
      this.runner.moveChoice(1);
      this.game.audio.select();
    }

    const confirmPressed = input.pressed('confirm');
    const confirmHeld = input.down('confirm');
    if (confirmPressed) {
      this._confirm();
      this._holdT = 0;
    } else if (confirmHeld) {
      this._holdT += dt;
      if (this._holdT > 0.45) {
        this._confirm();
        this._holdT = 0;
      }
    } else {
      this._holdT = 0;
    }

    if (this.runner.finished && !this._finishedHandled) {
      this._finishedHandled = true;
      this.onFinish?.(this.game);
    }
  }

  _confirm() {
    const wasChoice = this.runner.hasChoices;
    this.runner.confirm();
    this.game.audio[wasChoice ? 'confirm' : 'click']();
  }

  pointerTap(x, y) {
    if (this.runner.finished) return;
    if (this.runner.hasChoices && this.runner.isFullyRevealed) {
      const hit = this._choiceRects.find(
        (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
      );
      if (hit) {
        this.runner.selectChoice(hit.index);
        this.game.audio.confirm();
        return;
      }
    }
    this._confirm();
  }

  // Wraps the current line, caching by (node, line, box width) so a line
  // that has not changed is not re-measured on every single frame -
  // measureText is not free, and the typewriter reveal calls this every
  // frame while typing.
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
    this._renderBackground(ctx);
    this._renderPortraits(ctx);
    this._renderBox(ctx);
  }

  _renderBackground(ctx) {
    // `stage.background` is a full filename (e.g. 'classroom.jpg'), not a
    // bare id - background art doesn't need transparency, so letting authors
    // use whichever of .jpg/.png/.webp suits the image avoids forcing a
    // lossless re-encode of a photo/painting just to match one convention.
    const bg = this.game.stage.background && this.game.images.get(`assets/backgrounds/${this.game.stage.background}`);
    if (bg?.ready) {
      // "Cover" fit: crop to the render's aspect ratio instead of stretching
      // - background art is rarely pre-cropped to exactly 960x540, and a
      // naive stretch visibly squashes/stretches it.
      const { sx, sy, sw, sh } = coverRect(bg.image.width, bg.image.height, VIEW.width, VIEW.height);
      ctx.drawImage(bg.image, sx, sy, sw, sh, 0, 0, VIEW.width, VIEW.height);
      return;
    }
    // No background art (yet) - a soft gradient reads as a placeholder
    // setting rather than a broken/blank frame.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#141b33');
    grad.addColorStop(1, '#05070e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  _renderPortraits(ctx) {
    // Feet anchor at the dialogue box's bottom edge, not its top - the box
    // is drawn after portraits (see render()) so it naturally covers each
    // character's legs, exactly like a real VN's characters standing
    // "behind" the text box. Anchoring at the box's *top* instead (as an
    // earlier version of this did) left too little headroom above for a
    // PORTRAIT_H-tall image and clipped heads off the top of the canvas.
    const feetY = VIEW.height - BOX_MARGIN;
    for (const { position, character } of this.game.stage.onStage) {
      const x = VIEW.width * (POSITION_X[position] ?? 0.5);
      const dim = this.game.stage.speakerId && this.game.stage.speakerId !== character.id;
      this.game.portraits.draw(
        ctx,
        character,
        this.game.stage.rigFor(character.id),
        this.game.stage.motionFor(character.id),
        {
          x,
          y: feetY,
          width: PORTRAIT_W,
          height: PORTRAIT_H,
          mirror: position === 'right',
          dim,
        }
      );
    }
  }

  _renderBox(ctx) {
    const boxX = BOX_MARGIN;
    const boxY = VIEW.height - BOX_HEIGHT - BOX_MARGIN;
    const boxW = VIEW.width - BOX_MARGIN * 2;
    const boxH = BOX_HEIGHT;

    ctx.save();

    // A soft panel rather than a hard-edged frame: rounded, warm, and lifted
    // off the art by a shadow instead of a hairline border.
    ctx.shadowColor = THEME.panelShadow;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = THEME.panel;
    roundedRect(ctx, boxX, boxY, boxW, boxH, BOX_RADIUS);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = THEME.panelEdge;
    ctx.lineWidth = 1;
    roundedRect(ctx, boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1, BOX_RADIUS);
    ctx.stroke();

    const speakerChar = this.game.characters[this.runner.speaker];
    const speakerName = speakerChar?.name ?? this.runner.speaker;
    if (speakerName) {
      ctx.font = NAME_FONT;
      const nameW = ctx.measureText(speakerName).width + 34;
      const plateH = 32;
      const plateY = boxY - plateH / 2 - 4;
      ctx.shadowColor = THEME.panelShadow;
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = THEME.plate;
      roundedRect(ctx, boxX + 18, plateY, nameW, plateH, plateH / 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = THEME.plateEdge;
      ctx.lineWidth = 1.5;
      roundedRect(ctx, boxX + 18, plateY, nameW, plateH, plateH / 2);
      ctx.stroke();

      ctx.fillStyle = THEME.plateText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(speakerName, boxX + 35, plateY + plateH / 2 + 1);
    }

    const lines = this._wrappedLine(ctx, boxW - BOX_PAD * 2);
    const revealed = this.runner.revealedText;

    ctx.font = FONT;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let shown = 0;
    let bodyLines = 0;
    for (let i = 0; i < lines.length; i++) {
      const full = lines[i];
      const take = Math.max(0, Math.min(full.length, revealed.length - shown));
      const text = full.slice(0, take);
      shown += full.length;
      if (text) {
        ctx.fillText(text, boxX + BOX_PAD, boxY + BOX_PAD + 10 + i * LINE_HEIGHT);
        bodyLines = i + 1;
      }
      if (take < full.length) break; // typewriter has not reached this line yet
    }

    this._choiceRects = [];
    if (this.runner.hasChoices && this.runner.isFullyRevealed) {
      this._renderChoices(ctx, boxX, boxY, boxW, bodyLines);
    } else if (this.runner.isFullyRevealed) {
      this._renderContinuePrompt(ctx, boxX, boxY, boxW, boxH);
    }

    ctx.restore();
  }

  _renderChoices(ctx, boxX, boxY, boxW, bodyLines) {
    const choices = this.runner.choices;
    const startY = boxY + BOX_PAD + 6 + Math.max(bodyLines, 1) * LINE_HEIGHT + 4;

    ctx.font = FONT;
    choices.forEach((c, i) => {
      const y = startY + i * LINE_HEIGHT;
      const active = i === this.runner.choiceIndex;
      const rowY = y - LINE_HEIGHT + 8;

      // The selected line gets a rose pill behind it rather than just a
      // different text colour - on a phone, in sunlight, colour alone is not
      // enough to show which option a tap is about to pick.
      if (active) {
        ctx.fillStyle = THEME.choicePill;
        roundedRect(ctx, boxX + BOX_PAD - 10, rowY, boxW - BOX_PAD * 2 + 20, LINE_HEIGHT - 2, (LINE_HEIGHT - 2) / 2);
        ctx.fill();
      }
      ctx.fillStyle = active ? THEME.choiceActive : THEME.choice;
      ctx.fillText(c.text, boxX + BOX_PAD, y);

      this._choiceRects.push({
        index: i,
        x: boxX,
        y: rowY,
        w: boxW,
        h: LINE_HEIGHT,
      });
    });
  }

  _renderContinuePrompt(ctx, boxX, boxY, boxW, boxH) {
    // Fades rather than flicks on and off - a hard blink in the corner of a
    // soft panel is the one thing that still looks like a machine.
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.runner.revealT * 4));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'right';
    ctx.font = FONT;
    ctx.fillText('▼', boxX + boxW - BOX_PAD, boxY + boxH - 16);
    ctx.restore();
  }
}
