import { PortraitMotion } from './portrait-motion.js';

// Everything currently visible in a scene: which background is showing, and
// which characters are standing where (left/center/right), each carrying its
// own paper-doll state (Character) and "is alive" motion timers
// (PortraitMotion). This is the `world` context handed to DialogueRunner's
// node/choice `action` callbacks, so a script authors expression changes,
// outfit swaps, and background changes the same way the old game authored
// flag/ability side effects - through a plain method call in `action`:
//
//   { lines: ['換件衣服吧。'], action: (stage) => stage.equip('mei', { outfit: 'gym' }) }
//
// No canvas or image loading here - PortraitRenderer reads this object each
// frame to know what to draw. Kept separate so "did picking this choice put
// the right character in the right position with the right expression" is
// testable without a browser.
export class Stage {
  constructor(characters = {}) {
    this.characters = characters; // id -> Character
    this.background = null;
    this.slots = { left: null, center: null, right: null }; // position -> characterId
    this.motions = {}; // characterId -> PortraitMotion, created on first entrance
    this.speakerId = null;
  }

  setBackground(id) {
    this.background = id;
  }

  show(characterId, position = 'center') {
    if (!this.characters[characterId]) return;
    this.hide(characterId); // moving an already-shown character, not duplicating it
    this.slots[position] = characterId;
    if (!this.motions[characterId]) this.motions[characterId] = new PortraitMotion();
  }

  hide(characterId) {
    for (const position of Object.keys(this.slots)) {
      if (this.slots[position] === characterId) this.slots[position] = null;
    }
  }

  hideAll() {
    for (const position of Object.keys(this.slots)) this.slots[position] = null;
  }

  setExpression(characterId, expression) {
    this.characters[characterId]?.setExpression(expression);
  }

  equip(characterId, partial) {
    this.characters[characterId]?.equip(partial);
  }

  // Who the dialogue box should treat as currently talking - drives the talk
  // bounce and (in the renderer) a slight dim on everyone else on stage.
  setSpeaker(characterId) {
    this.speakerId = characterId;
  }

  get onStage() {
    return Object.entries(this.slots)
      .filter(([, id]) => id)
      .map(([position, id]) => ({ position, character: this.characters[id] }));
  }

  motionFor(characterId) {
    return this.motions[characterId];
  }

  update(dt) {
    for (const [id, motion] of Object.entries(this.motions)) {
      motion.update(dt, this.speakerId === id);
    }
  }
}
