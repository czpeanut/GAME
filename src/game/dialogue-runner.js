// Pure dialogue state machine: walks a node graph, reveals text on a
// typewriter timer, and resolves branching choices. Holds no reference to a
// canvas or an input object, so a conversation's logic - does this choice
// lead where it should, does a flag get set exactly once, does the typewriter
// timing behave - is fully testable without a browser.
//
// Script shape:
//   {
//     start: 'nodeId',
//     nodes: {
//       nodeId: {
//         speaker: '???',           // optional
//         lines: ['line one', ...], // shown one at a time, advanced by confirm()
//         flag: 'name',             // optional: set on StoryState when this node is entered
//         action: (world, game) => {}, // optional: run once when this node is entered
//         next: 'otherNodeId',      // optional: where to go after the last line
//         choices: [                // optional: replaces `next` at the last line
//           { text: '...', next: 'nodeId', flag: 'name', action: (world, game) => {} },
//         ],
//       },
//     },
//   }
//
// A node with neither `next` nor `choices` ends the conversation after its
// last line.
export class DialogueRunner {
  constructor(script, { world, game, charsPerSecond = 42 } = {}) {
    this.script = script;
    this.world = world;
    this.game = game;
    this.charsPerSecond = charsPerSecond;
    this.finished = false;
    this._enterNode(script.start);
  }

  get node() {
    return this.script.nodes[this.nodeId];
  }
  get lines() {
    return this.node?.lines ?? [];
  }
  get lineText() {
    return this.lines[this.lineIndex] ?? '';
  }
  get speaker() {
    return this.node?.speaker ?? '';
  }
  get choices() {
    return this.node?.choices ?? [];
  }
  get onLastLine() {
    return this.lineIndex >= this.lines.length - 1;
  }
  get hasChoices() {
    return this.onLastLine && this.choices.length > 0;
  }
  get revealedCount() {
    return Math.max(0, Math.floor(this.revealT * this.charsPerSecond));
  }
  get isFullyRevealed() {
    return this.revealedCount >= this.lineText.length;
  }
  get revealedText() {
    return this.lineText.slice(0, this.revealedCount);
  }

  _enterNode(id) {
    this.nodeId = id;
    this.lineIndex = 0;
    this.revealT = 0;
    this.choiceIndex = 0;

    const node = this.node;
    if (!node) {
      // A script that names a node which does not exist ends the conversation
      // rather than throwing mid-dialogue - a broken `next` id should read as
      // "the conversation stops here" during content authoring, not crash it.
      this.finished = true;
      return;
    }
    if (node.flag) this.game?.story?.setFlag(node.flag);
    node.action?.(this.world, this.game);
  }

  tick(dt) {
    if (!this.finished) this.revealT += dt;
  }

  // The single "confirm" input does three different things depending on
  // where the conversation currently is, in priority order: finish revealing
  // the current line, pick the highlighted choice, or advance/end.
  confirm() {
    if (this.finished) return;

    if (!this.isFullyRevealed) {
      this.revealT = this.lineText.length / this.charsPerSecond;
      return;
    }
    if (this.hasChoices) {
      this.selectChoice(this.choiceIndex);
      return;
    }
    if (!this.onLastLine) {
      this.lineIndex++;
      this.revealT = 0;
      return;
    }

    const node = this.node;
    if (node.next) this._enterNode(node.next);
    else this.finished = true;
  }

  moveChoice(delta) {
    if (!this.hasChoices) return;
    const n = this.choices.length;
    this.choiceIndex = ((this.choiceIndex + delta) % n + n) % n;
  }

  selectChoice(index) {
    const choice = this.choices[index];
    if (!choice) return;
    if (choice.flag) this.game?.story?.setFlag(choice.flag);
    choice.action?.(this.world, this.game);
    if (choice.next) this._enterNode(choice.next);
    else this.finished = true;
  }
}
