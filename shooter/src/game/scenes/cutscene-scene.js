import { Scene } from '../../engine/scene.js';
import { CutsceneRunner } from '../cutscene-runner.js';
import { DialogueScene } from './dialogue-scene.js';
import { VIEW } from '../constants.js';

// Plays a scripted sequence of waits, fades, flag/ability grants and nested
// conversations, with the world frozen underneath. This is the "the player
// does not control anything right now" scene - used for the opening's wake-up
// beat, ability-unlock moments, anything that needs to happen to the player
// rather than because of them.
export class CutsceneScene extends Scene {
  constructor(game, steps, opts = {}) {
    super(game);
    this.runner = new CutsceneRunner(steps, { world: game.world, game });
    this.onComplete = opts.onComplete;
    this._dialoguePushed = false;
  }

  enter() {
    this.game.world.simulate = false;
  }

  exit() {
    this.game.world.simulate = true;
  }

  update(dt, input) {
    // A dialogue step hands control to a pushed DialogueScene; this scene just
    // waits for it to close, then tells the runner to continue. The push
    // itself happens here (not in the runner, which has no scene stack
    // access) exactly once per dialogue step.
    if (this.runner.waitingForDialogue) {
      if (!this._dialoguePushed) {
        this._dialoguePushed = true;
        const script = this.runner.current.script;
        this.game.scenes.push(
          new DialogueScene(this.game, script, {
            onClose: () => {
              this._dialoguePushed = false;
              this.runner.dialogueFinished();
            },
          })
        );
      }
      return;
    }

    this.runner.tick(dt);

    if (input.pressed('pause')) this.runner.skip();

    if (this.runner.finished) {
      this.game.scenes.pop();
      this.onComplete?.(this.game.world, this.game);
    }
  }

  render(ctx) {
    const alpha = this.runner.fadeAlpha;
    if (alpha === null || alpha <= 0) return;
    ctx.fillStyle = `rgba(4,5,10,${alpha})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
}
