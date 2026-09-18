import { splitSentences } from "./puppet/sentences.js";
import { MouthMeter } from "./puppet/lipsync.js";

// Speaks an answer a clause at a time.
//
// The old path asked for one clip covering the whole answer and waited for all
// of it, so nothing was heard until the slowest possible moment - 7 to 17
// seconds. Here the answer is split, and the wait is only the FIRST clause:
// every later one is requested while an earlier one is still playing, so by
// the time its turn comes it is usually already there.
//
// Two audio elements, used alternately, are what makes that possible: an
// element can only buffer one source, so the next clause needs somewhere of
// its own to arrive into. They keep doing the playing themselves rather than
// handing samples to Web Audio, which is what keeps the volume control and the
// mobile autoplay unlock working the way they were fixed to.

// A moment of silence, played inside the submit gesture, is what leaves the
// elements unlocked on mobile - see the comment at the call site.
function silentWavUrl() {
  const rate = 8000;
  const frames = 400; // 50ms
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

const SILENCE_URL = silentWavUrl();

export class SpeechQueue {
  // `elements` is two <audio> elements. `onMouth` is handed the meter for
  // whichever element is currently speaking, and null when nothing is.
  constructor(elements, { onMouth = () => {}, onPiece = () => {} } = {}) {
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
    this.context?.resume?.().catch(() => {});
    for (const el of this.elements) {
      el.play().catch(() => {});
    }
    // The meters tap the elements, so they can only be built once there is a
    // context - and each element may only be tapped once, ever.
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
    const url = (piece) =>
      `/api/tts?${new URLSearchParams({ text: piece, rate: String(rate) })}`;

    // Get the first clause moving before anything else happens.
    this.elements[0].src = url(pieces[0]);

    for (let i = 0; i < pieces.length; i++) {
      if (generation !== this.generation) return; // stopped, or a new answer
      const element = this.elements[i % 2];
      const meter = this.meters?.[i % 2] ?? null;

      meter?.reset();
      this.onPiece(pieces[i], i, pieces.length);
      this.onMouth(meter);

      const playing = this._play(element, generation);
      // Start fetching the next clause now, on the other element, so it is
      // buffered by the time this one finishes.
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
      throw new Error("瀏覽器擋下了自動播放，請再按一次送出。");
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
}

// An <audio> element that fails tells you nothing about why. The server does -
// it answers with JSON - so ask it again just to read the message.
async function describeFailure(src) {
  try {
    const res = await fetch(src);
    const data = await res.json();
    if (data.error) return new Error([data.error, data.detail].filter(Boolean).join("："));
  } catch {
    // not JSON, or the request failed outright
  }
  return new Error("語音播放失敗，請再試一次。");
}

export { SILENCE_URL };
