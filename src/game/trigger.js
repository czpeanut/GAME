// Story triggers and NPCs: the two primitives a level needs to place a
// narrative beat in the world.
//
// A StoryTrigger is an invisible rectangle that runs a callback when the
// player enters it - a note on the ground, a memory flashback, "you have now
// seen enough to move on". An Npc is a stationary figure the player can walk
// up to and interact with.
//
// Both are deliberately dumb: they hold no dialogue text and know nothing
// about scenes. `onEnter` / `onInteract` are callbacks supplied by the level
// data, so this module has no dependency on dialogue content and no dialogue
// content has to know these classes exist - a level file is the only thing
// that wires the two together.

import { aabb } from '../engine/math.js';

export class StoryTrigger {
  constructor({ id, x, y, w, h, once = true, flag, onEnter }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.once = once;
    // Optional: a flag name in StoryState. If set, firing this trigger sets
    // the flag, and the trigger refuses to fire again once the flag is
    // already set - even across a full level reload, unlike `once` alone
    // which only tracks "already fired" for as long as this instance exists.
    this.flag = flag;
    this.onEnter = onEnter;
    this.fired = false;
    this.inside = false;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // Call once per frame with the player's rect. Returns true the frame
  // onEnter actually runs, so a caller that only wants one trigger to act per
  // frame (e.g. "stop checking further triggers once dialogue opens") can
  // short-circuit on it.
  update(playerRect, world, game) {
    const overlapping = aabb(playerRect, this.rect);

    if (!overlapping) {
      this.inside = false;
      return false;
    }
    // Entering while already inside must not re-fire every frame the player
    // stands there; only the moment of entry counts.
    if (this.inside) return false;
    this.inside = true;

    if (this.flag && game.story?.hasFlag(this.flag)) {
      this.fired = true;
      return false;
    }
    if (this.once && this.fired) return false;

    this.fired = true;
    if (this.flag) game.story?.setFlag(this.flag);
    this.onEnter?.(world, game);
    return true;
  }
}

export class Npc {
  constructor({ id, x, y, w = 20, h = 34, color = '#d9c68a', facing = -1, onInteract }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.color = color;
    this.facing = facing;
    this.onInteract = onInteract;
    this.bob = Math.random() * Math.PI * 2;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
  get centerX() {
    return this.x + this.w / 2;
  }
  get centerY() {
    return this.y + this.h / 2;
  }

  // A wider box than the collision rect - the "press E to talk" prompt should
  // appear a little before the player is literally touching the NPC.
  isNear(player, range = 22) {
    const dx = Math.abs(this.centerX - player.centerX);
    const dy = Math.abs(this.centerY - player.centerY);
    return dx < this.w / 2 + player.w / 2 + range && dy < this.h * 0.7;
  }

  interact(world, game) {
    this.onInteract?.(world, game);
  }

  update(dt) {
    this.bob += dt;
  }

  render(ctx) {
    const sway = Math.sin(this.bob * 1.4) * 1.5;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x + sway * 0.2, this.y, this.w, this.h);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(this.x + this.w * 0.2, this.y + this.h * 0.15, this.w * 0.6, this.h * 0.25);
  }
}
