// A character's art state: which part images it is built from (the rig) and
// which variant is currently showing in each part. Pure data - no image
// loading and no canvas here, so "does picking this branch change her
// outfit" is testable without a browser. Drawing is PortraitRenderer's job
// and the animation maths is Rig's.
//
// `rig` is the part list in back-to-front draw order, each entry declaring
// its pivot, parent and how it reacts to the idle-motion channels - see
// rig.js for the full field list. The simplest possible character is a
// single part:
//
//   new Character('narrator', {
//     rig: [{ name: 'body', pivot: [0.5, 1], breathe: 1 }],
//     layers: { body: 'default' },
//   })
//
// `layers` maps a part name to the variant id currently showing in it, e.g.
// { torso: 'uniform', head: 'default' }. Parts driven by the animation
// itself (blink, talk) ignore `layers` and pick their own variant. A part
// with no entry (or set to null) is simply not drawn, so an accessory can
// be optional.
//
// The asset file for a given (character, part, variant) triple is expected
// at `assets/characters/<characterId>/<part>/<variant>.png`.
export class Character {
  constructor(id, { name, rig = [], layers = {}, expression = 'neutral', motion = null } = {}) {
    this.id = id;
    this.name = name ?? id;
    this.rig = rig.map((part) => ({ ...part }));
    this.layers = { ...layers };
    this.expression = expression;
    // Optional PortraitMotion settings - how FAST this character's idle
    // cycles run. How FAR each part moves is the rig's per-part weights.
    // A character cut from a flat illustration has to keep both small or its
    // seams show; one built from real layers has no such limit, so the two
    // cannot share one setting.
    this.motion = motion;
  }

  // Part names in draw order.
  get slots() {
    return this.rig.map((part) => part.name);
  }

  getLayer(slot) {
    return this.layers[slot] ?? null;
  }

  // Sets one part's variant. `null` un-equips the part (nothing drawn).
  setLayer(slot, variant) {
    this.layers[slot] = variant;
  }

  // Sets several parts at once - the common case for "put on the gym
  // uniform" (torso + legs together) rather than one call per part.
  equip(partial) {
    Object.assign(this.layers, partial);
  }

  setExpression(name) {
    this.expression = name;
    // Expressions are conventionally just another part's variant (the
    // "face" part), so scripts can either call setExpression() for
    // readability or set that part directly - both end up in the same place.
    if (this.slots.includes('face')) this.layers.face = name;
  }

  clone() {
    return new Character(this.id, {
      name: this.name,
      rig: this.rig,
      layers: this.layers,
      expression: this.expression,
      motion: this.motion,
    });
  }
}
