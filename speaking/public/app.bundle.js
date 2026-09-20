var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// public/src/puppet/image-cache.js
var ImageCache;
var init_image_cache = __esm({
  "public/src/puppet/image-cache.js"() {
    ImageCache = class {
      constructor() {
        this.entries = /* @__PURE__ */ new Map();
      }
      get(src) {
        let entry = this.entries.get(src);
        if (entry) return entry;
        entry = { image: null, ready: false, failed: false };
        this.entries.set(src, entry);
        if (typeof Image === "undefined") return entry;
        const img = new Image();
        img.onload = () => {
          entry.image = img;
          entry.ready = true;
        };
        img.onerror = () => {
          entry.failed = true;
        };
        img.src = src;
        return entry;
      }
    };
  }
});

// public/src/puppet/loop.js
var STEP, MAX_FRAME, Loop;
var init_loop = __esm({
  "public/src/puppet/loop.js"() {
    STEP = 1 / 60;
    MAX_FRAME = 0.25;
    Loop = class {
      constructor({ update, render }) {
        this.update = update;
        this.render = render;
        this.accumulator = 0;
        this.last = 0;
        this.running = false;
        this.frame = 0;
        this.fps = 60;
        this._fpsAccum = 0;
        this._fpsFrames = 0;
        this._tick = this._tick.bind(this);
      }
      start() {
        if (this.running) return;
        this.running = true;
        this.last = performance.now();
        requestAnimationFrame(this._tick);
      }
      stop() {
        this.running = false;
      }
      _tick(now) {
        if (!this.running) return;
        requestAnimationFrame(this._tick);
        let delta = (now - this.last) / 1e3;
        this.last = now;
        if (delta > MAX_FRAME) delta = MAX_FRAME;
        this.accumulator += delta;
        while (this.accumulator >= STEP) {
          this.update(STEP);
          this.accumulator -= STEP;
          this.frame++;
        }
        this.render(delta);
        this._fpsAccum += delta;
        this._fpsFrames++;
        if (this._fpsAccum >= 0.5) {
          this.fps = this._fpsFrames / this._fpsAccum;
          this._fpsAccum = 0;
          this._fpsFrames = 0;
        }
      }
    };
  }
});

// public/src/puppet/spring.js
var SUB_STEP, MAX_STEP, Spring;
var init_spring = __esm({
  "public/src/puppet/spring.js"() {
    SUB_STEP = 1 / 120;
    MAX_STEP = 0.25;
    Spring = class {
      // `stiffness` pulls toward the target, `damping` bleeds off velocity.
      // Higher stiffness = snappier catch-up; higher damping = less overshoot.
      constructor({ stiffness = 90, damping = 11, value = 0 } = {}) {
        this.stiffness = stiffness;
        this.damping = damping;
        this.value = value;
        this.velocity = 0;
      }
      step(target, dt) {
        let remaining = Math.min(dt, MAX_STEP);
        while (remaining > 0) {
          const h = Math.min(SUB_STEP, remaining);
          const accel = (target - this.value) * this.stiffness - this.velocity * this.damping;
          this.velocity += accel * h;
          this.value += this.velocity * h;
          remaining -= h;
        }
        return this.value;
      }
      // Jumps to the target with no motion - used when a character first
      // appears, so it does not visibly swing into place from zero.
      reset(value = 0) {
        this.value = value;
        this.velocity = 0;
      }
    };
  }
});

// public/src/puppet/rig.js
var BREATHE_SCALE, TILT_RAD, SWAY_RAD, Rig;
var init_rig = __esm({
  "public/src/puppet/rig.js"() {
    init_spring();
    BREATHE_SCALE = 0.03;
    TILT_RAD = 0.012;
    SWAY_RAD = 0.02;
    Rig = class {
      // `parts` is the draw order, back to front. Each entry:
      //   name     asset slot name -> assets/characters/<id>/<name>/<variant>.png
      //   parent   name of the part this one hangs off (transforms compose)
      //   pivot    [x, y] as fractions of the portrait box, x from the left and
      //            y from the TOP - the joint this part rotates around
      //   breathe  0..1 weight - vertical scale about this part's own pivot
      //   tilt/sway  0..1 weights - rotation, from two independent slow drifts
      //   spring   { stiffness, damping, amount } - lag behind the parent's
      //            rotation instead of following it rigidly (hair, loose sleeves)
      //   blink    true: variant is driven by the blink timer (open/closed)
      //   talk     true: variant is driven by the mouth timer while speaking
      constructor(parts = []) {
        this.parts = parts.map((p) => ({
          name: p.name,
          parent: p.parent ?? null,
          pivot: p.pivot ?? [0.5, 1],
          breathe: p.breathe ?? 0,
          tilt: p.tilt ?? 0,
          sway: p.sway ?? 0,
          blink: p.blink ?? false,
          talk: p.talk ?? false,
          springConfig: p.spring ?? null,
          spring: p.spring ? new Spring(p.spring) : null,
          transform: { angle: 0, scaleX: 1, scaleY: 1 },
          worldAngle: 0,
          // Product of every ancestor's APPLIED scale. The renderer divides this
          // back out of the part's own scale, so a parent's breath moves the part
          // without stretching it, and a part whose parent already cancelled the
          // scale inherits 1 and simply rides that parent. See
          // PortraitRenderer._applyPose.
          parentScaleY: 1
        }));
        this.byName = new Map(this.parts.map((p) => [p.name, p]));
        this.updateOrder = [...this.parts].sort((a, b) => this._depth(a) - this._depth(b));
      }
      _depth(part) {
        let depth = 0;
        let current = part;
        const seen = /* @__PURE__ */ new Set();
        while (current?.parent && !seen.has(current.name)) {
          seen.add(current.name);
          current = this.byName.get(current.parent);
          if (!current) break;
          depth++;
        }
        return depth;
      }
      // `motion` is a PortraitMotion: normalised channels, not pixel amounts.
      update(dt, motion) {
        for (const part of this.updateOrder) {
          const t = part.transform;
          const parent = part.parent ? this.byName.get(part.parent) : null;
          t.scaleX = 1;
          t.scaleY = 1 + motion.breathe * part.breathe * BREATHE_SCALE;
          t.angle = motion.tilt * part.tilt * TILT_RAD + motion.sway * part.sway * SWAY_RAD;
          part.parentScaleY = parent ? parent.parentScaleY * (parent.transform.scaleY / parent.parentScaleY) : 1;
          const parentAngle = parent?.worldAngle ?? 0;
          if (part.spring) {
            const springAngle = part.spring.step(parentAngle, dt);
            t.angle += (springAngle - parentAngle) * (part.springConfig.amount ?? 1);
          }
          part.worldAngle = parentAngle + t.angle;
        }
      }
      // Called when a character comes on stage, so springs start settled at
      // their target instead of visibly swinging in from zero.
      settle() {
        for (const part of this.parts) part.spring?.reset(0);
      }
      chainTo(name) {
        const chain = [];
        let current = this.byName.get(name);
        const seen = /* @__PURE__ */ new Set();
        while (current && !seen.has(current.name)) {
          seen.add(current.name);
          chain.unshift(current);
          current = current.parent ? this.byName.get(current.parent) : null;
        }
        return chain;
      }
    };
  }
});

// public/src/puppet/portrait-motion.js
var PortraitMotion;
var init_portrait_motion = __esm({
  "public/src/puppet/portrait-motion.js"() {
    PortraitMotion = class {
      constructor({
        breathePeriod = 4.2,
        inhaleFraction = 0.32,
        exhaleFraction = 0.48,
        tiltPeriod = 7.5,
        swayPeriod = 5.6,
        blinkEvery = [2.5, 5.5],
        blinkDuration = 0.12,
        doubleBlinkChance = 0.25,
        mouthFps = 9
      } = {}) {
        this.breathePeriod = breathePeriod;
        this.inhaleFraction = inhaleFraction;
        this.exhaleFraction = exhaleFraction;
        this.tiltPeriod = tiltPeriod;
        this.swayPeriod = swayPeriod;
        this.blinkEvery = blinkEvery;
        this.blinkDuration = blinkDuration;
        this.doubleBlinkChance = doubleBlinkChance;
        this.mouthFps = mouthFps;
        this.t = Math.random() * 10;
        this.blinkT = 0;
        this.nextBlinkAt = this._rollNextBlink();
        this.blinking = false;
        this.pendingDoubleBlink = false;
        this.speaking = false;
        this._mouthIndex = 0;
        this._mouthT = 0;
      }
      _rollNextBlink() {
        const [lo, hi] = this.blinkEvery;
        return lo + Math.random() * (hi - lo);
      }
      update(dt, speaking = false) {
        this.t += dt;
        this.speaking = speaking;
        this._updateBlink(dt);
        this._updateMouth(dt, speaking);
      }
      _updateBlink(dt) {
        this.blinkT += dt;
        if (this.blinking) {
          if (this.blinkT >= this.blinkDuration) {
            this.blinking = false;
            this.blinkT = 0;
            if (this.pendingDoubleBlink) {
              this.pendingDoubleBlink = false;
              this.nextBlinkAt = this.blinkDuration * 1.5;
            } else {
              this.nextBlinkAt = this._rollNextBlink();
            }
          }
        } else if (this.blinkT >= this.nextBlinkAt) {
          this.blinking = true;
          this.blinkT = 0;
          this.pendingDoubleBlink = Math.random() < this.doubleBlinkChance;
        }
      }
      // Which eye drawing to show. A blink that cuts straight from open to shut
      // and back reads as a glitch at close range; passing through a half-lidded
      // frame at each end costs two frames and reads as an eyelid. A character
      // with no `half` art simply never sees that variant, because the renderer
      // falls back when the file is missing.
      get eyeVariant() {
        if (!this.blinking) return "open";
        const progress = this.blinkDuration > 0 ? this.blinkT / this.blinkDuration : 1;
        return progress < 0.25 || progress > 0.75 ? "half" : "closed";
      }
      _updateMouth(dt, speaking) {
        if (!speaking) {
          this._mouthIndex = 0;
          this._mouthT = 0;
          return;
        }
        this._mouthT += dt;
        const frameDur = 1 / this.mouthFps;
        while (this._mouthT >= frameDur) {
          this._mouthT -= frameDur;
          this._mouthIndex = Math.floor(Math.random() * 3);
        }
      }
      // A real breath is not a sine: the inhale is quicker than the exhale, and
      // there is a short rest before the next one. That asymmetry is most of
      // what separates "breathing" from "oscillating" - a symmetric wave reads
      // as a machine no matter how small you make it.
      //
      // Returns 0 at rest and 1 at full inhale, so a part at rest sits at
      // exactly its drawn size rather than permanently contracted.
      get breathe() {
        const phase = this.t / this.breathePeriod % 1;
        const { inhaleFraction: inhale, exhaleFraction: exhale } = this;
        if (phase < inhale) {
          return 0.5 - 0.5 * Math.cos(phase / inhale * Math.PI);
        }
        if (phase < inhale + exhale) {
          return 0.5 + 0.5 * Math.cos((phase - inhale) / exhale * Math.PI);
        }
        return 0;
      }
      get tilt() {
        return Math.sin(this.t / this.tiltPeriod * Math.PI * 2 + 1.7);
      }
      get sway() {
        return Math.sin(this.t / this.swayPeriod * Math.PI * 2 + 0.6);
      }
      get mouthIndex() {
        return this.speaking ? this._mouthIndex : 0;
      }
    };
  }
});

// public/src/puppet/portrait-renderer.js
function opaqueBounds(image) {
  const { naturalWidth: w, naturalHeight: h } = image;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { empty: true };
  return {
    empty: false,
    sx: x0,
    sy: y0,
    sw: x1 - x0 + 1,
    sh: y1 - y0 + 1,
    fx: x0 / w,
    fy: y0 / h,
    fw: (x1 - x0 + 1) / w,
    fh: (y1 - y0 + 1) / h
  };
}
var DEFAULT_ROOT, MOUTH_VARIANTS, PortraitRenderer;
var init_portrait_renderer = __esm({
  "public/src/puppet/portrait-renderer.js"() {
    DEFAULT_ROOT = "assets/characters";
    MOUTH_VARIANTS = ["closed", "half", "open"];
    PortraitRenderer = class {
      constructor(images, root = DEFAULT_ROOT) {
        this.images = images;
        this.root = root;
      }
      // (x, y) is the bottom-center anchor point (the character's feet). Parts
      // are drawn into a `width` x `height` box rising from there, which is also
      // the space every part pivot is expressed in.
      draw(ctx, character, rig, motion, { x, y, width = 300, height = 540, mirror = false, dim = false } = {}) {
        if (!character) return;
        ctx.save();
        ctx.globalAlpha = dim ? 0.55 : 1;
        ctx.translate(x, y);
        if (mirror) ctx.scale(-1, 1);
        let drewAny = false;
        const parts = rig?.parts ?? [];
        for (const part of parts) {
          const variant = this._variantFor(character, part, motion);
          if (!variant) continue;
          const entry = this.images.get(`${this.root}/${character.id}/${part.name}/${variant}.png`);
          if (!entry.ready) continue;
          if (entry.bounds === void 0) entry.bounds = opaqueBounds(entry.image);
          const bounds = entry.bounds;
          if (bounds?.empty) continue;
          ctx.save();
          const chain = rig.chainTo(part.name);
          for (const node of chain) this._applyPose(ctx, node, width, height);
          if (bounds) {
            ctx.drawImage(
              entry.image,
              bounds.sx,
              bounds.sy,
              bounds.sw,
              bounds.sh,
              -width / 2 + bounds.fx * width,
              -height + bounds.fy * height,
              bounds.fw * width,
              bounds.fh * height
            );
          } else {
            ctx.drawImage(entry.image, -width / 2, -height, width, height);
          }
          ctx.restore();
          drewAny = true;
        }
        if (!drewAny) this._drawPlaceholder(ctx, character, width, height, mirror);
        ctx.restore();
      }
      // Rotate/scale around the part's own pivot, then offset. Pivots arrive as
      // fractions of the box (x from the left, y from the top); the drawing
      // origin is the feet, so y has to be re-based onto that.
      //
      // Every node in the chain is replayed exactly as it is drawn in its own
      // right - scale divided by what it inherited. A breathing chest therefore
      // still lifts the head riding on it, but the head is not stretched, and
      // anything hanging off the head inherits 1 and simply goes where the head
      // goes. Replaying ancestors at their full nominal scale instead would make
      // each part re-cancel the same breath around its own pivot, which moves
      // parts by different amounts depending on where their joint sits.
      _applyPose(ctx, part, width, height) {
        const t = part.transform;
        const pivotX = (part.pivot[0] - 0.5) * width;
        const pivotY = (part.pivot[1] - 1) * height;
        const scaleY = t.scaleY / (part.parentScaleY || 1);
        ctx.translate(pivotX, pivotY);
        ctx.rotate(t.angle);
        ctx.scale(t.scaleX, scaleY);
        ctx.translate(-pivotX, -pivotY);
      }
      _variantFor(character, part, motion) {
        if (part.blink) return motion?.eyeVariant ?? (motion?.blinking ? "closed" : "open");
        if (part.talk) return MOUTH_VARIANTS[motion?.mouthIndex ?? 0] ?? "closed";
        return character.getLayer(part.name);
      }
      _drawPlaceholder(ctx, character, width, height, mirror) {
        ctx.save();
        if (mirror) ctx.scale(-1, 1);
        ctx.fillStyle = "rgba(127, 212, 255, 0.14)";
        ctx.strokeStyle = "rgba(127, 212, 255, 0.55)";
        ctx.lineWidth = 2;
        const r = 18;
        const x0 = -width / 2;
        const y0 = -height;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + width, y0, x0 + width, y0 + height, r);
        ctx.arcTo(x0 + width, y0 + height, x0, y0 + height, r);
        ctx.arcTo(x0, y0 + height, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + width, y0, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#eaf3ff";
        ctx.textAlign = "center";
        ctx.font = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
        ctx.fillText(character.name, 0, -height / 2);
        ctx.restore();
      }
    };
  }
});

// public/src/puppet/character.js
var Character;
var init_character = __esm({
  "public/src/puppet/character.js"() {
    Character = class _Character {
      constructor(id, { name, rig = [], layers = {}, expression = "neutral", motion = null } = {}) {
        this.id = id;
        this.name = name ?? id;
        this.rig = rig.map((part) => ({ ...part }));
        this.layers = { ...layers };
        this.expression = expression;
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
        if (this.slots.includes("face")) this.layers.face = name;
      }
      clone() {
        return new _Character(this.id, {
          name: this.name,
          rig: this.rig,
          layers: this.layers,
          expression: this.expression,
          motion: this.motion
        });
      }
    };
  }
});

// public/src/puppet/senpai.js
function createSenpai() {
  return new Character("senpai", {
    name: "\u5B78\u59CA",
    rig: SENPAI_RIG,
    motion: SENPAI_MOTION,
    layers: {
      hair_back: "default",
      lower: "default",
      torso: "default",
      skirt: "default",
      bodice: "default",
      arm_r: "default",
      head: "default",
      hair_front: "default",
      bows: "default"
    }
  });
}
var SENPAI_RIG, SENPAI_MOTION;
var init_senpai = __esm({
  "public/src/puppet/senpai.js"() {
    init_character();
    SENPAI_RIG = [
      // Long hair, behind everything, lagging the head. `amount` is the important
      // number: it is how much of the spring's deviation from the head is actually
      // applied, and it is what decides whether the hair reads as attached. Too
      // high and the hair swings independently of the skull, which looks like a
      // wig sliding around rather than hair moving.
      { name: "hair_back", parent: "head", pivot: [0.42, 0.035], spring: { stiffness: 150, damping: 13, amount: 0.5 } },
      // Legs. The one part that genuinely does not move - it is what makes
      // everything above it read as motion rather than the whole image drifting.
      { name: "lower", pivot: [0.44, 1] },
      // Waist to shoulders. Both rotation channels, on their own periods, so the
      // body is never repeating one obvious loop.
      { name: "torso", pivot: [0.44, 0.36], breathe: 1.6, tilt: 3, sway: 1.2 },
      // The skirt hangs off the waist and swings well past the body, because it
      // can: there is a whole painted figure behind it. A dress that follows a
      // beat late is most of what sells this character.
      { name: "skirt", parent: "torso", pivot: [0.44, 0.36], sway: 2.6, spring: { stiffness: 70, damping: 8, amount: 1.1 } },
      // The bodice is cloth too, but fitted, so it just rides the torso.
      { name: "bodice", parent: "torso", pivot: [0.44, 0.36] },
      // The raised arm needs a drift of its own, not just a spring: the torso
      // rotates little enough that lag alone comes out at a fraction of a degree
      // and the arm reads as welded on. Opposite sign to the skirt so the two
      // never swing as one slab.
      { name: "arm_r", parent: "torso", pivot: [0.56, 0.245], sway: -2.6, spring: { stiffness: 80, damping: 10, amount: 0.7 } },
      // The head counter-rotates against the torso, which turns a stiff sway into
      // something that reads as her shifting her weight.
      { name: "head", parent: "torso", pivot: [0.43, 0.205], tilt: -0.9, sway: 1.2 },
      // Blinking: open -> half -> closed -> half -> open.
      //
      // This only works because the face layer has NO eyes drawn on it. The first
      // face had the eye whites and lashes painted in, so a closed eye left white
      // showing and the painted lashes sat still while the eye drawings changed -
      // which is what looked wrong, not the blink itself. All three eye drawings
      // here are the artist's.
      { name: "eyes", parent: "head", blink: true, pivot: [0.43, 0.205] },
      // Lip sync. Driven by the talk timer, not by `layers`: closed / half / open.
      { name: "mouth", parent: "head", talk: true, pivot: [0.43, 0.205] },
      // Bangs. Stiffer and lighter than the hair behind, so the two never swing
      // as one slab.
      { name: "hair_front", parent: "head", pivot: [0.42, 0.035], spring: { stiffness: 210, damping: 15, amount: 0.35 } },
      // The waist ties: tiny, loose, and the fastest thing on her.
      { name: "bows", parent: "torso", pivot: [0.44, 0.36], spring: { stiffness: 220, damping: 8, amount: 1.4 } }
    ];
    SENPAI_MOTION = {
      breathePeriod: 3.2,
      tiltPeriod: 4.3,
      swayPeriod: 3.1
    };
  }
});

// public/src/puppet/speaking-puppet.js
var ART_ASPECT, FRAMING, SpeakingPuppet;
var init_speaking_puppet = __esm({
  "public/src/puppet/speaking-puppet.js"() {
    init_image_cache();
    init_loop();
    init_rig();
    init_portrait_motion();
    init_portrait_renderer();
    init_senpai();
    ART_ASPECT = 695 / 1245;
    FRAMING = { top: 0, bottom: 0.46, centerX: 0.44 };
    SpeakingPuppet = class {
      constructor(canvas, {
        assetRoot = "assets/characters",
        framing = FRAMING,
        background = "assets/backgrounds/classroom.jpg"
      } = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.framing = framing;
        this.backgroundSrc = background;
        this.images = new ImageCache();
        this.renderer = new PortraitRenderer(this.images, assetRoot);
        this.character = createSenpai();
        this.rig = new Rig(this.character.rig);
        this.motion = new PortraitMotion(this.character.motion ?? void 0);
        this.rig.settle();
        this.meter = null;
        this.mouthIndex = 0;
        this.loop = new Loop({
          update: (dt) => {
            this.motion.update(dt, Boolean(this.meter));
            this.mouthIndex = this.meter ? this.meter.update(dt) : 0;
            this.rig.update(dt, this.motion);
          },
          render: () => this.draw()
        });
        this._onResize = () => this._resizeCanvas();
      }
      start() {
        this._resizeCanvas();
        window.addEventListener("resize", this._onResize);
        this.loop.start();
      }
      stop() {
        this.loop.stop();
        window.removeEventListener("resize", this._onResize);
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
        const needed = Object.entries(this.character.layers).filter(([, variant]) => variant).map(([part, variant]) => `${part}/${variant}`);
        needed.push("mouth/closed", "eyes/open");
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
          y: boxHeight * (1 - this.framing.top)
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
        const mouthIndex = this.mouthIndex;
        const box = this._layout();
        this.renderer.draw(ctx, this.character, this.rig, { blinking: this.motion.blinking, mouthIndex }, box);
      }
    };
  }
});

// public/src/puppet/sentences.js
function splitSentences(text) {
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pieces = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    current += ch;
    if (!ENDINGS.includes(ch)) continue;
    while (i + 1 < trimmed.length && ENDINGS.includes(trimmed[i + 1])) {
      current += trimmed[++i];
    }
    pieces.push(current.trim());
    current = "";
  }
  if (current.trim()) pieces.push(current.trim());
  const merged = merge(pieces.flatMap((piece) => splitIfLong(piece, MAX_LENGTH)));
  if (merged.length && merged[0].length > FIRST_MAX_LENGTH) {
    merged.splice(0, 1, ...splitIfLong(merged[0], FIRST_MAX_LENGTH));
  }
  return merged;
}
function splitIfLong(piece, cap) {
  if (piece.length <= cap) return [piece];
  const out = [];
  let rest = piece;
  while (rest.length > cap) {
    let cut = -1;
    for (let i = Math.min(cap, rest.length - 1); i >= MIN_LENGTH; i--) {
      if (PAUSES.includes(rest[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut === -1) cut = cap;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
function merge(pieces) {
  const out = [];
  for (const piece of pieces) {
    const previous = out[out.length - 1];
    if (previous && (piece.length < MIN_LENGTH || previous.length < MIN_LENGTH) && previous.length + piece.length <= MAX_LENGTH) {
      out[out.length - 1] = previous + piece;
    } else {
      out.push(piece);
    }
  }
  return out;
}
var ENDINGS, PAUSES, MIN_LENGTH, MAX_LENGTH, FIRST_MAX_LENGTH;
var init_sentences = __esm({
  "public/src/puppet/sentences.js"() {
    ENDINGS = "\u3002\uFF01\uFF1F!?\u2026";
    PAUSES = "\uFF0C\u3001\uFF1B;,";
    MIN_LENGTH = 8;
    MAX_LENGTH = 60;
    FIRST_MAX_LENGTH = 24;
  }
});

// public/src/puppet/lipsync.js
function mouthIndexForLevel(level) {
  if (level >= WIDE_OPEN_AT) return 2;
  if (level >= HALF_OPEN_AT) return 1;
  return 0;
}
function rmsOf(analyser, scratch) {
  analyser.getByteTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const sample = (scratch[i] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / scratch.length);
}
var HOP_SECONDS, HALF_OPEN_AT, WIDE_OPEN_AT, CLOSE_RATE, REFERENCE_HALF_LIFE, SILENCE_FLOOR, MouthTrack, MouthMeter;
var init_lipsync = __esm({
  "public/src/puppet/lipsync.js"() {
    HOP_SECONDS = 0.06;
    HALF_OPEN_AT = 0.14;
    WIDE_OPEN_AT = 0.42;
    CLOSE_RATE = 0.45;
    REFERENCE_HALF_LIFE = 2;
    SILENCE_FLOOR = 4e-3;
    MouthTrack = class {
      constructor({ hop = HOP_SECONDS } = {}) {
        this.hop = hop;
        this.reset();
      }
      reset() {
        this.index = 0;
        this.level = 0;
        this.reference = SILENCE_FLOOR;
        this._elapsed = 0;
        this._loudest = 0;
      }
      // `rms` is the loudness of the audio right now (0..1), `dt` seconds since
      // the last call. Call it as often as you like - the shape only moves on the
      // window boundary.
      push(rms, dt) {
        this._loudest = Math.max(this._loudest, rms);
        this._elapsed += dt;
        if (this._elapsed < this.hop) return this.index;
        const windows = Math.floor(this._elapsed / this.hop);
        this._elapsed -= windows * this.hop;
        const decay = Math.pow(0.5, windows * this.hop / REFERENCE_HALF_LIFE);
        this.reference = Math.max(SILENCE_FLOOR, this.reference * decay, this._loudest);
        const raw = Math.min(1, this._loudest / this.reference);
        const floor = this.level - CLOSE_RATE * windows;
        this.level = this._loudest <= SILENCE_FLOOR ? 0 : Math.max(raw, floor);
        this.index = mouthIndexForLevel(this.level);
        this._loudest = 0;
        return this.index;
      }
    };
    MouthMeter = class {
      constructor(audioContext, mediaElement) {
        this.track = new MouthTrack();
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 1024;
        this.scratch = new Uint8Array(this.analyser.fftSize);
        this.source = audioContext.createMediaElementSource(mediaElement);
        this.source.connect(this.analyser);
        this.analyser.connect(audioContext.destination);
      }
      update(dt) {
        return this.track.push(rmsOf(this.analyser, this.scratch), dt);
      }
      reset() {
        this.track.reset();
      }
      get index() {
        return this.track.index;
      }
    };
  }
});

// public/src/speech.js
function silentWavUrl() {
  const rate = 8e3;
  const frames = 400;
  const bytes = frames * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, bytes, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}
async function describeFailure(src) {
  try {
    const res = await fetch(src);
    const data = await res.json();
    if (data.error) return new Error([data.error, data.detail].filter(Boolean).join("\uFF1A"));
  } catch {
  }
  return new Error("\u8A9E\u97F3\u64AD\u653E\u5931\u6557\uFF0C\u8ACB\u518D\u8A66\u4E00\u6B21\u3002");
}
var SILENCE_URL, SpeechQueue;
var init_speech = __esm({
  "public/src/speech.js"() {
    init_sentences();
    init_lipsync();
    SILENCE_URL = silentWavUrl();
    SpeechQueue = class {
      // `elements` is two <audio> elements. `onMouth` is handed the meter for
      // whichever element is currently speaking, and null when nothing is.
      constructor(elements, { onMouth = () => {
      }, onPiece = () => {
      } } = {}) {
        this.elements = elements;
        this.onMouth = onMouth;
        this.onPiece = onPiece;
        this.meters = null;
        this.context = null;
        this.generation = 0;
        this.volume = 1;
        for (const el of elements) {
          el.preload = "auto";
          el.src = SILENCE_URL;
        }
      }
      // Must be called from inside a real user gesture. Mobile browsers only
      // honour playback that a person started, and Gemini takes seconds to answer
      // - long past the point where iOS Safari still counts the gesture as recent.
      // Playing a moment of silence now leaves both elements unlocked for the real
      // audio later, and opens the AudioContext the mouth meter needs.
      unlock() {
        if (!this.context) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (Ctx) this.context = new Ctx();
        }
        this.context?.resume?.().catch(() => {
        });
        for (const el of this.elements) {
          el.play().catch(() => {
          });
        }
        if (this.context && !this.meters) {
          this.meters = this.elements.map((el) => new MouthMeter(this.context, el));
        }
      }
      setVolume(value) {
        this.volume = value;
        for (const el of this.elements) el.volume = value;
      }
      stop() {
        this.generation++;
        for (const el of this.elements) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        this.onMouth(null);
      }
      // Resolves when the whole answer has been spoken. Throws if a clause could
      // not be fetched, with the server's own message where there is one.
      async speak(text, { rate = 1 } = {}) {
        const pieces = splitSentences(text);
        if (!pieces.length) return;
        const generation = ++this.generation;
        const url = (piece) => `/api/tts?${new URLSearchParams({ text: piece, rate: String(rate) })}`;
        this.elements[0].src = url(pieces[0]);
        for (let i = 0; i < pieces.length; i++) {
          if (generation !== this.generation) return;
          const element = this.elements[i % 2];
          const meter = this.meters?.[i % 2] ?? null;
          meter?.reset();
          this.onPiece(pieces[i], i, pieces.length);
          this.onMouth(meter);
          const playing = this._play(element, generation);
          const next = pieces[i + 1];
          if (next) this.elements[(i + 1) % 2].src = url(next);
          await playing;
        }
        if (generation === this.generation) this.onMouth(null);
      }
      async _play(element, generation) {
        element.volume = this.volume;
        try {
          await element.play();
        } catch {
          throw new Error("\u700F\u89BD\u5668\u64CB\u4E0B\u4E86\u81EA\u52D5\u64AD\u653E\uFF0C\u8ACB\u518D\u6309\u4E00\u6B21\u9001\u51FA\u3002");
        }
        await new Promise((resolve, reject) => {
          const done = () => {
            element.removeEventListener("ended", onEnded);
            element.removeEventListener("error", onError);
          };
          const onEnded = () => {
            done();
            resolve();
          };
          const onError = async () => {
            done();
            if (generation !== this.generation) return resolve();
            reject(await describeFailure(element.currentSrc));
          };
          element.addEventListener("ended", onEnded);
          element.addEventListener("error", onError);
        });
      }
    };
  }
});

// public/src/app.js
var require_app = __commonJS({
  "public/src/app.js"() {
    init_speaking_puppet();
    init_speech();
    var GREETING = "\u4F60\u597D\u5440\uFF01\u6211\u662F\u5B78\u59CA\u3002\u4E0D\u7BA1\u662F\u529F\u8AB2\u3001\u8003\u8A66\u9084\u662F\u793E\u5718\uFF0C\u6709\u4EC0\u9EBC\u554F\u984C\u90FD\u53EF\u4EE5\u554F\u6211\u5594\u3002";
    var avatarCanvas = document.getElementById("avatarCanvas");
    var audioElements = [
      document.getElementById("avatarAudio"),
      document.getElementById("avatarAudioNext")
    ];
    var loadingOverlay = document.getElementById("loadingOverlay");
    var loadingStatus = document.getElementById("loadingStatus");
    var speakingBadge = document.getElementById("speakingBadge");
    var statusTag = document.getElementById("statusTag");
    var newChatBtn = document.getElementById("newChatBtn");
    var historyList = document.getElementById("historyList");
    var historyEmpty = document.getElementById("historyEmpty");
    var chatScroll = document.getElementById("chatScroll");
    var askForm = document.getElementById("askForm");
    var questionInput = document.getElementById("questionInput");
    var askBtn = document.getElementById("askBtn");
    var rateRange = document.getElementById("rateRange");
    var volumeRange = document.getElementById("volumeRange");
    var rateVal = document.getElementById("rateVal");
    var volumeVal = document.getElementById("volumeVal");
    var hint = document.getElementById("hint");
    var puppet = new SpeakingPuppet(avatarCanvas);
    var askedAt = 0;
    var speech = new SpeechQueue(audioElements, {
      onMouth: (meter) => puppet.speak(meter),
      onPiece: (piece, index) => {
        if (index === 0 && askedAt) {
          console.info(`\u7B2C\u4E00\u53E5\u8A9E\u97F3\uFF1A\u9001\u51FA\u5F8C ${((performance.now() - askedAt) / 1e3).toFixed(1)} \u79D2`);
        }
      }
    });
    window.puppet = puppet;
    window.speech = speech;
    var turnCount = 0;
    function setStatus(label, variant) {
      statusTag.textContent = label;
      statusTag.className = `tag ${variant}`;
    }
    function setAskEnabled(enabled) {
      askBtn.disabled = !enabled;
    }
    function scrollToBottom() {
      requestAnimationFrame(() => {
        chatScroll.scrollTop = chatScroll.scrollHeight;
      });
    }
    function addChatRow(role, text) {
      const row = document.createElement("div");
      row.className = `chat-row ${role}`;
      const label = document.createElement("div");
      label.className = "chat-label";
      label.textContent = role === "user" ? "\u4F60" : "\u5B78\u59CA";
      const bubble = document.createElement("div");
      bubble.className = "chat-bubble";
      bubble.textContent = text;
      row.append(label, bubble);
      chatScroll.appendChild(row);
      scrollToBottom();
      return row;
    }
    function addThinkingRow() {
      const row = document.createElement("div");
      row.className = "chat-row ai";
      row.innerHTML = `<div class="chat-label">AI \u52A9\u7406</div><div class="chat-bubble chat-bubble-thinking">\u601D\u8003\u4E2D\u2026</div>`;
      chatScroll.appendChild(row);
      scrollToBottom();
      return row;
    }
    function addErrorRow(text) {
      const row = document.createElement("div");
      row.className = "chat-row ai";
      const label = document.createElement("div");
      label.className = "chat-label";
      label.textContent = "\u932F\u8AA4";
      const bubble = document.createElement("div");
      bubble.className = "chat-bubble chat-bubble-error";
      bubble.textContent = text;
      row.append(label, bubble);
      chatScroll.appendChild(row);
      scrollToBottom();
      return row;
    }
    function addHistoryEntry(question, targetRow) {
      historyEmpty.hidden = true;
      turnCount += 1;
      const item = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = question.length > 24 ? `${question.slice(0, 24)}\u2026` : question;
      const time = document.createElement("span");
      time.className = "history-time";
      time.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-TW", { hour12: false });
      btn.append(title, time);
      btn.addEventListener("click", () => {
        targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      item.appendChild(btn);
      historyList.prepend(item);
    }
    function resetChat() {
      stopSpeaking();
      chatScroll.innerHTML = "";
      addChatRow("ai", GREETING);
      historyList.innerHTML = "";
      historyList.appendChild(historyEmpty);
      historyEmpty.hidden = false;
      turnCount = 0;
      hint.textContent = "";
    }
    newChatBtn.addEventListener("click", resetChat);
    puppet.start();
    function waitForPuppet() {
      if (puppet.ready) {
        loadingOverlay.hidden = true;
        setStatus("\u5F85\u547D\u4E2D", "tag-accent");
        setAskEnabled(true);
        hint.textContent = "";
        return;
      }
      requestAnimationFrame(waitForPuppet);
    }
    waitForPuppet();
    fetch("/api/health").then((res) => res.json()).then((health) => {
      if (!health.gemini) {
        addErrorRow(
          "\u4F3A\u670D\u5668\u6C92\u6709\u8A2D\u5B9A GEMINI_API_KEY\uFF0C\u554F\u7B54\u548C\u8A9E\u97F3\u90FD\u4E0D\u6703\u6709\u53CD\u61C9\u3002\u8ACB\u5728\u90E8\u7F72\u74B0\u5883\u7684\u74B0\u5883\u8B8A\u6578\u52A0\u4E0A\u9019\u4E00\u628A\uFF08Render\uFF1AEnvironment \u5206\u9801\uFF09\uFF0C\u7136\u5F8C\u91CD\u65B0\u90E8\u7F72\u3002"
        );
      }
    }).catch(() => {
      addErrorRow("\u9023\u4E0D\u4E0A\u4F3A\u670D\u5668\u3002\u5982\u679C\u662F\u525B\u90E8\u7F72\uFF0C\u514D\u8CBB\u65B9\u6848\u7684\u51B7\u555F\u52D5\u53EF\u80FD\u8981\u7B49\u5341\u5E7E\u79D2\uFF0C\u91CD\u65B0\u6574\u7406\u518D\u8A66\u4E00\u6B21\u3002");
    });
    speech.setVolume(Number(volumeRange.value));
    function stopSpeaking() {
      speech.stop();
      puppet.stopSpeaking();
      speakingBadge.hidden = true;
    }
    async function askQuestion(question) {
      hint.textContent = "";
      setAskEnabled(false);
      setStatus("\u601D\u8003\u4E2D", "tag-outline");
      addChatRow("user", question);
      const thinkingRow = addThinkingRow();
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "\u554F\u7B54\u670D\u52D9\u767C\u751F\u932F\u8AA4");
        }
        thinkingRow.remove();
        const answerRow = addChatRow("ai", data.answer);
        addHistoryEntry(question, answerRow);
        setStatus("\u8AAA\u8A71\u4E2D", "tag-accent");
        speakingBadge.hidden = false;
        await speech.speak(data.answer, { rate: Number(rateRange.value) });
        speakingBadge.hidden = true;
      } catch (err) {
        console.error(err);
        thinkingRow.remove();
        addErrorRow(err.message || "\u767C\u751F\u932F\u8AA4\uFF0C\u8ACB\u91CD\u8A66\u3002");
        hint.textContent = "";
      } finally {
        speakingBadge.hidden = true;
        puppet.stopSpeaking();
        setStatus("\u5F85\u547D\u4E2D", "tag-accent");
        setAskEnabled(true);
      }
    }
    askForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const question = questionInput.value.trim();
      if (!question) {
        hint.textContent = "\u8ACB\u5148\u8F38\u5165\u554F\u984C\u3002";
        return;
      }
      speech.unlock();
      askedAt = performance.now();
      questionInput.value = "";
      questionInput.style.height = "";
      askQuestion(question);
    });
    questionInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        askForm.requestSubmit();
      }
    });
    questionInput.addEventListener("input", () => {
      questionInput.style.height = "";
      questionInput.style.height = `${Math.min(questionInput.scrollHeight, 120)}px`;
    });
    rateRange.addEventListener("input", () => rateVal.textContent = Number(rateRange.value).toFixed(1));
    volumeRange.addEventListener("input", () => {
      volumeVal.textContent = Number(volumeRange.value).toFixed(1);
      speech.setVolume(Number(volumeRange.value));
    });
  }
});
export default require_app();
