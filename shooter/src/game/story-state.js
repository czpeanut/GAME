// Persistent story state: which flags have been set, which abilities have
// been unlocked, and where to resume from. This is the one thing in the game
// that survives a level reload and a page refresh - everything else (enemy
// positions, bullets, particles) is disposable simulation state rebuilt by
// WorldScene.loadLevel().
//
// No DOM dependency beyond localStorage, which is itself guarded: a private
// browsing tab, a locked-down webview, or a plain Node test environment can
// all throw or simply not have `localStorage`, and none of that should ever
// be able to crash the game or block a fresh start.

const SAVE_KEY = 'hollow-runner:save';
const SAVE_VERSION = 1;

// Every ability starts unlocked by default - this is what makes ability
// gating an opt-in a specific piece of content chooses, rather than a global
// engine assumption. Level1 (and anything else with no tutorial) has no
// triggers that ever call grantAbility(), so it needs the full moveset from
// frame one exactly as it did before gating existed. Story content that wants
// a taught-in-stages opening passes its own starting set to `new
// StoryState(overrides)` instead - see the opening level for an example.
//
// Note there is no `fire` entry here: whether the player can shoot is
// answered by which weapon they are holding (see weapons.js and
// Player.weaponId), not by an ability flag - there is nothing left to gate
// once fists are always available as a fallback.
export const DEFAULT_ABILITIES = {
  move: true,
  dash: true,
  doubleJump: true,
  wallJump: true,
};

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Some environments expose `localStorage` but throw on first access
    // (Safari private mode used to, some embedded webviews still do).
    const probeKey = '__hollow_runner_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    return null;
  }
}

export class StoryState {
  // `startingAbilities` overrides individual entries of DEFAULT_ABILITIES -
  // e.g. `new StoryState({ dash: false, wallJump: false })` for a level that
  // wants to teach those moves later rather than start with them.
  constructor(startingAbilities) {
    // Remembered so clear() can reset back to *this instance's* configured
    // start rather than the global default - a gated story that clears its
    // save (a "new game" button) must re-lock what it originally locked, not
    // jump to every ability being unlocked.
    this._startingAbilities = startingAbilities ?? {};
    this.flags = new Set();
    this.abilities = { ...DEFAULT_ABILITIES, ...this._startingAbilities };
    this.levelId = null;
    this.checkpointId = null;
    this.storage = safeStorage();
  }

  hasFlag(name) {
    return this.flags.has(name);
  }

  // Returns true only the first time a flag is set, so callers can tell "this
  // just happened" (play a jingle, show a message) apart from "this was
  // already true" (re-entering a trigger that fires every time).
  setFlag(name) {
    if (this.flags.has(name)) return false;
    this.flags.add(name);
    return true;
  }

  hasAbility(name) {
    return !!this.abilities[name];
  }

  // Same "did this actually change" contract as setFlag - a cutscene that
  // grants dash wants to know whether to play the unlock fanfare.
  grantAbility(name) {
    if (this.abilities[name]) return false;
    this.abilities[name] = true;
    return true;
  }

  setCheckpoint(levelId, checkpointId) {
    this.levelId = levelId;
    this.checkpointId = checkpointId;
  }

  toJSON() {
    return {
      v: SAVE_VERSION,
      flags: [...this.flags],
      abilities: { ...this.abilities },
      levelId: this.levelId,
      checkpointId: this.checkpointId,
    };
  }

  // Replaces this instance's state with `data`. Missing or malformed fields
  // fall back to defaults field-by-field rather than rejecting the whole save,
  // so a save written by an older build still loads with whatever it does
  // have rather than being discarded outright.
  loadFrom(data) {
    if (!data || typeof data !== 'object') return false;
    this.flags = new Set(Array.isArray(data.flags) ? data.flags : []);
    this.abilities = { ...DEFAULT_ABILITIES, ...(data.abilities ?? {}) };
    this.levelId = data.levelId ?? null;
    this.checkpointId = data.checkpointId ?? null;
    return true;
  }

  save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.toJSON()));
      return true;
    } catch {
      // Quota exceeded or storage revoked mid-session - losing the save is
      // recoverable, crashing the game over it is not.
      return false;
    }
  }

  // Returns true if a save was found and loaded, false otherwise (including
  // "no storage available" and "save exists but is unparsable JSON") - every
  // one of those cases means the game proceeds with a fresh StoryState.
  load() {
    if (!this.storage) return false;
    let raw;
    try {
      raw = this.storage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
    if (!raw) return false;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return false;
    }
    if (data?.v !== SAVE_VERSION) return false;
    return this.loadFrom(data);
  }

  clear() {
    this.flags = new Set();
    this.abilities = { ...DEFAULT_ABILITIES, ...this._startingAbilities };
    this.levelId = null;
    this.checkpointId = null;
    if (!this.storage) return;
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      // Already gone, or storage revoked - either way there is nothing left
      // to do.
    }
  }
}
