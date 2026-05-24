import type { TimeOfDay } from './state';

export type RoomId =
  | 'kyle-cottage'
  | 'kyle-field'
  | 'town-square'
  | 'willow-branch-inn'
  | 'town-hall'
  | 'mountain-monastery'
  | 'forest-edge';

export type Room = {
  id: RoomId;
  name: string;
  description: string;
  // Rooms you can move to directly from here.
  exits: RoomId[];
  // Things the player can examine. label → narrator briefing fragment.
  affordances?: Array<{ id: string; label: string; briefing: string }>;
};

export const rooms: Record<RoomId, Room> = {
  'kyle-cottage': {
    id: 'kyle-cottage',
    name: "Kyle's Cottage",
    description:
      "A one-room cottage Kyle's late grandfather left behind. Bed, dresser, wooden trunk, nightstand with a blank blue leather journal, and an old TV in the corner that gets exactly three channels.",
    exits: ['kyle-field'],
    affordances: [
      {
        id: 'look-trunk',
        label: 'Look in the trunk',
        briefing: 'Kyle opens the heavy trunk. Old farm clothes, a coiled rope, a tin lantern.',
      },
      {
        id: 'look-tv',
        label: 'Flip on the TV',
        briefing:
          'The TV crackles to life. Three channels: a weather report (clear, warm), a news ticker about a Spring Wish Festival, and a static hiss with intermittent words.',
      },
      {
        id: 'read-journal',
        label: 'Open the journal',
        briefing:
          'The blue leather journal is blank. The first page bears Kyle’s name in fresh ink, as if it wrote itself.',
      },
    ],
  },
  'kyle-field': {
    id: 'kyle-field',
    name: "Kyle's Field",
    description:
      'The overgrown family field. Knee-high weeds, brambles, scattered boulders, and a few sickly fruit trees in the distance. A weathered shipping bin sits near the gate. A well stands behind the cottage.',
    exits: ['kyle-cottage', 'town-square', 'forest-edge'],
    affordances: [
      {
        id: 'till-soil',
        label: 'Till a patch of soil',
        briefing:
          'Kyle uses the hoe. The blade bites the dry earth more easily than he expected; a tidy small patch of tillable soil opens up.',
      },
      {
        id: 'inspect-bin',
        label: 'Inspect the shipping bin',
        briefing:
          'The shipping bin is half-rotted but functional. Anything dropped in goes to Harold and credits the account.',
      },
      {
        id: 'walk-the-line',
        label: 'Walk the property line',
        briefing:
          'Kyle paces the boundary. Acres, but heavily overgrown. A sign at the crossroads points: TOWN, FOREST, NEIGHBORING FARM.',
      },
    ],
  },
  'town-square': {
    id: 'town-square',
    name: 'Town Square',
    description:
      'The heart of Willow Creek. Pastel cobbles, some crooked. A huge willow tree in the middle stands sparsely bloomed and brown-spotted. A broken statue pedestal is wrapped in its roots. A small ice cream cart is parked nearby. Shops ring the perimeter.',
    exits: ['kyle-field', 'willow-branch-inn', 'town-hall', 'mountain-monastery'],
    affordances: [
      {
        id: 'look-statue',
        label: 'Examine the broken statue pedestal',
        briefing:
          'Only a pair of stone feet wrapped in carved fabric remain. The Harvest Queen statue, the townsfolk call it. Lightning broke her, a year ago.',
      },
      {
        id: 'rest-under-willow',
        label: 'Sit under the willow',
        briefing:
          'Kyle settles under the great willow. Even sickly, it gives shade. He breathes.',
      },
    ],
  },
  'willow-branch-inn': {
    id: 'willow-branch-inn',
    name: 'Willow Branch Inn',
    description:
      'The town inn and gathering place. An overflowing flagon hangs above the door. Inside: a long oak bar where Harold pours drinks and weighs produce, a kitchen behind, a corner table, and a long front table where most townsfolk eat.',
    exits: ['town-square'],
    affordances: [
      {
        id: 'order-stew',
        label: 'Order the hearty stew',
        briefing:
          'Harold ladles out a bowl of stew — baby carrots, small potatoes, wine-beef broth. Exactly the way Grandpa used to make it.',
      },
      {
        id: 'order-ale',
        label: 'Order an ale',
        briefing: 'Harold pulls a foamy mug of Willow Branch ale and slides it across the bar.',
      },
      {
        id: 'sit-corner',
        label: 'Sit in the corner table',
        briefing:
          'Kyle takes the corner table. From here he can watch the room without being watched.',
      },
    ],
  },
  'town-hall': {
    id: 'town-hall',
    name: 'Town Hall',
    description:
      'A whitewashed hall with a clock on its red roof. Inside: a heavy oak desk with neat stacks of paper and a silver bell, a leather-bound charter on a small lectern, and a pinboard of posted Tasks.',
    exits: ['town-square'],
    affordances: [
      {
        id: 'ring-bell',
        label: 'Ring the silver bell on the desk',
        briefing: 'The bell rings clear and small. Whoever is around will know Kyle is here.',
      },
      {
        id: 'read-charter',
        label: 'Read the town charter',
        briefing:
          'The charter speaks of Willow Creek’s founding, the original farm covenant, and the role of the Harvest Queen in good seasons.',
      },
      {
        id: 'read-board',
        label: 'Read the posted Tasks board',
        briefing:
          'A handful of pinned Tasks: small errands, deliveries, requests for produce. Nothing formal addressed to Kyle yet.',
      },
    ],
  },
  'mountain-monastery': {
    id: 'mountain-monastery',
    name: 'Mountain Monastery',
    description:
      'A narrow stone refuge on the mountain. The air smells of drying herbs and steeped tea. A worn blue meditation cushion sits in the center of the floor. A drying rack hangs heavy with bundled lavender, valerian root, and chamomile. A copper kettle whistles softly when ready.',
    exits: ['town-square'],
    affordances: [
      {
        id: 'meditate-cushion',
        label: 'Sit on the meditation cushion',
        briefing:
          "Kyle settles onto the cushion. It's older than him, soft from use. The silence feels deliberate.",
      },
      {
        id: 'brew-tea',
        label: 'Brew a cup of tea',
        briefing:
          'Kyle warms the copper kettle. The herbs steep into something earthy and clarifying.',
      },
      {
        id: 'browse-herbs',
        label: 'Browse the herb rack',
        briefing:
          'The herb rack is fastidiously organized: lavender, valerian root, chamomile, and a row of small jars Kyle can’t identify.',
      },
    ],
  },
  'forest-edge': {
    id: 'forest-edge',
    name: 'Forest Edge',
    description:
      'The forest behind the farm has a strange shimmer. Leaves are dusky violet at the tips. A narrow path leads in toward a sparkling pond, with cattails along the bank. The air feels older here.',
    exits: ['kyle-field'],
    affordances: [
      {
        id: 'forage-berries',
        label: 'Forage along the path',
        briefing:
          'Kyle spots clusters of small blue Spring Mountain Berries. Sour. And a few mushrooms — some green and glowing on logs, some red on the ground.',
      },
      {
        id: 'sit-pond',
        label: 'Sit by the pond',
        briefing:
          'Frogs chirp from the cattails. Brown fish flicker just below the sparkling surface.',
      },
    ],
  },
};

export type NpcId = 'Harold' | 'Mayor' | 'Collette' | 'Laurel' | 'Milo';

// Per time-of-day NPC presence. A lookup table replacing the old movement schedule.
// (The story has these characters in town all day; this table places them at the most
// natural room for each block.)
const NPC_PRESENCE: Record<NpcId, Record<TimeOfDay, RoomId | null>> = {
  Harold: {
    morning: 'willow-branch-inn',
    midday: 'willow-branch-inn',
    afternoon: 'town-square',
    evening: 'willow-branch-inn',
    night: 'willow-branch-inn',
  },
  Mayor: {
    morning: 'town-hall',
    midday: 'town-hall',
    afternoon: 'town-square',
    evening: 'willow-branch-inn',
    night: 'town-hall',
  },
  Collette: {
    morning: 'willow-branch-inn', // she's "above the inn" / in the loft
    midday: 'willow-branch-inn',
    afternoon: 'town-square',
    evening: 'willow-branch-inn',
    night: 'willow-branch-inn',
  },
  Laurel: {
    morning: 'mountain-monastery',
    midday: 'town-square', // meditates at the broken statue
    afternoon: 'mountain-monastery',
    evening: 'mountain-monastery',
    night: 'mountain-monastery',
  },
  Milo: {
    morning: 'town-square', // ice cream cart
    midday: 'town-square',
    afternoon: 'town-square',
    evening: 'willow-branch-inn',
    night: 'town-square',
  },
};

export function npcsInRoom(roomId: RoomId, timeOfDay: TimeOfDay): NpcId[] {
  const npcs: NpcId[] = [];
  for (const [npc, schedule] of Object.entries(NPC_PRESENCE)) {
    if (schedule[timeOfDay] === roomId) {
      npcs.push(npc as NpcId);
    }
  }
  return npcs;
}

export function roomExists(roomId: string): roomId is RoomId {
  return roomId in rooms;
}

export function getRoom(roomId: RoomId): Room {
  return rooms[roomId];
}

export const ALL_NPCS: NpcId[] = ['Harold', 'Mayor', 'Collette', 'Laurel', 'Milo'];
