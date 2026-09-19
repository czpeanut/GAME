// Shared test utilities: a stub Input (mirrors the real Input's down/pressed/
// released edge semantics without touching the DOM) and tiny assertion
// helpers so tests read as a checklist.

export class StubInput {
  constructor() {
    this.actions = new Set();
    this.prev = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
  }

  set(held) {
    this.actions = new Set(held);
    this.justPressed = new Set([...this.actions].filter((a) => !this.prev.has(a)));
    this.justReleased = new Set([...this.prev].filter((a) => !this.actions.has(a)));
    this.prev = new Set(this.actions);
  }

  down(a) {
    return this.actions.has(a);
  }
  pressed(a) {
    return this.justPressed.has(a);
  }
  released(a) {
    return this.justReleased.has(a);
  }
}

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
