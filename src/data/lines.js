// Voice. Register per docs/game-design.md §10: every line is about a thing in
// the room or a thing the player just did; deadpan; kind underneath. Lines
// marked (BM) are reused verbatim from Boon Moots v50 (index.html:135-162) —
// the rest are new, written to match those four calibration examples.

export const CLEAR_LINES = [
  'The moon was hiding behind a worse moon.',                                // (BM)
  'A door opens when you stop staring it down.',                             // (BM)
  'The cat has promoted you to suspicious contractor.',                      // (BM)
  'A pie waits on the sill. Useless. Perfect.',                              // (BM)
  'The old world learned to fit in one room. Horrifyingly efficient.',       // (BM)
  'The bench heals you like a dad holding a flashlight.',                    // (BM)
  'The room re-reads its own floor plan and sighs.',
  'The pots had opinions. The pots were overruled.',
  'Somewhere, a lectern files this under "rude."',
  'The portal hums the first four notes of something kind.',
  'New paint, same argument. You keep winning the argument.',
  'The hazards clock out. Union rules.',
  'The walls take notes for next time. Let them.',
  'Nothing left standing but you and the furniture that likes you.',
  'The room tries a different shape, like that was the problem.',
];

export const BEHAVIOR_NOTICES = {
  lowhp: 'You limp. The room quietly moves one blade away.',                 // (BM)
  still: 'You stop moving. The room stops lying.',                          // (BM)
  dash: 'The boots learned to spin instead of doing haunted gymnastics.',
  aim: 'Your aim found where fear points.',
  nohit: 'Clean room. Nothing brags.',                                       // (BM)
  care: 'Some objects help without glowing first.',                          // (BM)
  truth: 'The road was watching your hands, not your score.',                // (BM, round 13)
  endless: 'No ceiling now.',                                                // (BM)
};

export const DEATH_LINES = [
  'The boon boots remain.',
  'The room keeps your chalk outline as decor.',
  'The moon finally caught the room sitting still.',
  'The floor was patient. The floor is always patient.',
];

export const WIN_COPY =
  'The throne cracked. The room does not stop. It just stops pretending there was a bottom.';

export const TITLE_TAGLINES = [
  'Endless neon city. Grind the rails, dash the rooftops, never touch the brakes.',
  'The road grins. The boots answer. The skyline keeps unrolling ahead of you.',
];

export const BOSS_INTRO = {
  falseMoon: 'It aims where you aim. Stop aiming like that.',
  warden: 'The Archive sent its doorman.',
  spiggot: 'It brought the whole nursery.',
  archon: 'The bottom of the room wears a crown.',
};

export const MUTATOR_LINES = {
  brokenFloor: 'More pots than sense down here.',
  listeningFloor: 'Long sightlines. Perched witnesses.',
  generousFloor: 'The room sets the table. Suspicious. Eat anyway.',
  starvedFloor: 'Repairs run thin. Greed pays sharper.',
  bellFed: 'Someone fed the captains.',
  lowCeiling: 'The room pulls its walls in like a held breath.',
  doubles: 'The room deals the same hand twice and dares you.',
};

export const EVENT_WHISPERS = {
  care: 'Something in here helps without glowing first.',
  blackMarket: 'A stall with no vendor. The price is posted in you.',
  gambitShrine: 'An altar that flips coins it does not own.',
};
