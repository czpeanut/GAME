// Pure cutscene step sequencer: walks a list of steps, waiting on timers or
// on an external "the dialogue box just closed" signal as needed. Like
// DialogueRunner, this holds no canvas or input reference, so a script's
// sequencing - does step 4 run after step 3's wait elapses, does skip() stop
// exactly where it should - is testable without a browser.
//
// Step shape (`type` selects the rest of the fields):
//   { type: 'wait', seconds }
//   { type: 'fadeIn', seconds }   - screen alpha 1 -> 0 over `seconds`
//   { type: 'fadeOut', seconds }  - screen alpha 0 -> 1 over `seconds`
//   { type: 'dialogue', script }  - CutsceneScene pushes a DialogueScene and
//                                   calls dialogueFinished() when it closes
//   { type: 'setFlag', name }
//   { type: 'grantAbility', name }
//   { type: 'call', fn }          - fn(world, game), for anything else
//
// An unrecognised step type is skipped with a console warning rather than
// throwing, so a typo in content data does not take down the whole scene.
export class CutsceneRunner {
  constructor(steps, { world, game } = {}) {
    this.steps = steps;
    this.world = world;
    this.game = game;
    this.index = -1;
    this.waitT = 0;
    this.waitingForDialogue = false;
    this.finished = false;
    this._advance();
  }

  get current() {
    return this.steps[this.index];
  }

  // Walks forward through any run of instantaneous steps (setFlag,
  // grantAbility, call) and stops at the next step that needs external
  // progression: a timer (wait/fade), a dialogue box, or the end of the list.
  // Implemented as a loop rather than recursion so an authored script with a
  // long run of instant steps cannot deepen the call stack.
  _advance() {
    for (;;) {
      this.index++;
      if (this.index >= this.steps.length) {
        this.finished = true;
        return;
      }

      const step = this.current;
      this.waitT = 0;
      this.waitingForDialogue = false;
      let waits = false;

      switch (step.type) {
        case 'wait':
          this.waitT = step.seconds;
          waits = true;
          break;
        case 'fadeIn':
        case 'fadeOut':
          this.waitT = step.seconds ?? 0.6;
          waits = true;
          break;
        case 'dialogue':
          this.waitingForDialogue = true;
          waits = true;
          break;
        case 'setFlag':
          this.game?.story?.setFlag(step.name);
          break;
        case 'grantAbility':
          this.game?.story?.grantAbility(step.name);
          break;
        case 'call':
          step.fn?.(this.world, this.game);
          break;
        default:
          console.warn(`[cutscene] unknown step type "${step.type}", skipping`);
      }

      if (waits) return;
    }
  }

  // Called by the owning scene once the DialogueScene it pushed for a
  // `dialogue` step has closed.
  dialogueFinished() {
    if (!this.waitingForDialogue) return;
    this.waitingForDialogue = false;
    this._advance();
  }

  tick(dt) {
    if (this.finished || this.waitingForDialogue) return;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (this.waitT <= 0) this._advance();
    }
  }

  // Fade progress for the current step, or null if it is not a fade step.
  // fadeIn goes from opaque (1) to clear (0); fadeOut the reverse.
  get fadeAlpha() {
    const step = this.current;
    if (!step || (step.type !== 'fadeIn' && step.type !== 'fadeOut')) return null;
    const dur = step.seconds ?? 0.6;
    const elapsed = dur > 0 ? Math.min(1, 1 - this.waitT / dur) : 1;
    return step.type === 'fadeIn' ? 1 - elapsed : elapsed;
  }

  // Fast-forwards every remaining timer/fade step to completion, still
  // running any instantaneous steps (flags, ability grants) along the way, so
  // "skip" cannot silently skip past state the rest of the game depends on.
  // Does nothing while a dialogue box is open - skipping past a conversation
  // would mean also tearing down whatever scene is currently showing it,
  // which is the dialogue scene's call to make, not this runner's.
  skip() {
    if (this.waitingForDialogue) return;
    while (!this.finished && !this.waitingForDialogue) this._advance();
  }
}
