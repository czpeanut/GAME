// Unified input for a dialogue-driven game: keyboard + gamepad + on-screen
// taps, exposed as named actions.
//
// Every action reports three things, which is what a text-heavy game
// actually needs:
//   down(a)      - held this frame
//   pressed(a)   - went down on this frame (edge)
//   released(a)  - went up on this frame (edge)
//
// Keyboard, gamepad and touch/pointer state are tracked in separate sets and
// unioned each poll. Sharing one set would let an idle controller clear a key
// the player is holding.
//
// There is no dedicated touch-controls module here - a visual novel's only
// touch surface is "tap the screen to advance" / "tap a choice to pick it",
// which the dialogue scene itself handles by calling touchDown()/touchUp()
// directly from pointer events on the canvas. Nothing downstream (DialogueRunner,
// DialogueScene) needs to know or care which source an action came from.

const KEY_MAP = {
  Enter: 'confirm',
  Space: 'confirm',
  KeyZ: 'confirm',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyA: 'auto', // toggle auto-advance, matches the "Auto" button most VNs have
  ControlLeft: 'skip', // hold to fast-forward through already-seen text
  ControlRight: 'skip',
  Escape: 'pause',
  KeyM: 'mute',
};

// Standard gamepad button indices -> actions
const PAD_MAP = {
  0: 'confirm', // A
  1: 'pause', // B
  9: 'pause', // Start
  12: 'up',
  13: 'down',
};

export class Input {
  constructor(target = window) {
    this.keys = new Set(); // keyboard-held actions
    this.pad = new Set(); // gamepad-held actions
    this.touch = new Set(); // on-screen touch/pointer-held actions
    // Actions that saw a keydown since the last poll. Key events arrive from the
    // browser at an arbitrary rate while polling happens at a fixed 60Hz, so a
    // tap shorter than one step would otherwise be added and removed between
    // polls and never seen at all. Latching guarantees every press survives for
    // exactly one poll, which is what `pressed()` promises.
    this.pending = new Set();
    this.actions = new Set(); // union, rebuilt each poll
    this.prev = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.anyInputHit = false;

    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      this.anyInputHit = true;
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) this.pending.add(action);
      this.keys.add(action);
    });

    target.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      this.keys.delete(action);
    });

    // Losing focus mid-hold would otherwise leave the key stuck down forever.
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.pad.clear();
      this.touch.clear();
      this.pending.clear();
    });
  }

  // Called from pointer/click handlers on the canvas. Mirrors the
  // keydown/keyup handlers above: a fresh press is latched into `pending` so
  // it survives to the next poll() even if it happens to land between two
  // polls, exactly like a fast keyboard tap.
  touchDown(action) {
    if (!this.touch.has(action)) this.pending.add(action);
    this.touch.add(action);
  }

  touchUp(action) {
    this.touch.delete(action);
  }

  // Call once per fixed update, before any game logic reads input.
  poll() {
    this._pollGamepad();

    // A latched press counts as held for this one poll even if the key has
    // already been released, so a very fast tap still produces a press edge.
    this.actions = new Set([...this.keys, ...this.pad, ...this.touch, ...this.pending]);
    this.pending.clear();

    this.justPressed.clear();
    this.justReleased.clear();
    for (const a of this.actions) if (!this.prev.has(a)) this.justPressed.add(a);
    for (const a of this.prev) if (!this.actions.has(a)) this.justReleased.add(a);
    this.prev = new Set(this.actions);
  }

  _pollGamepad() {
    this.pad.clear();
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gp = [...navigator.getGamepads()].find(Boolean);
    if (!gp) return;

    for (const [index, action] of Object.entries(PAD_MAP)) {
      const btn = gp.buttons[index];
      if (btn && btn.pressed) {
        this.pad.add(action);
        this.anyInputHit = true;
      }
    }
  }

  down(a) {
    return this.actions.has(a);
  }
  pressed(a) {
    return this.justPressed.has(a);
  }
  released(a) {
    return this.justReleased.has(a);
  }
}
