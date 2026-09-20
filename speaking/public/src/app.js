import { SpeakingPuppet } from "./puppet/speaking-puppet.js";
import { SpeechQueue } from "./speech.js";

const GREETING = "你好呀！我是學姊。不管是功課、考試還是社團，有什麼問題都可以問我喔。";

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
const voiceSelect = document.getElementById("voiceSelect");
const toneSelect = document.getElementById("toneSelect");
const previewBtn = document.getElementById("previewBtn");
const settingsBtn = document.getElementById("settingsBtn");
const avatarControls = document.getElementById("avatarControls");
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
  label.textContent = role === "user" ? "你" : "學姊";

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

// The prepared method for a topic the teacher has already written up. It is
// SHOWN, not spoken - the speech only ever gets data.answer - because a formula
// read aloud is unusable, and because this is the part that has to be exactly
// right rather than paraphrased.
function addMethodCard(method) {
  const card = document.createElement("div");
  card.className = "method-card";

  const title = document.createElement("div");
  title.className = "method-title";
  title.textContent = `速解法 · ${method.title}`;
  card.appendChild(title);

  if (method.formula) {
    const formula = document.createElement("div");
    formula.className = "method-formula";
    formula.textContent = method.formula;
    card.appendChild(formula);
  }

  if (method.steps?.length) {
    const steps = document.createElement("ol");
    steps.className = "method-steps";
    for (const step of method.steps) {
      const li = document.createElement("li");
      li.textContent = step;
      steps.appendChild(li);
    }
    card.appendChild(steps);
  }

  for (const [label, text] of [["例", method.example], ["補充", method.note]]) {
    if (!text) continue;
    const line = document.createElement("div");
    line.className = "method-aside";
    line.textContent = `${label}：${text}`;
    card.appendChild(line);
  }

  chatScroll.appendChild(card);
  scrollToBottom();
  return card;
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

// How the answer is spoken: which of Gemini's voices, and what to tell it about
// the delivery. Nobody can decide either of these by reading a list - the docs
// do not even say which voices are female - so the point of the picker is to
// make it a few seconds of listening instead of an environment variable and a
// redeploy.
const PREVIEW_LINE = "你好呀！我是學姊，有什麼問題都可以問我喔。";

function speechOptions() {
  return {
    rate: Number(rateRange.value),
    voice: voiceSelect.value,
    tone: toneSelect.value,
  };
}

// Until the list arrives the selects are empty, and an empty value means "let
// the server use its own default" - so a failed fetch costs the picker, not the
// speech.
fetch("/api/voices")
  .then((res) => res.json())
  .then(({ voices = [], tones = [], voice, tone }) => {
    for (const entry of voices) {
      const option = document.createElement("option");
      option.value = entry.name;
      // Google's one-word description of each voice is the only thing anyone
      // has to go on before pressing play, so show it.
      option.textContent = `${entry.pick ? "★ " : ""}${entry.name}（${entry.style}）`;
      voiceSelect.appendChild(option);
    }
    if (voice) voiceSelect.value = voice;
    for (const entry of tones) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.label;
      toneSelect.appendChild(option);
    }
    if (tone) toneSelect.value = tone;
  })
  .catch(() => {
    // Leave both empty; the server's defaults still apply.
  });

async function previewVoice() {
  // Inside the click, for the same reason submitting does it.
  speech.unlock();
  previewBtn.disabled = true;
  setStatus("試聽中", "tag-accent");
  speakingBadge.hidden = false;
  try {
    await speech.speak(PREVIEW_LINE, speechOptions());
  } catch (err) {
    addErrorRow(err.message || "試聽失敗，請再試一次。");
  } finally {
    speakingBadge.hidden = true;
    puppet.stopSpeaking();
    setStatus("待命中", "tag-accent");
    previewBtn.disabled = false;
  }
}

previewBtn.addEventListener("click", previewVoice);

settingsBtn.addEventListener("click", () => {
  const open = avatarControls.hidden;
  avatarControls.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", String(open));
});

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
    for (const method of data.methods || []) addMethodCard(method);
    addHistoryEntry(question, answerRow);

    setStatus("說話中", "tag-accent");
    speakingBadge.hidden = false;
    await speech.speak(data.answer, speechOptions());
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
