// A character's paper-doll state: which art asset is currently equipped in
// each layer slot (body pose, outfit, hair, expression, accessory, ...), plus
// which expression it's showing. Pure data - no image loading and no canvas
// here, so "does picking this branch change her outfit" is testable without
// a browser. Drawing the current state is PortraitRenderer's job.
//
// `slots` is the back-to-front draw order, e.g.
//   ['body', 'outfit', 'hair', 'face', 'accessory']
// and `layers` maps each slot name to the variant id currently equipped in
// it, e.g. { body: 'base', outfit: 'uniform', hair: 'ponytail', face: 'smile' }.
// A slot with no entry (or set to null) is simply not drawn, so an
// accessory can be optional.
//
// The asset file for a given (character, slot, variant) triple is expected
// at `assets/characters/<characterId>/<slot>/<variant>.png` - see
// portrait-renderer.js and the README for the full convention.
//
// `breathingSplit` opts a character into a two-piece breathing rig: if the
// character has both an `upper` and a `lower` slot, PortraitRenderer applies
// the idle breathing motion only to the `upper` piece, pivoted at this
// fraction of the portrait's height (measured from the top) - so the chest
// visibly rises while the legs stay planted, instead of the whole image
// growing from its feet like a zoom. `null` (the default) means "just one
// rigid image" - the simplest case, no art prep needed beyond one picture.
export class Character {
  constructor(id, { name, slots = [], layers = {}, expression = 'neutral', breathingSplit = null } = {}) {
    this.id = id;
    this.name = name ?? id;
    this.slots = [...slots];
    this.layers = { ...layers };
    this.expression = expression;
    this.breathingSplit = breathingSplit;
  }

  getLayer(slot) {
    return this.layers[slot] ?? null;
  }

  // Sets one slot's variant. `null` un-equips the slot (nothing drawn there).
  setLayer(slot, variant) {
    this.layers[slot] = variant;
  }

  // Sets several slots at once - the common case for "put on the gym
  // uniform" (outfit + maybe shoes together) rather than one call per slot.
  equip(partial) {
    Object.assign(this.layers, partial);
  }

  setExpression(name) {
    this.expression = name;
    // Expressions are conventionally just another layer (the "face" slot),
    // so scripts can either call setExpression() for readability or equip
    // the face slot directly - both end up in the same place.
    if (this.slots.includes('face')) this.layers.face = name;
  }

  clone() {
    return new Character(this.id, {
      name: this.name,
      slots: this.slots,
      layers: this.layers,
      expression: this.expression,
      breathingSplit: this.breathingSplit,
    });
  }
}
