import { VIEW } from './constants.js';
import { Audio } from '../engine/audio.js';
import { ImageCache } from '../engine/image-cache.js';
import { SceneStack } from '../engine/scene.js';
import { StoryState } from './story-state.js';
import { Stage } from './stage.js';
import { PortraitRenderer } from './portrait-renderer.js';
import { TitleScene } from './scenes/title-scene.js';
import { DialogueScene } from './scenes/dialogue-scene.js';
import { EndScene } from './scenes/end-scene.js';

// Top-level container: owns the canvas context, input, audio, the shared
// image cache, story progress, and the scene stack. Content (a script plus
// the characters it talks through) is supplied from the outside rather than
// hard-coded here, so main.js can swap in a different lesson without
// touching this file.
export class App {
  constructor(ctx, input, loop, { title, subtitle, script, charactersFactory }) {
    this.ctx = ctx;
    this.input = input;
    this.loop = loop;

    this.audio = new Audio();
    this.images = new ImageCache();
    this.portraits = new PortraitRenderer(this.images);
    this.story = new StoryState();

    this.title = title ?? '對話練習';
    this.subtitle = subtitle ?? '';
    this.script = script;
    this.charactersFactory = charactersFactory;

    this.characters = this.charactersFactory();
    this.stage = new Stage(this.characters);

    this.scenes = new SceneStack(this);
    this.scenes.push(new TitleScene(this));
  }

  // (Re)starts the script from scratch: fresh character paper-doll state
  // (nothing carried over from a previous playthrough's outfit/expression
  // changes), fresh story flags/vars, fresh stage. Called both by the title
  // screen and by "play again" on the end screen.
  startScript() {
    this.story.clear();
    this.characters = this.charactersFactory();
    this.stage = new Stage(this.characters);
    this.scenes.replace(
      new DialogueScene(this, this.script, {
        onFinish: (app) => app.scenes.replace(new EndScene(app)),
      })
    );
  }

  update(dt) {
    this.input.poll();
    if (this.input.pressed('mute')) this.audio.toggleMute();
    this.scenes.update(dt, this.input);
  }

  render() {
    this.ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    this.scenes.render(this.ctx);
  }

  // Forwarded from main.js's canvas pointer handler, in canvas-space
  // coordinates (already adjusted for CSS scaling).
  pointerTap(x, y) {
    this.scenes.top?.pointerTap(x, y);
  }
}
