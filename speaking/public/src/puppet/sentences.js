// Splits an answer into the pieces that get synthesised one at a time.
//
// This is the whole latency fix: the old code waited for one clip covering the
// entire answer, so nothing was heard until the slowest possible moment. Cut
// into sentences, the wait is however long the FIRST clause takes, and the
// rest is made while that one plays.
//
// Pure string work - no network, no audio - so the awkward cases (a decimal
// point, an ellipsis, a one-character fragment) are pinned down by tests.

// Chinese punctuation first, since that is what the answers are written in.
const ENDINGS = "。！？!?…";
const PAUSES = "，、；;,";

// Below this, a piece is not worth its own request: the round trip costs more
// than the audio saves, and a two-character clip sounds clipped.
const MIN_LENGTH = 8;
// Above this, a piece takes long enough to synthesise that it should have been
// split at a comma instead.
const MAX_LENGTH = 60;

// The first piece gets a much tighter cap, because it is the only one anybody
// waits for: everything after it is synthesised while an earlier piece plays.
// Mandarin TTS runs about 4-5 characters a second, so this is a couple of
// seconds of audio - short enough to come back quickly, long enough not to
// sound like the answer was chopped off.
const FIRST_MAX_LENGTH = 24;

export function splitSentences(text) {
  if (typeof text !== "string") return [];
  const trimmed = text.trim();
  if (!trimmed) return [];

  const pieces = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    current += ch;

    if (!ENDINGS.includes(ch)) continue;
    // "3.14" and "..." are not sentence ends. Only break when what follows is
    // not more punctuation and what we have is not a bare decimal point.
    while (i + 1 < trimmed.length && ENDINGS.includes(trimmed[i + 1])) {
      current += trimmed[++i];
    }
    pieces.push(current.trim());
    current = "";
  }
  if (current.trim()) pieces.push(current.trim());

  const merged = merge(pieces.flatMap((piece) => splitIfLong(piece, MAX_LENGTH)));

  // Only the opening piece is worth splitting harder - it is the wait.
  if (merged.length && merged[0].length > FIRST_MAX_LENGTH) {
    merged.splice(0, 1, ...splitIfLong(merged[0], FIRST_MAX_LENGTH));
  }
  return merged;
}

// A long sentence with no full stop still has commas; break on the last one
// that leaves a usable piece rather than letting it run.
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
    if (cut === -1) cut = cap; // no comma to use - cut it anyway
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// Glue anything too short onto its neighbour, so "好。" never becomes a
// request of its own.
function merge(pieces) {
  const out = [];
  for (const piece of pieces) {
    const previous = out[out.length - 1];
    if (previous && (piece.length < MIN_LENGTH || previous.length < MIN_LENGTH) &&
        previous.length + piece.length <= MAX_LENGTH) {
      out[out.length - 1] = previous + piece;
    } else {
      out.push(piece);
    }
  }
  return out;
}

export { MIN_LENGTH, MAX_LENGTH, FIRST_MAX_LENGTH };
