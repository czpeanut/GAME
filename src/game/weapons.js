// Weapon definitions. A weapon is pure data - Player reads `player.weapon`
// (a lookup into this table) to decide how to resolve an attack; nothing
// about *how* a swing or a shot resolves lives here, only the numbers that
// make each weapon feel different.
//
// Two families:
//
//   melee  - press to swing immediately; damage resolves instantly against
//            anything the swing's hitbox touches (multiple enemies can be
//            hit by one swing - a blade or a bat sweeping through a group is
//            not blocked by hitting the first target, unlike a bullet).
//            No aiming, no ramp-up: what you have in your hand is exactly as
//            accurate as your reach.
//
//   ranged - hold to fire repeatedly at `fireRate`. `spreadMax`/`spreadMin`
//            and `aimRampTime` model an unpracticed shooter: the first shots
//            after pressing fire scatter across a wide cone, and only
//            narrow down to something reliably accurate after holding the
//            trigger down continuously for `aimRampTime` seconds. Letting go
//            resets it - you have to steady up again, not just once per
//            fight.
//
// Damage is intentionally lopsided: melee weapons deal modest damage
// reflecting what a stick or a knife actually does to a person, while the
// pistol hits hard enough to be a clear step up in lethality - the tradeoff
// is the ramp-up and the fact that a miss while unsteady is a wasted shot,
// not a wasted swing.
export const WEAPONS = {
  fists: {
    id: 'fists',
    name: '拳頭',
    type: 'melee',
    damage: 1,
    range: 14,
    swingTime: 0.12,
    cooldown: 0.24,
    knockback: 70,
  },
  stick: {
    id: 'stick',
    name: '棍棒',
    type: 'melee',
    damage: 1,
    range: 24,
    swingTime: 0.2,
    cooldown: 0.32,
    // A blunt weapon's advantage is knockback, not damage - it staggers
    // more than it wounds.
    knockback: 160,
  },
  knife: {
    id: 'knife',
    name: '刀具',
    type: 'melee',
    damage: 2,
    range: 17,
    swingTime: 0.14,
    cooldown: 0.26,
    knockback: 90,
  },
  pistol: {
    id: 'pistol',
    name: '手槍',
    type: 'ranged',
    // Roughly 3-4x a melee weapon's damage per hit, and a knockback strong
    // enough that a hit visibly throws an enemy back rather than nudging it -
    // the whole point of letting a gun into the story at all is that it must
    // not feel like "a knife that doesn't need reach".
    damage: 4,
    knockback: 320,
    bulletSpeed: 900,
    // Slower than a practiced shooter's cyclic rate on purpose - this is
    // someone who has picked up a gun, not trained with one.
    fireRate: 0.4,
    // Holding fire continuously for this long earns the tight, "aimed" cone.
    aimRampTime: 2.4,
    spreadMax: 0.5, // ~28.6 degrees half-angle at the moment fire is first pressed
    spreadMin: 0.025, // ~1.4 degrees once fully steadied
    bulletColor: '#fff2c8',
    bulletGlow: '#ffb44d',
  },
};

export function getWeapon(id) {
  return WEAPONS[id] ?? WEAPONS.fists;
}
