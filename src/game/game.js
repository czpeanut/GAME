import { VIEW } from './constants.js';
import { HUD } from './hud.js';
import { Audio } from '../engine/audio.js';
import { SceneStack } from '../engine/scene.js';
import { StoryState } from './story-state.js';
import { WorldScene } from './scenes/world-scene.js';
import { TitleScene } from './scenes/title-scene.js';
import { PauseScene } from './scenes/pause-scene.js';
import { DeathScene } from './scenes/death-scene.js';
import { WinScene } from './scenes/win-scene.js';
import { buildLevel1 } from './level.js';

// Top-level container: owns the canvas context, input, the audio and HUD
// singletons, story state, and the scene stack. Almost nothing here is
// gameplay logic any more - that all lives in WorldScene and the overlay
// scenes. Game's job is wiring: constructing the world, mediating between
// Player/Enemy (which only know about `game`, never about scenes) and the
// scene stack, and forwarding a handful of world-scoped properties so
// existing call sites (HUD, tests) that read `game.player`, `game.camera`,
// etc. keep working unchanged.
export class Game {
  constructor(ctx, input, loop, opts = {}) {
    this.ctx = ctx;
    this.input = input;
    this.loop = loop;

    this.audio = new Audio();
    this.hud = new HUD();
    this.story = new StoryState(opts.startingAbilities);
    this.showDebug = false;

    // Title screen text and the message shown the moment play begins. Content
    // (e.g. the opening) can override these before the title is first shown.
    this.title = opts.title ?? 'HOLLOW RUNNER';
    this.subtitle = opts.subtitle ?? 'a 2D action shooter';
    this.titleHints = opts.titleHints ?? null;
    this.startMessage = opts.startMessage ??
      'ARROWS / WASD to move  -  J to fire  -  SHIFT to dash';
    // Called once, the moment the title screen closes, instead of the plain
    // startMessage banner - lets story content open with a cutscene (the
    // opening's wake-up sequence) rather than a HUD hint.
    this.onStart = opts.onStart ?? null;

    this.scenes = new SceneStack(this);
    this.world = new WorldScene(this);
    this.scenes.push(this.world);

    const levelFactory = opts.levelFactory ?? buildLevel1;
    this.world.loadLevel(levelFactory(), levelFactory);

    this.scenes.push(new TitleScene(this));
  }

  // --- Forwarded world-scoped state -----------------------------------
  // Kept so existing call sites (HUD, the browser smoke test, anything typed
  // against the pre-scene-stack Game) do not need to know WorldScene exists.
  get player() { return this.world.player; }
  get enemies() { return this.world.enemies; }
  get bullets() { return this.world.bullets; }
  get level() { return this.world.level; }
  get camera() { return this.world.camera; }
  get particles() { return this.world.particles; }
  get score() { return this.world.score; }
  get deaths() { return this.world.deaths; }
  get elapsed() { return this.world.elapsed; }
  get pickups() { return this.world.pickups; }
  get loopFrame() { return this.loop.frame; }

  // Derived from the scene stack rather than stored, so it can never drift
  // out of sync with what is actually on top. Values match the pre-refactor
  // state machine exactly, for anything that still reads game.state.
  get state() {
    const top = this.scenes.top;
    if (top instanceof TitleScene) return 'title';
    if (top instanceof PauseScene) return 'paused';
    if (top instanceof DeathScene) return 'dead';
    if (top instanceof WinScene) return 'won';
    return 'playing';
  }

  // --- Called by Player / Enemy, which know nothing about scenes -------
  freeze(seconds) {
    this.world.freeze(seconds);
  }

  spawnBullet(x, y, dx, dy, opts) {
    this.world.spawnBullet(x, y, dx, dy, opts);
  }

  meleeAttack(rect, weapon, facingDir) {
    this.world.meleeAttack(rect, weapon, facingDir);
  }

  onEnemyKilled(e) {
    this.world.score += e.scoreValue;
  }

  onPlayerDeath() {
    this.world.flash = 1;
    this.scenes.push(new DeathScene(this));
  }

  // Called by WorldScene when the player reaches the level's goal.
  onLevelWon() {
    this.audio.win();
    this.camera.addTrauma(0.4);
    this.scenes.push(new WinScene(this));
  }

  // Used by main.js's window-blur handler. A plain property assignment
  // (`game.state = 'paused'`) cannot work now that `state` is derived; this is
  // the equivalent action expressed as scene stack mutation.
  pauseIfPlaying() {
    if (this.scenes.top === this.world) this.scenes.push(new PauseScene(this));
  }

  update(dt) {
    this.input.poll();

    if (this.input.pressed('debug')) this.showDebug = !this.showDebug;
    if (this.input.pressed('mute')) {
      this.audio.unlock();
      this.hud.showMessage(this.audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1.2);
    }
    this._handlePauseToggle();

    this.scenes.update(dt, this.input);
  }

  // Pause is restricted to "currently playing" or "currently paused" - not
  // reachable from the title screen, a death/win overlay, or mid-conversation
  // - matching the original state machine's restriction exactly.
  _handlePauseToggle() {
    if (!this.input.pressed('pause')) return;
    const top = this.scenes.top;
    if (top === this.world) this.scenes.push(new PauseScene(this));
    else if (top instanceof PauseScene) this.scenes.pop();
  }

  render() {
    this.ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    this.scenes.render(this.ctx);
  }
}
