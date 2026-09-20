// Persistent progress: which flags have been set, a small table of numeric
// variables (score, affinity, how many questions answered correctly - a
// practice script decides what these mean), and where to resume from. This
// is the one thing that survives a page refresh - which node a conversation
// was on is disposable and always restarts a scene from its beginning.
//
// No DOM dependency beyond localStorage, which is itself guarded: a private
// browsing tab, a locked-down webview, or a plain Node test environment can
// all throw or simply not have `localStorage`, and none of that should ever
// be able to crash the app or block a fresh start.

const SAVE_KEY = 'vn-dialogue:save';
const SAVE_VERSION = 1;

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Some environments expose `localStorage` but throw on first access
    // (Safari private mode used to, some embedded webviews still do).
    const probeKey = '__vn_dialogue_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return localStorage;
  } catch {
    return null;
  }
}

export class StoryState {
  constructor() {
    this.flags = new Set();
    this.vars = {};
    this.sceneId = null;
    this.storage = safeStorage();
  }

  hasFlag(name) {
    return this.flags.has(name);
  }

  // Returns true only the first time a flag is set, so callers can tell "this
  // just happened" (play a jingle, show a message) apart from "this was
  // already true" (re-entering a branch that sets it every time).
  setFlag(name) {
    if (this.flags.has(name)) return false;
    this.flags.add(name);
    return true;
  }

  getVar(name, fallback = 0) {
    return this.vars[name] ?? fallback;
  }

  setVar(name, value) {
    this.vars[name] = value;
  }

  // Increments a numeric variable (creating it at 0 first if unset) and
  // returns the new value - the common case for a practice script tallying
  // "correct answers" or "affinity points" across a branch.
  addVar(name, delta = 1) {
    const value = this.getVar(name, 0) + delta;
    this.vars[name] = value;
    return value;
  }

  setCheckpoint(sceneId) {
    this.sceneId = sceneId;
  }

  toJSON() {
    return {
      v: SAVE_VERSION,
      flags: [...this.flags],
      vars: { ...this.vars },
      sceneId: this.sceneId,
    };
  }

  // Replaces this instance's state with `data`. Missing or malformed fields
  // fall back to defaults field-by-field rather than rejecting the whole save,
  // so a save written by an older build still loads with whatever it does
  // have rather than being discarded outright.
  loadFrom(data) {
    if (!data || typeof data !== 'object') return false;
    this.flags = new Set(Array.isArray(data.flags) ? data.flags : []);
    this.vars = data.vars && typeof data.vars === 'object' ? { ...data.vars } : {};
    this.sceneId = data.sceneId ?? null;
    return true;
  }

  save() {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.toJSON()));
      return true;
    } catch {
      // Quota exceeded or storage revoked mid-session - losing the save is
      // recoverable, crashing the app over it is not.
      return false;
    }
  }

  // Returns true if a save was found and loaded, false otherwise (including
  // "no storage available" and "save exists but is unparsable JSON") - every
  // one of those cases means the app proceeds with a fresh StoryState.
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
    this.vars = {};
    this.sceneId = null;
    if (!this.storage) return;
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      // Already gone, or storage revoked - either way there is nothing left
      // to do.
    }
  }
}
