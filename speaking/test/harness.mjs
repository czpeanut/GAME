// Tiny assertion helpers, so tests read as a checklist. Same shape as the
// harness in the game repo this puppet came from.
let passed = 0;
let failed = 0;

export function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0;
}

// A speech-shaped signal: bursts of tone (syllables) separated by silence,
// with one burst much louder than the rest. Real enough to exercise the
// envelope - the loud burst is what would flatten everything else if the
// analysis normalised against the peak.
export function syllables(sampleRate, pattern) {
  const total = pattern.reduce((sum, [seconds]) => sum + seconds, 0);
  const samples = new Float32Array(Math.round(total * sampleRate));
  let at = 0;
  for (const [seconds, amplitude] of pattern) {
    const length = Math.round(seconds * sampleRate);
    for (let i = 0; i < length && at < samples.length; i++, at++) {
      samples[at] = amplitude * Math.sin((2 * Math.PI * 220 * at) / sampleRate);
    }
  }
  return samples;
}
