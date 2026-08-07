// Dialogue content for the opening chapter. Kept separate from the level's
// geometry (opening.js) so the writing can be edited without touching tile
// coordinates, and vice versa.
//
// Every script is plain data (see DialogueRunner for the node-graph shape),
// except the ones that need to check story state to decide what to say - those
// are exported as functions of `game` and called at the moment the trigger or
// NPC fires, not at module load time, so they always see current flags.

export const wakeUpScript = {
  start: 'a',
  nodes: {
    a: { lines: ['……', '…是誰？', '這裡是……哪裡？'], next: 'b' },
    b: {
      lines: [
        '腦袋像是灌了鉛，四肢也不聽使喚。',
        '花了好一段時間，意識才一點一點拼湊回來。',
      ],
      next: 'c',
    },
    c: {
      lines: [
        '最後的記憶，停在五年前的那個晚上。',
        '之後的事，全是空白。',
      ],
    },
  },
};

export const foundNoteScript = {
  start: 'a',
  nodes: {
    a: {
      lines: [
        '牆角散落著一張泛黃的公告，字跡已經模糊。',
        '「因應戰事，即日起實施宵禁與物資管制——」',
        '公告的日期，是五年前。',
      ],
    },
  },
};

export const warningLooterScript = {
  start: 'a',
  nodes: { a: { lines: ['前方有動靜——是劫匪。小心點。'] } },
};

export const findAdrenalineScript = {
  start: 'a',
  nodes: {
    a: {
      lines: [
        '地上有一支廢棄的腎上腺素注射筆，指針還沒歸零。',
        '注射之後，四肢瞬間充滿了力氣——或許能撐過眼前的難關了。',
      ],
      flag: 'found_adrenaline',
      action: (world, game) => game.story.grantAbility('dash'),
    },
  },
};

export const warningTurretScript = {
  start: 'a',
  nodes: { a: { lines: ['警告：偵測到殘存的軍用哨戒裝置。保持距離。'] } },
};

// The 老周 (Old Zhou) conversation. Written as a function of `game` so a
// repeat conversation, after the gun has already changed hands, shows a short
// follow-up instead of replaying the whole introduction.
export function zhouScript(game) {
  if (game.story.hasFlag('received_gun')) {
    return {
      start: 'again',
      nodes: {
        again: {
          speaker: '老周',
          lines: ['往南邊走，順著舊鐵軌，就能找到車站。', '路上小心點。'],
        },
      },
    };
  }

  return {
    start: 'greet',
    nodes: {
      greet: {
        speaker: '老周',
        lines: ['……有活人？', '這年頭，能自己站著走進來的，不多了。'],
        next: 'ask1',
      },
      ask1: {
        speaker: '你',
        lines: ['這裡……發生了什麼事？我昏迷了多久？'],
        next: 'explain1',
      },
      explain1: {
        speaker: '老周',
        lines: [
          '整整五年了，兄弟。',
          '五年前，戰事打到了本島，政府一夕之間就垮了。',
          '之後就沒有「之後」了——沒有警察，沒有法律，只剩下搶地盤的人。',
        ],
        next: 'explain2',
      },
      explain2: {
        speaker: '老周',
        lines: [
          '解放軍的殘部躲進了山裡，三不五時下來巡邏，見人就抓去問話。',
          '劫匪比他們更狠，專挑落單的人下手。',
          '這座城，白天是廢墟，天一黑就成了獵場。',
        ],
        next: 'ask2',
      },
      ask2: {
        speaker: '你',
        lines: ['我的家人呢——我妻子和女兒，你知道她們的下落嗎？'],
        next: 'family',
      },
      family: {
        speaker: '老周',
        lines: [
          '……這名字我聽過。',
          '當年的撤離名單上有登記，但後來怎麼樣，誰也說不準。',
          '往南邊、順著舊鐵軌走，聽說車站那邊還有人聚居。她們要是還活著，也許就在那。',
        ],
        choices: [
          { text: '謝謝，我這就出發。', next: 'give' },
          { text: '這場戰爭，到底是怎麼開始的？', next: 'truth' },
        ],
      },
      truth: {
        speaker: '老周',
        lines: [
          '真相？呵。',
          '每個活下來的人，都有自己的一套說法，沒人說得準哪個才是真的。',
          '你要是真想知道，就得自己去挖——去找當年留下來的紀錄。',
        ],
        next: 'give',
      },
      give: {
        speaker: '老周',
        lines: [
          '拿去吧，這把槍我用不上了，這把老骨頭跑不動了。',
          '外面不比從前，該出手的時候，別客氣。',
        ],
        flag: 'received_gun',
        action: (world, game) => game.story.grantAbility('fire'),
        next: 'farewell',
      },
      farewell: {
        speaker: '老周',
        lines: ['小心點，兄弟。', '活著，比什麼都重要。'],
      },
    },
  };
}

export const closingScript = {
  start: 'a',
  nodes: {
    a: {
      lines: [
        '南邊的舊車站，是他目前僅剩的線索。',
        '至於五年前那場戰爭真正的起點——答案，或許就藏在這片廢墟更深的地方。',
      ],
    },
  },
};
