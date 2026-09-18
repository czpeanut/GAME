import { ImageCache } from './image-cache.js';
import { Loop } from './loop.js';
import { Rig } from './rig.js';
import { PortraitMotion } from './portrait-motion.js';
import { PortraitRenderer } from './portrait-renderer.js';
import { createHero } from './hero.js';
import { mouthIndexAt } from './lipsync.js';

// The avatar: a cut-out puppet drawn on a canvas, breathing and drifting on
// its own, and moving its mouth in step with whatever audio element it was
// handed. It replaces a streamed talking-photo video, so it has to look alive
// even when nothing is being said - that is what the idle channels are for.

// The artwork is 402x720, and every pivot in the rig is a fraction of that
// box, so the box has to keep this shape or the character stretches.
const ART_ASPECT = 402 / 720;

// Which slice of the figure the frame shows, as fractions of the artwork:
// from the top of the head down to the waist, centred on the body rather
// than on the canvas (the figure does not sit dead centre in its own art).
//
// These two numbers trade off against each other in a way that is easy to get
// wrong: the canvas is a fixed window onto the box, so showing LESS of the
// figure vertically also shows less of it horizontally. Push `bottom` much
// below 0.46 in a 200x300 frame and the arms start getting cut off at the
// sides - and the arms swinging is half of what makes the puppet look alive.
// Raise it much above and the head shrinks until the mouth stops reading.
const FRAMING = { top: 0, bottom: 0.46, centerX: 0.51 };

export class SpeakingPuppet {
  constructor(canvas, { assetRoot = 'assets/characters', framing = FRAMING } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.framing = framing;

    this.images = new ImageCache();
    this.renderer = new PortraitRenderer(this.images, assetRoot);
    this.character = createHero();
    this.rig = new Rig(this.character.rig);
    this.motion = new PortraitMotion();
    this.rig.settle();

    // Set by speak(): the measured envelope of the clip being played, and the
    // element whose currentTime says how far into it we are. Reading the
    // element rather than counting frames means the mouth stays in sync
    // through a stall, a seek or a slow first frame.
    this.envelope = null;
    this.audio = null;
    this.mouthIndex = 0;

    this.loop = new Loop({
      update: (dt) => {
        this.motion.update(dt, Boolean(this.audio));
        // The motion clock only produces channel values; the rig is what
        // turns them into per-part transforms. Without this the character is
        // a still image with a moving mouth.
        this.rig.update(dt, this.motion);
      },
      render: () => this.draw(),
    });

    this._onResize = () => this._resizeCanvas();
  }

  start() {
    this._resizeCanvas();
    window.addEventListener('resize', this._onResize);
    this.loop.start();
  }

  stop() {
    this.loop.stop();
    window.removeEventListener('resize', this._onResize);
  }

  // Follow this element's playback with this envelope. The puppet does not
  // own the audio: the page still creates it, plays it and controls its
  // volume, which is what keeps the mobile autoplay unlock working.
  speak(envelope, audioElement) {
    this.envelope = envelope;
    this.audio = audioElement;
  }

  stopSpeaking() {
    this.envelope = null;
    this.audio = null;
  }

  get speaking() {
    return Boolean(this.audio && !this.audio.paused && !this.audio.ended);
  }

  // True once every part image the character actually uses has arrived. The
  // renderer copes with missing parts by itself (it skips them, and falls
  // back to a labelled box if nothing has loaded at all), so this is only for
  // holding the "starting up" overlay until there is a whole character to
  // show rather than half of one.
  get ready() {
    const needed = Object.entries(this.character.layers)
      .filter(([, variant]) => variant)
      .map(([part, variant]) => `${part}/${variant}`);
    needed.push('mouth/closed');
    return needed.every((path) => {
      const entry = this.images.entries.get(`${this.renderer.root}/${this.character.id}/${path}.png`);
      return entry && (entry.ready || entry.failed);
    });
  }

  // Canvas pixels are the CSS size times the device pixel ratio, or the
  // character is a blurry mess on a phone. Everything below is in CSS pixels;
  // the transform does the scaling.
  _resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.cssWidth = width;
    this.cssHeight = height;
    this.ratio = ratio;
  }

  // Where to put the portrait box so the requested slice of the figure fills
  // the canvas. The box is the full artwork; the canvas is a window onto it,
  // and everything outside is simply clipped.
  _layout() {
    const visible = Math.max(0.01, this.framing.bottom - this.framing.top);
    const boxHeight = this.cssHeight / visible;
    const boxWidth = boxHeight * ART_ASPECT;
    return {
      width: boxWidth,
      height: boxHeight,
      // draw() anchors a portrait at the feet, bottom-centre.
      x: this.cssWidth / 2 - (this.framing.centerX - 0.5) * boxWidth,
      y: boxHeight * (1 - this.framing.top),
    };
  }

  draw() {
    const { ctx } = this;
    if (!this.cssWidth) this._resizeCanvas();

    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    // Kept on the instance rather than local, so the mouth the page is
    // showing can be read from outside (tests, debugging) without guessing
    // from the canvas.
    this.mouthIndex = this.audio ? mouthIndexAt(this.envelope, this.audio.currentTime) : 0;
    const mouthIndex = this.mouthIndex;
    const box = this._layout();
    this.renderer.draw(ctx, this.character, this.rig, { blinking: this.motion.blinking, mouthIndex }, box);
  }
}

export { FRAMING, ART_ASPECT };
