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

  // A soft UI blip - advancing a line, opening a menu.
  click() {
    this.tone({ freq: 520, endFreq: 680, type: 'triangle', dur: 0.05, gain: 0.14 });
  }

  // Moving the highlighted choice up/down.
  select() {
    this.tone({ freq: 700, type: 'triangle', dur: 0.04, gain: 0.1 });
  }

  // A choice was locked in.
  confirm() {
    this.tone({ freq: 440, endFreq: 880, type: 'triangle', dur: 0.1, gain: 0.16 });
  }

  // Positive feedback - a correct answer, a flag/points gained. A short
  // rising two-note chime reads as encouragement without being distracting
  // enough to repeat dozens of times per practice session.
  correct() {
    [660, 880].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.16, gain: 0.18, delay: i * 0.08 })
    );
  }

  // Gentle, non-punishing feedback for a wrong answer - a soft dip rather
  // than a harsh buzzer, since the point is to invite another attempt, not
  // to embarrass a student for asking.
  incorrect() {
    this.tone({ freq: 300, endFreq: 200, type: 'sine', dur: 0.22, gain: 0.14 });
  }

  // A chapter or practice set finishing.
  complete() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.16, delay: i * 0.1 })
    );
  }
}
