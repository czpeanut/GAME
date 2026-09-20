// 學姊 introduces herself to a new transfer student. One speaker, no
// branches: it runs start to finish and ends.
//
// The node shape, for whoever writes the real lesson content next:
//
//   - `speaker` is a character id (resolved to its display name, and used to
//     pick which portrait plays the talking mouth).
//   - `lines` is an array; each entry is one dialogue box the reader taps
//     through.
//   - `action(stage, app)` is how a node reaches into the world: change the
//     background, bring characters on/off stage, or touch story state
//     (flags/vars) and play a feedback sound.
//   - `choices` branch the conversation; each choice can carry its own
//     `action`/`flag` exactly like a node can. This script has none - it is
//     an introduction, not a question - but the engine still supports them,
//     and test/dialogue.test.mjs covers that path.
//   - A node with no `next` and no `choices` ends the conversation.
export const DEMO_SCRIPT = {
  start: 'notice',
  nodes: {
    notice: {
      speaker: 'senpai',
      action: (stage) => {
        stage.setBackground('classroom.jpg');
        stage.show('senpai', 'center');
      },
      lines: [
        '啊——！你就是今天剛轉來的那個新同學對吧？',
        '你好你好！我是三年級的，叫我學姊就好了～',
      ],
      next: 'boast',
    },

    boast: {
      speaker: 'senpai',
      lines: [
        '欸嘿嘿⋯⋯不要看我這個樣子喔。',
        '我可是全學年第一名。真的，沒有在騙你。',
      ],
      next: 'offer',
    },

    offer: {
      speaker: 'senpai',
      lines: [
        '所以呢，不管是功課、考試，還是社團要選哪一個⋯⋯',
        '有什麼問題都可以來問我！',
        '一個人剛來，不懂的事情一定超多的吧？不用客氣，問就對了。',
      ],
      next: 'farewell',
    },

    farewell: {
      speaker: 'senpai',
      lines: [
        '那就這樣說定囉。',
        '我先去社團了——之後見啦，新同學！',
      ],
    },
  },
};
