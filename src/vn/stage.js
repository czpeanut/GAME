import { PortraitMotion } from './portrait-motion.js';
import { Rig } from './rig.js';

// Everything currently visible in a scene: which background is showing, and
// which characters are standing where (left/center/right), each carrying its
// own art state (Character), "is alive" motion timers (PortraitMotion) and
// puppet state (Rig - part transforms and spring positions). The Character
// itself stays pure data; the per-playthrough animation state lives here
// alongside it. This is the `world` context handed to DialogueRunner's
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
    this.rigs = {}; // characterId -> Rig, created on first entrance
    this.speakerId = null;
  }

  setBackground(id) {
    this.background = id;
  }

  show(characterId, position = 'center') {
    const character = this.characters[characterId];
    if (!character) return;
    this.hide(characterId); // moving an already-shown character, not duplicating it
    this.slots[position] = characterId;
    if (!this.motions[characterId]) {
      this.motions[characterId] = new PortraitMotion(character?.motion ?? undefined);
    }
    if (!this.rigs[characterId]) {
      const rig = new Rig(character.rig);
      rig.settle(); // start at rest rather than swinging in from zero
      this.rigs[characterId] = rig;
    }
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

  rigFor(characterId) {
    return this.rigs[characterId];
  }

  update(dt) {
    for (const [id, motion] of Object.entries(this.motions)) {
      motion.update(dt, this.speakerId === id);
      this.rigs[id]?.update(dt, motion);
    }
  }
}
