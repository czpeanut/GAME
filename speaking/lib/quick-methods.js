// Recognising a question the teacher has already prepared an answer for.
//
// The point is not to make the model cleverer. It is that for a handful of
// topics there IS one right way to do it, the teacher knows what it is, and a
// general-purpose model will happily produce a different - longer, or subtly
// wrong - method every time it is asked. So those topics get matched on the way
// in, and the prepared method goes to the model as instructions and to the
// screen as the formula itself.
//
// Splitting it that way is deliberate. The answer is read aloud, and a formula
// read aloud is unusable ("R 等於根號 a 平方加 b 平方" is not something anyone
// can follow by ear), so the model gets told to explain the METHOD in words and
// the symbols are shown instead. See buildGuidance().
//
// The library itself is content, not code: content/quick-methods.json, editable
// without touching any of this.

const path = require("path");

// At most this many per question. Two prepared methods is already a lot of
// instruction in front of one question, and a third is a sign the rules are too
// loose rather than that the student asked three things.
const MAX_MATCHES = 2;

// Matching happens on a flattened form of the text: full width folded to half
// (so ａ and a are the same), lower case, and every space removed. That last one
// is what makes "a sin θ + b cos θ" and "asinθ+bcosθ" the same string, which
// matters because students type both.
function flatten(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function loadLibrary(file) {
  const source = file || path.join(__dirname, "..", "content", "quick-methods.json");
  // Drop require()'s cache so a second call really re-reads the file - which is
  // what lets the tests load a fixture library instead of the real one. The
  // server calls this once at startup, so editing the library means restarting
  // (but not redeploying: the file is content, not code).
  delete require.cache[require.resolve(source)];
  const data = require(source);
  return (data.methods || []).map((method) => ({
    ...method,
    // Flatten the rules once, here, rather than on every question.
    _rules: (method.rules || []).map((rule) => rule.map(flatten).filter(Boolean)).filter((r) => r.length),
    _exclude: (method.exclude || []).map(flatten).filter(Boolean),
  }));
}

// A method matches when ANY of its rules matches, and a rule matches when ALL
// of its terms appear. That shape is what lets a teacher write both "the word
// 疊合 on its own is enough" and "sin and cos and 最大值 together, but none of
// them alone".
function matches(method, haystack) {
  if (method._exclude.some((term) => haystack.includes(term))) return false;
  return method._rules.some((rule) => rule.every((term) => haystack.includes(term)));
}

function findMethods(question, library) {
  const haystack = flatten(question);
  if (!haystack) return [];
  return (library || loadLibrary()).filter((method) => matches(method, haystack)).slice(0, MAX_MATCHES);
}

// What the model is told. It gets the method as something to follow rather than
// as reference material, because the whole reason for having a library is that
// its version should win over whatever the model would have come up with.
function buildGuidance(methods) {
  if (!methods.length) return "";
  const blocks = methods.map((method) => {
    const steps = (method.steps || []).map((step, i) => `${i + 1}. ${step}`).join("\n");
    return [
      `【${method.title}】`,
      method.formula && `公式：${method.formula}`,
      steps,
      method.example && `例子：${method.example}`,
      method.note && `補充：${method.note}`,
    ].filter(Boolean).join("\n");
  });
  return [
    "這個學生問到的題型，老師已經準備好標準的速解法，就在下面。",
    "請照這個方法講，不要自己另外想一套做法，也不要和它牴觸。",
    "公式和完整步驟會同時顯示在學生的畫面上，所以你只要用講的把「怎麼做」說清楚，",
    "不要把公式的符號唸出來（唸出來沒有人聽得懂），可以請他看一下畫面上的步驟。",
    "",
    ...blocks,
  ].join("\n");
}

// What the page shows. Only the fields worth putting on screen, so the rules
// and the matching internals never leave the server.
function toCard(method) {
  return {
    id: method.id,
    title: method.title,
    formula: method.formula || "",
    steps: method.steps || [],
    example: method.example || "",
    note: method.note || "",
  };
}

module.exports = { flatten, loadLibrary, findMethods, buildGuidance, toCard, MAX_MATCHES };
