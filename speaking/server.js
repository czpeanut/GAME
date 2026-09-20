require("dotenv").config();
const path = require("path");
const express = require("express");
const quickMethods = require("./lib/quick-methods");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
// Gemini's prebuilt voices, each with the one-word style Google's own docs give
// it. Two things the docs do NOT say: which voices are female, and how old any
// of them sounds. Nobody can settle that from the code - it needs an ear and a
// key - so the point of keeping the list here is that /api/voices can hand it
// to the page and the choice can be made by listening. `pick` flags the ones
// whose documented style is young or lively, which is where to start, not an
// answer.
const VOICES = [
  { name: "Leda", style: "Youthful", pick: true },
  { name: "Zephyr", style: "Bright", pick: true },
  { name: "Autonoe", style: "Bright", pick: true },
  { name: "Laomedeia", style: "Upbeat", pick: true },
  { name: "Sadachbia", style: "Lively", pick: true },
  { name: "Aoede", style: "Breezy", pick: true },
  { name: "Achird", style: "Friendly", pick: true },
  { name: "Zubenelgenubi", style: "Casual", pick: true },
  { name: "Puck", style: "Upbeat" },
  { name: "Fenrir", style: "Excitable" },
  { name: "Kore", style: "Firm" },
  { name: "Orus", style: "Firm" },
  { name: "Alnilam", style: "Firm" },
  { name: "Callirrhoe", style: "Easy-going" },
  { name: "Umbriel", style: "Easy-going" },
  { name: "Despina", style: "Smooth" },
  { name: "Algieba", style: "Smooth" },
  { name: "Erinome", style: "Clear" },
  { name: "Iapetus", style: "Clear" },
  { name: "Vindemiatrix", style: "Gentle" },
  { name: "Achernar", style: "Soft" },
  { name: "Sulafat", style: "Warm" },
  { name: "Enceladus", style: "Breathy" },
  { name: "Schedar", style: "Even" },
  { name: "Pulcherrima", style: "Forward" },
  { name: "Charon", style: "Informative" },
  { name: "Rasalgethi", style: "Informative" },
  { name: "Sadaltager", style: "Knowledgeable" },
  { name: "Algenubi", style: "Gravelly" },
  { name: "Gacrux", style: "Mature" },
];
const VOICE_NAMES = new Set(VOICES.map((voice) => voice.name));

// The voice name is only half of how old or lively she sounds. These models
// take direction in plain language - the same lever the pace already uses - and
// the delivery changes a lot more than picking a different voice does.
const TONES = [
  { id: "default", label: "預設", style: "" },
  { id: "lively", label: "活潑", style: "活潑開朗、充滿精神" },
  { id: "gentle", label: "溫柔", style: "溫柔親切、放鬆" },
  { id: "calm", label: "沉穩", style: "沉穩清楚" },
];
const TONE_IDS = new Set(TONES.map((tone) => tone.id));

// The default is what every request gets when the page does not ask for
// something else - so changing these two needs no code, and no redeploy if they
// are set as environment variables.
const GEMINI_TTS_VOICE = VOICE_NAMES.has(process.env.GEMINI_TTS_VOICE)
  ? process.env.GEMINI_TTS_VOICE
  : "Leda";
const GEMINI_TTS_TONE = TONE_IDS.has(process.env.GEMINI_TTS_TONE)
  ? process.env.GEMINI_TTS_TONE
  : "default";

// Overridable so the tests can point the whole thing at a fake Gemini and
// exercise the real request/response handling without a key.
const GEMINI_BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_INTERACTIONS = process.env.GEMINI_INTERACTIONS ||
  "https://generativelanguage.googleapis.com/v1beta/interactions";

// Only TTS models from 3.1 on can stream their audio out; the 2.5 ones hand
// back the whole clip at once, which is most of the wait. Set this to an empty
// string to force the buffered path.
const GEMINI_TTS_STREAM_MODEL = process.env.GEMINI_TTS_STREAM_MODEL === undefined
  ? "gemini-3.1-flash-tts-preview"
  : process.env.GEMINI_TTS_STREAM_MODEL;

// Gemini's TTS output is 24kHz mono PCM16 whichever model produces it.
const TTS_SAMPLE_RATE = 24000;

// A WAV whose length is not known when the header goes out. Players treat an
// over-large data chunk as "read until the stream ends", which is what lets
// the browser start playing a sentence while it is still being synthesised.
const STREAMING_DATA_LENGTH = 0xffffffff - 36;

const app = express();
app.use(express.json({ limit: "20kb" }));
// No content hashing on the built bundle, so make sure browsers always
// revalidate instead of silently running a stale app.bundle.js after a
// deploy (this bit us once already — a fix looked like it did nothing
// because the browser never re-fetched the new JS). Must run before
// express.static, since that responds directly and skips later middleware.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache");
  next();
});
app.use(express.static(path.join(__dirname, "public"), { etag: true, lastModified: true }));

const SPEECH_SYSTEM_INSTRUCTION =
  "你是一個用聲音回答問題的語音助手，你的回答會直接被語音合成朗讀出來，使用者聽不到也看不到任何符號。" +
  "規則：(1) 只用簡短口語化的白話文回答，控制在 3 句話以內。" +
  "(2) 絕對不要使用 Markdown 格式，不要有 **、#、-、`、條列清單。" +
  "(3) 絕對不要使用 LaTeX 或數學符號語法，例如不要寫 $\\frac{a}{b}$，要用「a 除以 b」這種口語講法；不要寫 $x^2$，要說「x 的平方」。" +
  "(4) 不要輸出任何無法唸出來的符號。";

// The topics the teacher has already written a method for. Loaded once: the
// library is content rather than code, so editing it needs a restart but not a
// redeploy.
const QUICK_METHODS = quickMethods.loadLibrary();

// Defensive cleanup in case the model still slips in formatting despite the
// system instruction above — strips it rather than reading symbols aloud.
function sanitizeForSpeech(text) {
  return text
    .replace(/\$\$?/g, "") // LaTeX delimiters
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 除以 $2")
    .replace(/\\sqrt\{([^{}]*)\}/g, "$1 的平方根")
    .replace(/\\[a-zA-Z]+/g, "") // remaining LaTeX commands
    .replace(/[{}]/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
    .replace(/\*(.*?)\*/g, "$1") // *italic*
    .replace(/`+/g, "")
    .replace(/^#{1,6}\s*/gm, "") // headers
    .replace(/^[-*+]\s+/gm, "") // bullet markers
    .replace(/^\d+\.\s+/gm, "") // numbered list markers
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Gemini's TTS models have no rate parameter, and no tone parameter either;
// they take direction in plain language, which measurably changes the delivery
// (the same sentence runs ~12s "slow" / ~7s default / ~5s "fast"). Both
// directions go in one prefix, because two sentences of instruction in front of
// a short clause is more instruction than clause.
function withDirections(text, { rate = 1, tone = GEMINI_TTS_TONE } = {}) {
  const style = TONES.find((entry) => entry.id === tone)?.style || "";
  const pace = rate <= 0.85 ? "較慢的語速" : rate >= 1.15 ? "較快的語速" : "";
  const how = [style && `${style}的語氣`, pace].filter(Boolean).join("、");
  return how ? `請用${how}說：${text}` : text;
}

function wavHeader(dataLength, sampleRate, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

// ---------- Text to speech ----------
// Gemini returns headerless L16 PCM; the browser's decodeAudioData needs a
// container, so wrap it in a WAV header before sending it on.
// Reads Gemini's server-sent event stream and hands back each audio chunk as
// it lands. The wire format is `event: step.delta` with a JSON `data:` line
// whose `delta` carries base64 audio - but this stays deliberately tolerant
// about the shape, because a preview API that changes its field names should
// degrade into "no audio, fall back" rather than into a crash.
async function* audioChunks(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const event = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // a partial or unexpected line is not worth failing over
        }
        const delta = parsed.delta || parsed;
        if (delta && delta.type === "audio" && typeof delta.data === "string") {
          yield Buffer.from(delta.data, "base64");
        }
      }
    }
  }
}

// Returns true if it answered the request. Anything that goes wrong BEFORE the
// first byte is written returns false instead, so the caller can still fall
// back - which matters because the streaming model is a preview and may simply
// not be available on a given key.
async function streamSpeech(res, text, options) {
  if (!GEMINI_TTS_STREAM_MODEL) return false;

  const started = Date.now();
  let upstream;
  try {
    upstream = await fetch(`${GEMINI_INTERACTIONS}?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_TTS_STREAM_MODEL,
        input: withDirections(text, options),
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: options.voice }] },
        stream: true,
      }),
    });
  } catch (err) {
    console.warn("串流語音連線失敗，改用一次回傳的模型:", String(err));
    return false;
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.warn(`串流語音不可用（${upstream.status}），改用一次回傳的模型:`, detail.slice(0, 300));
    return false;
  }

  let firstChunk = false;
  try {
    for await (const pcm of audioChunks(upstream)) {
      if (!pcm.length) continue;
      if (!firstChunk) {
        firstChunk = true;
        // The number that matters: how long before there is something to
        // play. Shows up in the deploy's logs.
        console.log(`TTS 串流 首段 ${Date.now() - started}ms（${text.length} 字）`);
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-TTS-Path", `stream:${GEMINI_TTS_STREAM_MODEL}`);
        res.write(wavHeader(STREAMING_DATA_LENGTH, TTS_SAMPLE_RATE));
      }
      res.write(pcm);
    }
  } catch (err) {
    // Mid-stream failures cannot be retried - the header is already out.
    console.error("串流語音中斷:", String(err));
    if (firstChunk) res.end();
    return firstChunk;
  }

  if (!firstChunk) {
    console.warn("串流語音沒有回傳任何音訊，改用一次回傳的模型");
    return false;
  }
  res.end();
  return true;
}

// The original path: ask for the whole clip and send it on in one piece.
async function bufferedSpeech(res, text, options) {
  const started = Date.now();
  const ttsRes = await fetch(`${GEMINI_BASE}/${GEMINI_TTS_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: withDirections(text, options) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
      },
    }),
  });

  const data = await ttsRes.json();
  if (!ttsRes.ok) {
    console.error("Gemini TTS 失敗:", ttsRes.status, JSON.stringify(data).slice(0, 500));
    return res.status(502).json({ error: "語音合成失敗", detail: data.error && data.error.message });
  }

  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) {
    console.error("Gemini TTS 沒有回傳音訊:", JSON.stringify(data).slice(0, 500));
    return res.status(502).json({ error: "語音合成沒有回傳音訊" });
  }

  const pcm = Buffer.from(inline.data, "base64");
  const sampleRate = Number(/rate=(\d+)/.exec(inline.mimeType || "")?.[1]) || TTS_SAMPLE_RATE;

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-TTS-Path", `buffered:${GEMINI_TTS_MODEL}`);
  console.log(`TTS 一次回傳 ${Date.now() - started}ms（${text.length} 字）`);
  res.send(Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]));
}

// One sentence at a time: the page asks for each in turn and starts playing
// the first while the rest are still being made, so the wait is one clause
// rather than a whole answer.
app.get("/api/tts", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "尚未設定 GEMINI_API_KEY，請在環境變數加入後重新啟動伺服器。" });
  }

  const { text, rate, voice, tone } = req.query || {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "請提供要朗讀的文字" });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: "文字長度過長（上限 2000 字）" });
  }

  // Both of these end up inside a request to Gemini, so neither is taken on
  // trust: an unknown name is rejected here rather than forwarded.
  if (voice !== undefined && !VOICE_NAMES.has(voice)) {
    return res.status(400).json({ error: `不認識的聲線：${String(voice).slice(0, 40)}` });
  }
  if (tone !== undefined && !TONE_IDS.has(tone)) {
    return res.status(400).json({ error: `不認識的語氣：${String(tone).slice(0, 40)}` });
  }

  const options = {
    rate: Number.isFinite(Number(rate)) ? Number(rate) : 1,
    voice: voice || GEMINI_TTS_VOICE,
    tone: tone || GEMINI_TTS_TONE,
  };

  try {
    if (await streamSpeech(res, text, options)) return;
    await bufferedSpeech(res, text, options);
  } catch (err) {
    console.error("連線語音合成服務失敗:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "連線語音合成服務失敗", detail: String(err) });
    } else {
      res.end();
    }
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, gemini: Boolean(GEMINI_API_KEY) });
});

// The page builds its picker from this, so the list lives in one place. It also
// reports what the deployment currently defaults to, which is the one thing you
// cannot see from the outside.
app.get("/api/voices", (_req, res) => {
  res.json({ voices: VOICES, tones: TONES, voice: GEMINI_TTS_VOICE, tone: GEMINI_TTS_TONE });
});

app.post("/api/ask", async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "尚未設定 GEMINI_API_KEY，請在環境變數加入後重新啟動伺服器。" });
  }

  const { question } = req.body || {};
  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "請提供問題內容" });
  }
  if (question.length > 2000) {
    return res.status(400).json({ error: "問題長度過長（上限 2000 字）" });
  }

  // Does this question hit a topic the teacher has prepared? If it does, the
  // model is told to use that method rather than inventing one, and the formula
  // itself goes to the page - see lib/quick-methods.js for why those are two
  // different things.
  const matched = quickMethods.findMethods(question, QUICK_METHODS);
  const guidance = quickMethods.buildGuidance(matched);
  if (matched.length) {
    console.log(`速解法命中：${matched.map((m) => m.id).join(", ")}`);
  }

  try {
    const geminiRes = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: guidance ? `${SPEECH_SYSTEM_INSTRUCTION}\n\n${guidance}` : SPEECH_SYSTEM_INSTRUCTION }],
        },
        contents: [{ parts: [{ text: question }] }],
        // gemini-3.6-flash spends a variable, sometimes large, number of tokens
        // "thinking" before it writes the visible answer, and that eats into
        // maxOutputTokens — too low a cap truncates the answer itself
        // (finishReason: MAX_TOKENS) before it gets a chance to speak.
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error("Gemini 失敗:", geminiRes.status, JSON.stringify(data).slice(0, 500));
      return res.status(502).json({ error: "問答服務發生錯誤", detail: data.error && data.error.message });
    }

    const rawAnswer = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!rawAnswer) {
      return res.status(502).json({ error: "沒有取得回答內容", detail: data });
    }
    // `methods` is shown, never spoken: the page puts it on screen under the
    // answer and only ever sends `answer` to the speech endpoint.
    res.json({
      answer: sanitizeForSpeech(rawAnswer).slice(0, 800),
      methods: matched.map(quickMethods.toCard),
    });
  } catch (err) {
    console.error("連線 Gemini 服務失敗:", err);
    res.status(502).json({ error: "連線問答服務失敗", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Speaking-avatar server running at http://localhost:${PORT}`);
  console.log(`已載入 ${QUICK_METHODS.length} 則速解法：${QUICK_METHODS.map((m) => m.id).join(", ") || "（無）"}`);
  if (!GEMINI_API_KEY) {
    console.warn("⚠️  尚未設定 GEMINI_API_KEY，問答與語音功能將無法使用。");
  }
});
