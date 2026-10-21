// Unified input: keyboard + mouse + gamepad + on-screen touch buttons,
// exposed as named actions.
//
// Every action reports three things, which is what responsive platformer code
// actually needs:
//   down(a)      - held this frame
//   pressed(a)   - went down on this frame (edge)
//   released(a)  - went up on this frame (edge)
//
// Keyboard, mouse, gamepad and touch state are tracked in separate sets and unioned
// each poll. Sharing one set would let an idle controller clear a key the
// player is holding.
//
// Touch has no keyboard/gamepad to poll - `touch-controls.js` calls
// touchDown()/touchUp() directly from its own pointer event listeners, and
// this class just treats that as a third input source alongside the other
// two. Nothing downstream (Player, DialogueScene, ...) needs to know or care
// which source an action came from.
//
// The mouse is the one source that also carries a position: attachPointer()
// tracks the cursor in the game's internal (VIEW) resolution so a firearm can
// aim at it. `pointerActive` says whether that position should be trusted -
// it switches on when the mouse moves over the canvas and off again the
// moment another source starts aiming (keyboard up/down, gamepad, touch).

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
  KeyU: 'aim',
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
  6: 'aim', // LT
  7: 'fire', // RT
  9: 'pause', // Start
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

const DEADZONE = 0.35;

// Mouse buttons -> actions: left fires, right aims down the sights.
const MOUSE_MAP = { 0: 'fire', 2: 'aim' };

export class Input {
  constructor(target = window) {
    this.keys = new Set(); // keyboard-held actions
    this.pad = new Set(); // gamepad-held actions
    this.touch = new Set(); // on-screen touch-button-held actions
    this.mouse = new Set(); // mouse-button-held actions
    this.pointerX = 0; // cursor position in VIEW pixels
    this.pointerY = 0;
    this.pointerActive = false;
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
      // Aiming with W/S means the keyboard is steering the gun now.
      if (action === 'up' || action === 'down') this.pointerActive = false;
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
      this.mouse.clear();
      this.pending.clear();
    });
  }

  // Mouse support, bound to the canvas. `viewW`/`viewH` are the internal
  // resolution: the canvas is CSS-scaled, so client coordinates are mapped
  // back through its on-screen rectangle.
  attachPointer(canvas, viewW, viewH) {
    const toView = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointerX = ((e.clientX - r.left) / r.width) * viewW;
      this.pointerY = ((e.clientY - r.top) / r.height) * viewH;
    };
    window.addEventListener('mousemove', (e) => {
      toView(e);
      this.pointerActive = true;
    });
    // Listened on the whole window, not just the canvas: in the heat of a
    // fight a click that lands a few pixels into the letterbox margin should
    // still fire. Clicks on real page controls (buttons) are left alone.
    window.addEventListener('mousedown', (e) => {
      const action = MOUSE_MAP[e.button];
      if (!action || e.target.closest?.('button')) return;
      e.preventDefault();
      toView(e);
      this.pointerActive = true;
      this.anyInputHit = true;
      if (!this.mouse.has(action)) this.pending.add(action);
      this.mouse.add(action);
    });
    // Released anywhere - including outside the canvas after a drag - still
    // has to let go, or the gun stays aimed/firing forever.
    window.addEventListener('mouseup', (e) => {
      const action = MOUSE_MAP[e.button];
      if (action) this.mouse.delete(action);
    });
    // Right button is "aim"; the browser's context menu would swallow it.
    window.addEventListener('contextmenu', (e) => {
      if (!e.target.closest?.('button')) e.preventDefault();
    });
  }

  // Called by touch-controls.js on pointerdown/pointerup for an on-screen
  // button. Mirrors the keydown/keyup handlers above: a fresh press is
  // latched into `pending` so it survives to the next poll() even if it
  // happens to land between two polls, exactly like a fast keyboard tap.
  touchDown(action) {
    if (!this.touch.has(action)) this.pending.add(action);
    this.touch.add(action);
    this.pointerActive = false;
  }

  touchUp(action) {
    this.touch.delete(action);
  }

  // Call once per fixed update, before any game logic reads input.
  poll() {
    this._pollGamepad();

    // A latched press counts as held for this one poll even if the key has
    // already been released, so a very fast tap still produces a press edge.
    this.actions = new Set([...this.keys, ...this.mouse, ...this.pad, ...this.touch, ...this.pending]);
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
    // Any stick or button on a pad hands aiming back to directional input.
    if (Math.abs(lx) > DEADZONE || Math.abs(ly) > DEADZONE || this.pad.size) this.pointerActive = false;
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
