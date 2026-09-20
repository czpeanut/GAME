// A scene stack: the thing that makes "a dialogue box on top of a paused
// world" possible without the world's own code needing to know dialogue
// exists. Every screen the game can show - the world, the title, a pause
// menu, a conversation - is a Scene pushed onto a stack. The stack decides
// who updates and who renders; scenes only decide what happens to *them*.
//
// Deliberately free of any DOM or canvas reference beyond the `ctx` handed to
// render(), so the stacking and dispatch logic can be unit tested in Node.

export class Scene {
  constructor(game) {
    this.game = game;
  }

  // Lifecycle hooks. A scene is "entered" once, when pushed, and "exited"
  // once, when popped. "paused"/"resumed" fire when another scene is pushed
  // on top of / popped off of this one, without this one leaving the stack -
  // this is how the world knows to freeze while a dialogue box is open, then
  // pick back up exactly where it left off.
  enter() {}
  exit() {}
  pause() {}
  resume() {}

  update(dt, input) {}
  render(ctx) {}

  // Called with canvas-space coordinates when the player taps/clicks the
  // screen. A no-op by default; scenes that care about a tap position (e.g.
  // picking a dialogue choice by clicking it) override this instead of the
  // app needing to know which scene is on top.
  pointerTap(x, y) {}

  // If false, the stack stops walking downward during update() once it
  // reaches this scene - scenes below never see a frame. Every current scene
  // leaves this true, because the world scene self-regulates (via its own
  // simulate/frozen flags) rather than needing the stack to gate it; this
  // exists as a primitive for a future scene that truly must have exclusive
  // input (e.g. a blocking modal).
  get updatesBelow() {
    return true;
  }

  // If false, the stack stops walking downward during render() once it
  // reaches this scene - nothing below it is drawn. A scene that fully
  // repaints the screen (a hard cut, a loading screen) sets this to false;
  // every overlay in this game leaves it true so the world stays visible
  // underneath a dialogue box, a pause menu, etc.
  get rendersBelow() {
    return true;
  }
}

export class SceneStack {
  constructor(game) {
    this.game = game;
    this.stack = [];
  }

  get top() {
    return this.stack[this.stack.length - 1];
  }

  // Is `scene` (an instance, a class, or a class checked via instanceof)
  // anywhere in the stack? Accepts a class for `stack.includes(SomeScene)`
  // style checks without every caller importing `instanceof`.
  has(sceneClass) {
    return this.stack.some((s) => s instanceof sceneClass);
  }

  push(scene) {
    this.top?.pause();
    this.stack.push(scene);
    scene.enter();
    return scene;
  }

  // Pops and returns the top scene. Popping an empty stack is a no-op rather
  // than an error - callers that race (e.g. two inputs in one frame both
  // trying to close a menu) do not need to guard it themselves.
  pop() {
    if (this.stack.length === 0) return undefined;
    const scene = this.stack.pop();
    scene.exit();
    this.top?.resume();
    return scene;
  }

  // Pops the current top and pushes a new one in a single step, so a scene
  // transition (title -> world) never leaves a one-frame gap where neither
  // scene's enter/exit-driven state (e.g. world.simulate) is settled.
  replace(scene) {
    this.pop();
    this.push(scene);
  }

  update(dt, input) {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const scene = this.stack[i];
      scene.update(dt, input);
      if (!scene.updatesBelow) break;
    }
  }

  render(ctx) {
    let start = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!this.stack[i].rendersBelow) {
        start = i;
        break;
      }
    }
    for (let i = start; i < this.stack.length; i++) this.stack[i].render(ctx);
  }
}
