import { ImageCache } from './image-cache.js';
import { Loop } from './loop.js';
import { Rig } from './rig.js';
import { PortraitMotion } from './portrait-motion.js';
import { PortraitRenderer } from './portrait-renderer.js';
import { createSenpai } from './senpai.js';

// The avatar: a cut-out puppet drawn on a canvas, breathing and drifting on
// its own, and moving its mouth in step with whatever audio element it was
// handed. It replaces a streamed talking-photo video, so it has to look alive
// even when nothing is being said - that is what the idle channels are for.

// The artwork is 695x1245, and every pivot in the rig is a fraction of that
// box, so the box has to keep this shape or the character stretches.
const ART_ASPECT = 695 / 1245;

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
const FRAMING = { top: 0, bottom: 0.46, centerX: 0.44 };

export class SpeakingPuppet {
  constructor(canvas, {
    assetRoot = 'assets/characters',
    framing = FRAMING,
    background = 'assets/backgrounds/classroom.jpg',
  } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.framing = framing;
    this.backgroundSrc = background;

    this.images = new ImageCache();
    this.renderer = new PortraitRenderer(this.images, assetRoot);
    this.character = createSenpai();
    this.rig = new Rig(this.character.rig);
    this.motion = new PortraitMotion(this.character.motion ?? undefined);
    this.rig.settle();

    // Set by speak(): whatever is currently reporting how loud the speech is.
    // Reading it live rather than from a precomputed track is what lets the
    // mouth move to audio that is still arriving.
    this.meter = null;
    this.mouthIndex = 0;

    this.loop = new Loop({
      update: (dt) => {
        this.motion.update(dt, Boolean(this.meter));
        this.mouthIndex = this.meter ? this.meter.update(dt) : 0;
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

  // Take the mouth from this meter until told otherwise. The puppet does not
  // own the audio: the page still plays it and controls its volume, which is
  // what keeps the mobile autoplay unlock working.
  speak(meter) {
    this.meter = meter ?? null;
    this.meter?.reset();
  }

  stopSpeaking() {
    this.meter = null;
    this.mouthIndex = 0;
  }

  get speaking() {
    return Boolean(this.meter);
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
    // The two parts the animation drives rather than `layers`, so they are
    // not in that list but still have to be loaded before she is shown.
    needed.push('mouth/closed', 'eyes/open');
    const partsReady = needed.every((path) => {
      const entry = this.images.entries.get(`${this.renderer.root}/${this.character.id}/${path}.png`);
      return entry && (entry.ready || entry.failed);
    });
    if (!partsReady) return false;
    if (!this.backgroundSrc) return true;
    const bg = this.images.entries.get(this.backgroundSrc);
    return Boolean(bg && (bg.ready || bg.failed));
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

  // The same classroom the story scene uses, cropped to fill rather than
  // stretched - she was standing in front of a flat panel before, which made
  // the frame read as a webcam tile rather than a place.
  _drawBackground(ctx) {
    if (!this.backgroundSrc) return;
    const entry = this.images.get(this.backgroundSrc);
    if (!entry.ready) return;
    const { width: iw, height: ih } = entry.image;
    const scale = Math.max(this.cssWidth / iw, this.cssHeight / ih);
    const w = iw * scale;
    const h = ih * scale;
    ctx.drawImage(entry.image, (this.cssWidth - w) / 2, (this.cssHeight - h) / 2, w, h);
  }

  draw() {
    const { ctx } = this;
    if (!this.cssWidth) this._resizeCanvas();

    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this._drawBackground(ctx);

    // mouthIndex is updated in the fixed-step loop rather than here, so the
    // mouth advances at a steady rate whatever the frame rate is doing.
    const mouthIndex = this.mouthIndex;
    const box = this._layout();
    this.renderer.draw(ctx, this.character, this.rig, { blinking: this.motion.blinking, mouthIndex }, box);
  }
}

export { FRAMING, ART_ASPECT };
