// All sound effects are synthesised at runtime with WebAudio oscillators and
// noise buffers. No audio files means nothing to download and nothing to break
// when the game is opened from a file:// path.
//
// Browsers block audio until the first user gesture, so the context is created
// lazily on the first input and resumed if it starts suspended.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.35;
    this._noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.ctx.currentTime,
        0.02
      );
    }
    return this.muted;
  }

  get _now() {
    return this.ctx.currentTime;
  }

  _noise() {
    if (!this._noiseBuffer) {
      const len = this.ctx.sampleRate * 0.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  }

  // A single pitched blip with an exponential decay envelope.
  tone({ freq = 440, endFreq, type = 'square', dur = 0.12, gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this._now + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise burst - impacts, footsteps, explosions.
  noise({ dur = 0.2, gain = 0.25, freq = 1200, endFreq, q = 1, delay = 0, type = 'lowpass' }) {
    if (!this.ctx || this.muted) return;
    const t = this._now + delay;
    const src = this._noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (endFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot() {
    this.tone({ freq: 880, endFreq: 220, type: 'square', dur: 0.09, gain: 0.14 });
    this.noise({ dur: 0.07, gain: 0.09, freq: 3000, endFreq: 600 });
    // A low thump under the crack sells a firearm as something with real
    // stopping power - deliberately absent from swing(), which should sound
    // small and human by comparison.
    this.tone({ freq: 120, endFreq: 45, type: 'sine', dur: 0.12, gain: 0.22 });
  }

  // A melee swing - a quick, unglamorous whoosh. No low end, no crack: this
  // is a stick or a knife, not a weapon that should ever sound as
  // consequential as the pistol.
  swing() {
    this.noise({ dur: 0.09, gain: 0.14, freq: 1400, endFreq: 500, type: 'bandpass', q: 1.2 });
  }

  jump() {
    this.tone({ freq: 320, endFreq: 620, type: 'triangle', dur: 0.13, gain: 0.18 });
  }

  doubleJump() {
    this.tone({ freq: 480, endFreq: 880, type: 'triangle', dur: 0.14, gain: 0.16 });
  }

  dash() {
    this.noise({ dur: 0.22, gain: 0.2, freq: 400, endFreq: 2600, type: 'bandpass', q: 2 });
    this.tone({ freq: 180, endFreq: 90, type: 'sawtooth', dur: 0.18, gain: 0.1 });
  }

  land() {
    this.noise({ dur: 0.1, gain: 0.14, freq: 700, endFreq: 160 });
  }

  hitEnemy() {
    this.tone({ freq: 260, endFreq: 130, type: 'square', dur: 0.07, gain: 0.12 });
    this.noise({ dur: 0.08, gain: 0.12, freq: 2200, endFreq: 400 });
  }

  enemyDie() {
    this.noise({ dur: 0.32, gain: 0.22, freq: 1800, endFreq: 120 });
    this.tone({ freq: 220, endFreq: 60, type: 'sawtooth', dur: 0.3, gain: 0.14 });
  }

  playerHurt() {
    this.tone({ freq: 200, endFreq: 70, type: 'sawtooth', dur: 0.35, gain: 0.26 });
    this.noise({ dur: 0.25, gain: 0.16, freq: 900, endFreq: 120 });
  }

  playerDie() {
    this.tone({ freq: 320, endFreq: 40, type: 'sawtooth', dur: 0.9, gain: 0.3 });
    this.noise({ dur: 0.8, gain: 0.2, freq: 1400, endFreq: 60 });
  }

  checkpoint() {
    [523, 659, 784].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.28, gain: 0.16, delay: i * 0.08 })
    );
  }

  pickup() {
    this.tone({ freq: 880, endFreq: 1320, type: 'triangle', dur: 0.16, gain: 0.16 });
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.4, gain: 0.18, delay: i * 0.12 })
    );
  }
}
