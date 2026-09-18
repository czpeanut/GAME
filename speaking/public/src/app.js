import { SpeakingPuppet } from "./puppet/speaking-puppet.js";
import { analyseEnvelope } from "./puppet/lipsync.js";

// Sample rate for the envelope analysis only - the browser decodes and
// resamples the clip into this rate just so the mouth track is cheap to
// compute. Playback itself uses the original WAV untouched.
const ANALYSIS_SAMPLE_RATE = 16000;
const GREETING = "你好，我是學習問答助理。請描述你在課業上遇到的問題，我會盡力提供解說與示例。";

const avatarCanvas = document.getElementById("avatarCanvas");
const audioEl = document.getElementById("avatarAudio");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingStatus = document.getElementById("loadingStatus");
const speakingBadge = document.getElementById("speakingBadge");
const statusTag = document.getElementById("statusTag");

const newChatBtn = document.getElementById("newChatBtn");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");
const chatScroll = document.getElementById("chatScroll");

const askForm = document.getElementById("askForm");
const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");
const rateRange = document.getElementById("rateRange");
const volumeRange = document.getElementById("volumeRange");
const rateVal = document.getElementById("rateVal");
const volumeVal = document.getElementById("volumeVal");
const hint = document.getElementById("hint");

const puppet = new SpeakingPuppet(avatarCanvas);
// Exposed so the browser test (and anyone debugging a sync problem) can read
// the mouth the page is actually showing, rather than inferring it from
// pixels.
window.puppet = puppet;
let turnCount = 0;
let speechUrl = null;

function setStatus(label, variant) {
  statusTag.textContent = label;
  statusTag.className = `tag ${variant}`;
}

function setAskEnabled(enabled) {
  askBtn.disabled = !enabled;
}

// ---------- Chat thread ----------
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
  label.textContent = role === "user" ? "你" : "AI 助理";

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
  row.innerHTML = `<div class="chat-label">AI 助理</div><div class="chat-bubble chat-bubble-thinking">思考中…</div>`;
  chatScroll.appendChild(row);
  scrollToBottom();
  return row;
}

// Failures used to go only to the hint line under the input box: 12px grey
// text, below the fold on a short window, and nowhere near where anyone is
// looking. A question that gets no answer has to say so in the thread.
function addErrorRow(text) {
  const row = document.createElement("div");
  row.className = "chat-row ai";

  const label = document.createElement("div");
  label.className = "chat-label";
  label.textContent = "錯誤";

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
  title.textContent = question.length > 24 ? `${question.slice(0, 24)}…` : question;

  const time = document.createElement("span");
  time.className = "history-time";
  time.textContent = new Date().toLocaleTimeString("zh-TW", { hour12: false });

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

// ---------- The puppet ----------
puppet.start();

// Hold the overlay until there is a whole character to show, rather than
// letting the parts pop in one at a time. The art is local and small, so this
// is a few hundred milliseconds - nothing like the old avatar handshake,
// which was a network round trip to a third party before anyone could ask
// anything.
function waitForPuppet() {
  if (puppet.ready) {
    loadingOverlay.hidden = true;
    setStatus("待命中", "tag-accent");
    setAskEnabled(true);
    hint.textContent = "";
    return;
  }
  requestAnimationFrame(waitForPuppet);
}
waitForPuppet();

// Say up front if the server cannot answer anything, rather than letting the
// first question disappear into a 500.
fetch("/api/health")
  .then((res) => res.json())
  .then((health) => {
    if (!health.gemini) {
      addErrorRow(
        "伺服器沒有設定 GEMINI_API_KEY，問答和語音都不會有反應。" +
          "請在部署環境的環境變數加上這一把（Render：Environment 分頁），然後重新部署。"
      );
    }
  })
  .catch(() => {
    addErrorRow("連不上伺服器。如果是剛部署，免費方案的冷啟動可能要等十幾秒，重新整理再試一次。");
  });

// ---------- Audio ----------
// Playing a moment of silence inside the submit gesture is what keeps the
// element unlocked on mobile. Gemini TTS takes 7-17 seconds, long past the
// point where iOS Safari stops treating a play() call as user-initiated, so
// by the time the real clip arrives an untouched element would refuse to
// play it - silently, which is exactly how it was reported. The element is
// primed with this clip at load so the gesture has something to play.
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
audioEl.src = SILENCE_URL;
audioEl.volume = Number(volumeRange.value);

function stopSpeaking() {
  audioEl.pause();
  puppet.stopSpeaking();
  speakingBadge.hidden = true;
  if (speechUrl) {
    URL.revokeObjectURL(speechUrl);
    speechUrl = null;
  }
  audioEl.src = SILENCE_URL;
}

async function synthesizeAndSpeak(text) {
  const params = new URLSearchParams({ text, rate: rateRange.value });
  const res = await fetch(`/api/tts?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error("TTS error", data);
    throw new Error([data.error, data.detail].filter(Boolean).join("：") || "語音合成失敗");
  }
  const wav = await res.arrayBuffer();

  // decodeAudioData takes ownership of the buffer it is given, so the copy
  // that becomes the playable blob has to be made first.
  const playable = wav.slice(0);
  const offlineCtx = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
  const audioBuffer = await offlineCtx.decodeAudioData(wav);
  const envelope = analyseEnvelope(audioBuffer.getChannelData(0), audioBuffer.sampleRate);

  if (speechUrl) URL.revokeObjectURL(speechUrl);
  speechUrl = URL.createObjectURL(new Blob([playable], { type: "audio/wav" }));
  audioEl.src = speechUrl;
  puppet.speak(envelope, audioEl);

  speakingBadge.hidden = false;
  try {
    await audioEl.play();
  } catch (err) {
    // Autoplay was blocked despite the priming. Say so rather than leaving a
    // puppet miming to silence.
    puppet.stopSpeaking();
    speakingBadge.hidden = true;
    throw new Error("瀏覽器擋下了自動播放，請再按一次送出。");
  }

  await new Promise((resolve) => {
    audioEl.onended = resolve;
    audioEl.onerror = resolve;
  });
  audioEl.onended = null;
  audioEl.onerror = null;
  puppet.stopSpeaking();
  speakingBadge.hidden = true;
}

// ---------- Ask Gemini, then speak the answer ----------
async function askQuestion(question) {
  hint.textContent = "";
  setAskEnabled(false);
  setStatus("思考中", "tag-outline");

  addChatRow("user", question);
  const thinkingRow = addThinkingRow();

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "問答服務發生錯誤");
    }

    thinkingRow.remove();
    const answerRow = addChatRow("ai", data.answer);
    addHistoryEntry(question, answerRow);

    setStatus("說話中", "tag-accent");
    await synthesizeAndSpeak(data.answer);
  } catch (err) {
    console.error(err);
    thinkingRow.remove();
    addErrorRow(err.message || "發生錯誤，請重試。");
    hint.textContent = "";
  } finally {
    speakingBadge.hidden = true;
    puppet.stopSpeaking();
    setStatus("待命中", "tag-accent");
    setAskEnabled(true);
  }
}

askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    hint.textContent = "請先輸入問題。";
    return;
  }

  // Synchronously, inside the real gesture - see silentWavUrl() above.
  audioEl.play().catch(() => {});

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

rateRange.addEventListener("input", () => (rateVal.textContent = Number(rateRange.value).toFixed(1)));
volumeRange.addEventListener("input", () => {
  volumeVal.textContent = Number(volumeRange.value).toFixed(1);
  audioEl.volume = Number(volumeRange.value);
});
