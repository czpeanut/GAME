// Unified input: keyboard + gamepad, exposed as named actions.
//
// Every action reports three things, which is what responsive platformer code
// actually needs:
//   down(a)      - held this frame
//   pressed(a)   - went down on this frame (edge)
//   released(a)  - went up on this frame (edge)
//
// Keyboard and gamepad state are tracked in separate sets and unioned each poll.
// Sharing one set would let an idle controller clear a key the player is holding.

const KEY_MAP = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  Space: 'jump',
  KeyK: 'jump',
  KeyJ: 'fire',
  KeyZ: 'fire',
  KeyE: 'interact',
  KeyL: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyR: 'restart',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
  F3: 'debug',
};

// Standard gamepad button indices -> actions
const PAD_MAP = {
  0: 'jump', // A
  1: 'dash', // B
  2: 'fire', // X
  3: 'interact', // Y
  5: 'dash', // RB
  7: 'fire', // RT
  9: 'pause', // Start
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

const DEADZONE = 0.35;

export class Input {
  constructor(target = window) {
    this.keys = new Set(); // keyboard-held actions
    this.pad = new Set(); // gamepad-held actions
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
    this.axisX = 0;
    this.axisY = 0;
    this.anyInputHit = false;

    target.addEventListener('keydown', (e) => {
      const action = KEY_MAP[e.code];
      this.anyInputHit = true;
      if (!action) return;
      e.preventDefault(); // stop the page scrolling when the player jumps
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
      this.pending.clear();
    });
  }

  // Call once per fixed update, before any game logic reads input.
  poll() {
    this._pollGamepad();

    // A latched press counts as held for this one poll even if the key has
    // already been released, so a very fast tap still produces a press edge.
    this.actions = new Set([...this.keys, ...this.pad, ...this.pending]);
    this.pending.clear();

    this.justPressed.clear();
    this.justReleased.clear();
    for (const a of this.actions) if (!this.prev.has(a)) this.justPressed.add(a);
    for (const a of this.prev) if (!this.actions.has(a)) this.justReleased.add(a);
    this.prev = new Set(this.actions);

    this.axisX = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    this.axisY = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
  }

  _pollGamepad() {
    this.pad.clear();
    if (!navigator.getGamepads) return;
    const gp = [...navigator.getGamepads()].find(Boolean);
    if (!gp) return;

    for (const [index, action] of Object.entries(PAD_MAP)) {
      const btn = gp.buttons[index];
      if (btn && btn.pressed) {
        this.pad.add(action);
        this.anyInputHit = true;
      }
    }

    const [lx = 0, ly = 0] = gp.axes;
    if (lx < -DEADZONE) this.pad.add('left');
    else if (lx > DEADZONE) this.pad.add('right');
    if (ly < -DEADZONE) this.pad.add('up');
    else if (ly > DEADZONE) this.pad.add('down');
    if (this.pad.size) this.anyInputHit = true;
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
