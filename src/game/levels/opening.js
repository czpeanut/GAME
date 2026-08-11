// Level 0 - "甦醒" (Awakening), the opening chapter.
//
// A short vertical slice built to introduce the story rather than to be a
// full level: wake up with nothing, learn what happened to the country while
// you were unconscious, arm yourself with whatever is actually lying around
// - a stick, then a pistol handed over by a survivor - rather than an
// abstract unlock, and end on a hook rather than a scoreboard.
//
// Paced the same way level1 teaches mechanics - one thing at a time, alone,
// before it's combined with anything else - except here the "one thing" is
// often narrative rather than a jump. The one ability still gated the old
// way is dash (found later, via an adrenaline shot): it is movement tech,
// not a weapon, so it stays in the story-flag system rather than the
// pickup system.

import { LevelBuilder } from '../level.js';
import { T } from '../../engine/tilemap.js';
import { TILE } from '../constants.js';
import { CutsceneScene } from '../scenes/cutscene-scene.js';
import { DialogueScene } from '../scenes/dialogue-scene.js';
import { EndingScene } from '../scenes/ending-scene.js';
import {
  wakeUpScript,
  foundNoteScript,
  warningLooterScript,
  findAdrenalineScript,
  warningTurretScript,
  zhouScript,
  closingScript,
} from '../dialogues/opening-dialogues.js';

const COLS = 100;
// Only 3 rows of bedrock below the surface - see the identical note in
// level1: a deeper fill pushes the horizon into the middle of the screen
// whenever the player is on the ground, since the camera clamps to map
// bounds.
const ROWS = 19;
const GROUND = 16;

export function buildOpening() {
  const b = new LevelBuilder(COLS, ROWS);

  b.fill(0, GROUND, COLS - 1, ROWS - 1, T.DIRT);
  b.platform(0, COLS - 1, GROUND, T.MOSS); // five years of overgrowth on the rubble
  b.fill(0, 0, 0, ROWS - 1, T.SOLID);
  b.fill(COLS - 1, 0, COLS - 1, ROWS - 1, T.SOLID);

  b.start(4, GROUND - 2);

  // -- Section: the ward. Nothing to do here but notice the note. ----------
  b.storyTrigger(9, GROUND - 2, 12, GROUND - 1, {
    id: 'found_note',
    flag: 'found_note',
    onEnter: (world, game) => {
      game.scenes.push(new DialogueScene(game, foundNoteScript));
    },
  });

  // -- Section: a gap that only needs a jump - the story hasn't handed out
  // anything else yet, and shouldn't need to. --------------------------
  b.carve(24, GROUND, 26, ROWS - 1);
  b.platform(30, 34, GROUND - 3, T.MOSS); // an optional high ledge to explore

  // -- Section: the first weapon - a stick, found before the first fight so
  // combat never opens with the player completely unarmed. Fists work, but
  // barely; this is meant to feel like an upgrade, not a formality. --------
  b.weaponPickup(29, GROUND - 2, 'stick');

  // -- Section: the first looter, fought with whatever is in hand right now
  // (stick, or fists if the pickup above was somehow missed) - this is the
  // primary early threat the story keeps coming back to. -------------------
  b.storyTrigger(33, GROUND - 2, 34, GROUND - 1, {
    id: 'warn_looter',
    flag: 'warn_looter',
    onEnter: (world, game) => {
      game.scenes.push(new DialogueScene(game, warningLooterScript));
    },
  });
  b.enemy('Walker', 37, GROUND - 1);

  // -- Section: 老周, the survivor, met after fighting through with a stick.
  // This is the exposition beat and the moment a firearm enters the story -
  // as a physical object handed over, not an abstract unlock. --------------
  b.npc(43, GROUND - 2, {
    id: 'old-zhou',
    color: '#c9a25b',
    onInteract: (world, game) => {
      game.scenes.push(new DialogueScene(game, zhouScript(game)));
    },
  });

  // -- Section: a second looter, now fought with the pistol - deliberately
  // placed right after Zhou so the power gap between "stick" and "gun" is
  // felt immediately, not just told. ---------------------------------------
  b.storyTrigger(50, GROUND - 2, 51, GROUND - 1, {
    id: 'warn_looter_2',
    flag: 'warn_looter_2',
    onEnter: (world, game) => {
      game.scenes.push(new DialogueScene(game, warningLooterScript));
    },
  });
  b.enemy('Walker', 54, GROUND - 1);

  // -- Section: the dash gate, then a gap sized so it cannot be crossed
  // without it (verified by test/opening.test.mjs, the same way level1's
  // shaft width was verified rather than eyeballed). ------------------------
  b.storyTrigger(60, GROUND - 2, 61, GROUND - 1, {
    id: 'found_adrenaline',
    flag: 'found_adrenaline',
    onEnter: (world, game) => {
      game.scenes.push(new DialogueScene(game, findAdrenalineScript));
    },
  });
  // 3 tiles (96px), not wider. A horizontal dash travels dashSpeed *
  // dashDuration = 690 * 0.16 = ~110px while pinning vertical velocity to
  // zero for the whole burst - but only for that burst. The instant it ends,
  // gravity resumes from whatever height the player was at when they left
  // solid ground, so the horizontal clearance has to be complete *before*
  // they sink even a few pixels below the far ledge's surface, or they hit
  // its vertical face instead of landing on top of it and slide down it to
  // their death. A 5-tile gap left a ~20px shortfall verified experimentally
  // (test/opening.test.mjs) where the dash reliably almost - but not quite -
  // reached the far side; 3 tiles clears with margin.
  b.carve(65, GROUND, 67, ROWS - 1);

  // -- Section: a leftover autonomous sentry gun, framed by a warning. -----
  b.storyTrigger(74, GROUND - 2, 75, GROUND - 1, {
    id: 'warn_turret',
    flag: 'warn_turret',
    onEnter: (world, game) => {
      game.scenes.push(new DialogueScene(game, warningTurretScript));
    },
  });
  b.enemy('Turret', 80, GROUND - 1);

  // -- Section: the way out, and the end of this chapter. ------------------
  b.storyTrigger(92, GROUND - 2, 94, GROUND - 1, {
    id: 'chapter_end',
    flag: 'chapter_end',
    onEnter: (world, game) => {
      game.scenes.push(
        new CutsceneScene(
          game,
          [{ type: 'dialogue', script: closingScript }, { type: 'fadeOut', seconds: 1.4 }],
          {
            onComplete: (world2, game2) => {
              game2.scenes.push(
                new EndingScene(game2, {
                  heading: '第一章：甦醒　完',
                  color: '#e8c98a',
                  lines: [
                    '感謝試玩。',
                    '',
                    '故事將在下一章繼續——舊車站，以及戰爭的真相。',
                  ],
                })
              );
            },
          }
        )
      );
    },
  });

  return b.build('甦醒');
}

// Pushed once, the moment the title screen closes - the "you regain control
// of your own body" beat, told entirely as a cutscene rather than a HUD hint,
// since there is nothing on screen yet worth pointing an arrow at.
export function openingOnStart(game) {
  game.scenes.push(
    new CutsceneScene(game, [
      { type: 'fadeIn', seconds: 2.2 },
      { type: 'wait', seconds: 0.3 },
      { type: 'dialogue', script: wakeUpScript },
    ])
  );
}

// The opening starts able to move and jump, and armed with nothing but fists
// - a weapon has to be found (see the stick pickup and Old Zhou's pistol
// above), which is a physical object, not an ability flag. Dash is the one
// remaining movement-tech gate, earned via the adrenaline pickup
// (findAdrenalineScript above). Double jump and wall jump are left unlocked:
// this chapter's geometry never needs them, and gating an ability with no
// narrative reason attached to it would just be an arbitrary restriction.
export const OPENING_STARTING_ABILITIES = { dash: false };
