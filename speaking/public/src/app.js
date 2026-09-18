import { SpeakingPuppet } from "./puppet/speaking-puppet.js";
import { SpeechQueue } from "./speech.js";

const GREETING = "你好，我是學習問答助理。請描述你在課業上遇到的問題，我會盡力提供解說與示例。";

const avatarCanvas = document.getElementById("avatarCanvas");
const audioElements = [
  document.getElementById("avatarAudio"),
  document.getElementById("avatarAudioNext"),
];
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
// askedAt lets the one number that matters - how long from pressing send to
// hearing the first word - show up in the console on a real deployment, where
// it can actually be measured.
let askedAt = 0;
const speech = new SpeechQueue(audioElements, {
  onMouth: (meter) => puppet.speak(meter),
  onPiece: (piece, index) => {
    if (index === 0 && askedAt) {
      console.info(`第一句語音：送出後 ${((performance.now() - askedAt) / 1000).toFixed(1)} 秒`);
    }
  },
});
// Exposed so the browser test (and anyone debugging a sync problem) can read
// the mouth the page is actually showing, rather than inferring it from
// pixels.
window.puppet = puppet;
window.speech = speech;
let turnCount = 0;

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
speech.setVolume(Number(volumeRange.value));

function stopSpeaking() {
  speech.stop();
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
    speakingBadge.hidden = false;
    await speech.speak(data.answer, { rate: Number(rateRange.value) });
    speakingBadge.hidden = true;
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

  // Synchronously, inside the real gesture - see SpeechQueue.unlock().
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

rateRange.addEventListener("input", () => (rateVal.textContent = Number(rateRange.value).toFixed(1)));
volumeRange.addEventListener("input", () => {
  volumeVal.textContent = Number(volumeRange.value).toFixed(1);
  speech.setVolume(Number(volumeRange.value));
});
