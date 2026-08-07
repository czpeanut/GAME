// Word-wrapping with basic CJK line-breaking rules (kinsoku shori).
//
// Chinese and Japanese text has no spaces between words, so the usual
// "break on the last space that fits" algorithm never finds a break point and
// either overflows the box or breaks mid-run-on. This wraps at any character
// boundary for CJK text (each character is its own breakable unit) while
// still treating a run of Latin letters/digits as one unbreakable word, so
// English terms or numbers embedded in Chinese text ("GPS", "5年") do not get
// split mid-word.
//
// It also avoids the two ugliest line breaks in CJK typesetting: a line must
// not *start* with closing punctuation (、。，」』), and must not *end* with
// opening punctuation (「『). Both are corrected by shifting the offending
// character to the adjacent line after the greedy wrap.
//
// Takes `measure` as a parameter (text -> pixel width) rather than reaching
// for a canvas context directly, so the wrapping logic itself is testable
// with a synthetic measure function and has no DOM dependency.

const NO_LINE_START = new Set(
  '」』〉》】〕）｝、。，．！？：；・ー'.split('').concat([')', ']', '}', ',', '.', '!', '?', ':', ';'])
);
const NO_LINE_END = new Set('「『〈《【〔（｝'.split('').concat(['(', '[', '{']));

const LATIN_WORD = /[A-Za-z0-9'".,;:!?_%$#@&+*/=<>-]/;

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n') {
      tokens.push(ch);
      i++;
      continue;
    }
    if (LATIN_WORD.test(ch)) {
      let j = i + 1;
      while (j < text.length && LATIN_WORD.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
      continue;
    }
    // Anything else (CJK ideographs, kana, punctuation, emoji) is a single
    // breakable unit on its own.
    tokens.push(ch);
    i++;
  }
  return tokens;
}

// Greedy line packing, then a kinsoku correction pass.
export function wrapText(text, measure, maxWidth) {
  const lines = [];
  let current = '';

  const pushLine = () => {
    // A trailing space that was appended while there was still room on the
    // line (before the next word forced a break) would otherwise survive as
    // visible trailing whitespace - harmless for CJK text, which never hits
    // this path, but sloppy wherever Latin words are involved.
    lines.push(current.replace(/[ \t]+$/, ''));
    current = '';
  };

  for (const token of tokenize(text)) {
    if (token === '\n') {
      pushLine();
      continue;
    }

    if (token === ' ') {
      if (current === '') continue; // never start a line with a space
      if (measure(current + ' ') <= maxWidth) current += ' ';
      else pushLine();
      continue;
    }

    // Append if there is room. Note this only applies when the line already
    // has something on it - an empty line always falls through below, so a
    // token wider than the whole box still gets force-split instead of being
    // accepted whole just because there was nothing to compare it against.
    if (current !== '' && measure(current + token) <= maxWidth) {
      current += token;
      continue;
    }

    if (current !== '') pushLine();

    if (measure(token) <= maxWidth) {
      current = token;
    } else {
      // A single token wider than the box - a long unbroken Latin word.
      // Force-break it character by character rather than looping forever.
      let piece = '';
      for (const ch of token) {
        if (piece && measure(piece + ch) > maxWidth) {
          lines.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      current = piece;
    }
  }
  pushLine();

  return applyKinsoku(lines);
}

function applyKinsoku(lines) {
  // Pull a forbidden line-starting character back onto the previous line.
  for (let i = 1; i < lines.length; i++) {
    while (lines[i].length > 0 && NO_LINE_START.has(lines[i][0])) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
  }
  // Push a forbidden line-ending character onto the next line.
  for (let i = 0; i < lines.length - 1; i++) {
    while (lines[i].length > 0 && NO_LINE_END.has(lines[i][lines[i].length - 1])) {
      const ch = lines[i][lines[i].length - 1];
      lines[i] = lines[i].slice(0, -1);
      lines[i + 1] = ch + lines[i + 1];
    }
  }
  const result = lines.filter((l) => l !== '');
  return result.length ? result : [''];
}

// Total character count across the visible glyphs of a wrapped block - used
// by the dialogue typewriter to know how many characters to reveal without
// caring about where the line breaks fall.
export function wrappedLength(lines) {
  return lines.reduce((n, l) => n + l.length, 0);
}
