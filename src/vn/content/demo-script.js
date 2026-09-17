// A short single-character practice script - "how do you phrase a question
// when you're stuck?" - written to exercise every feature the engine offers,
// so it doubles as a template for writing real lesson content:
//
//   - `speaker` is a character id (resolved to its display name and used to
//     pick which portrait plays the talking motion).
//   - `action(stage, app)` is how a node reaches into the world: change the
//     background, bring characters on/off stage, or touch story state
//     (flags/vars) and play a feedback sound. (With more than one variant
//     per part you'd also call stage.equip()/setExpression() here.)
//   - `choices` branch the conversation; each choice can carry its own
//     `action`/`flag` exactly like a node can.
//   - Nodes with no `next` and no `choices` end the conversation - reaching
//     `recap` here is how this script finishes.
//
// Replace this with real lesson content: same shape, different lines and
// choices.
export const DEMO_SCRIPT = {
  start: 'intro',
  nodes: {
    intro: {
      speaker: 'hero',
      action: (stage) => {
        stage.setBackground('classroom.jpg');
        stage.show('hero', 'center');
      },
      lines: [
        '欸，剛剛那題你是不是沒聽懂？',
        '沒關係，我以前也這樣。不過你要先開口問，老師才知道要幫你哪裡。',
        '來，先練習一次——你會怎麼跟老師說？',
      ],
      next: 'ask_practice',
    },
    ask_practice: {
      speaker: 'hero',
      lines: ['假設現在下課，你走到講台前面。你開口第一句話是什麼？'],
      choices: [
        {
          text: '老師，這裡我還不太懂，可以麻煩您再說明一次嗎？',
          next: 'good_response',
          flag: 'asked_well',
        },
        { text: '這什麼都不會教喔？', next: 'rude_response' },
        { text: '……（算了，不敢問）', next: 'silent_response' },
      ],
    },
    good_response: {
      speaker: 'hero',
      action: (stage, app) => {
        app.story.addVar('score', 1);
        app.audio.correct();
      },
      lines: [
        '對，就是這樣！',
        '你有講出「哪裡」不懂，老師就能直接從那邊接下去，不用猜。',
        '這句以後可以一直用，換個科目也一樣好用。',
      ],
      next: 'recap',
    },
    rude_response: {
      speaker: 'hero',
      action: (stage, app) => {
        app.story.addVar('attempts', 1);
        app.audio.incorrect();
      },
      lines: [
        '呃……這樣講，老師只會覺得你在嗆他。',
        '而且他還是不知道你卡在哪一步。',
        '重點是要講出「你卡住的那個地方」，要不要再試一次？',
      ],
      choices: [
        { text: '再試一次', next: 'ask_practice' },
        { text: '先繼續', next: 'recap' },
      ],
    },
    silent_response: {
      speaker: 'hero',
      action: (stage, app) => {
        app.story.addVar('attempts', 1);
      },
      lines: [
        '我知道，開口真的需要一點勇氣。',
        '但不問的話，老師永遠不會知道你卡住了——他只會以為你都懂。',
        '不用講得多漂亮，講出哪裡不懂就夠了。再試一次？',
      ],
      choices: [
        { text: '再試一次', next: 'ask_practice' },
        { text: '先繼續', next: 'recap' },
      ],
    },
    recap: {
      speaker: 'hero',
      lines: [
        '記住就三件事：講出哪一題、哪一步、你已經懂到哪裡。',
        '提問不用完美，敢開口就贏一半了。',
        '下次卡住，就照剛剛練的講一次看看。',
      ],
    },
  },
};
