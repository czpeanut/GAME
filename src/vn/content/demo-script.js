// A short example practice script - "how do you phrase a question to your
// teacher when you're stuck?" - written to exercise every feature the engine
// offers, so it doubles as a template for writing real lesson content:
//
//   - `speaker` is a character id (resolved to its display name and used to
//     pick which portrait bounces while talking).
//   - `action(stage, app)` is how a node reaches into the world: change the
//     background, bring characters on/off stage, or touch story state
//     (flags/vars) and play a feedback sound. (If a character ever has more
//     than one image slot, this is also where you'd call
//     stage.setExpression()/stage.equip() - see character.js - but the demo
//     characters here are single-image, so neither is used below.)
//   - `choices` branch the conversation; each choice can carry its own
//     `action`/`flag` exactly like a node can.
//   - Nodes with no `next` and no `choices` end the conversation - reaching
//     `recap` here is how this script finishes.
//
// Replace this with real lesson content: same shape, different lines/
// choices. See character.js and stage.js for the full authoring API.
export const DEMO_SCRIPT = {
  start: 'intro',
  nodes: {
    intro: {
      speaker: 'teacher',
      action: (stage) => {
        stage.setBackground('classroom');
        stage.show('teacher', 'left');
        stage.show('mei', 'right');
      },
      lines: ['今天我們來練習：遇到聽不懂的地方，你會怎麼開口問？', '小安，你要不要示範一次？'],
      next: 'ask_practice',
    },
    ask_practice: {
      speaker: 'mei',
      lines: ['嗯……我該怎麼說才好呢？'],
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
      speaker: 'teacher',
      // No expression/outfit swap here - the demo characters are single-
      // image (see demo-characters.js), so feedback is score + sound only.
      // The portrait itself keeps breathing/bouncing throughout regardless.
      action: (stage, app) => {
        app.story.addVar('score', 1);
        app.audio.correct();
      },
      lines: ['問得很好！具體說出「哪裡不懂」，老師才知道要怎麼幫你。', '這樣的提問方式，以後可以多用喔。'],
      next: 'recap',
    },
    rude_response: {
      speaker: 'teacher',
      action: (stage, app) => {
        app.story.addVar('attempts', 1);
        app.audio.incorrect();
      },
      lines: ['這樣問，老師會不知道你卡在哪裡喔。', '要不要換個說法，具體說說是哪個部分不懂？'],
      choices: [
        { text: '再試一次', next: 'ask_practice' },
        { text: '先繼續', next: 'recap' },
      ],
    },
    silent_response: {
      speaker: 'mei',
      action: (stage, app) => {
        app.story.addVar('attempts', 1);
      },
      lines: ['不問的話，老師也不會知道你卡住了呢。', '沒關係，我們再試一次。'],
      choices: [
        { text: '再試一次', next: 'ask_practice' },
        { text: '先繼續', next: 'recap' },
      ],
    },
    recap: {
      speaker: 'teacher',
      lines: ['提問不用完美，敢開口、說清楚卡在哪裡，就已經很棒了。', '之後遇到不懂的地方，記得再試試看！'],
    },
  },
};
