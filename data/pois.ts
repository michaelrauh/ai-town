import type { PoiSubObject } from '../convex/aiTown/worldMap';

export type PoiKind = 'home' | 'shop' | 'park' | 'workplace';

export type Poi = {
  id: string;
  name: string;
  kind: PoiKind;
  bbox: { x: number; y: number; w: number; h: number };
  description: string;
  subObjects?: PoiSubObject[];
};

// Bbox coordinates are tile-space. The map is 64 tiles wide × 48 tiles tall.
export const pois: Poi[] = [
  {
    id: 'kyle-cottage',
    name: "Kyle's Cottage",
    kind: 'home',
    bbox: { x: 4, y: 6, w: 6, h: 5 },
    description:
      "A one-room cottage Kyle's late grandfather left behind. The dresser clothes itself when you toss laundry on the floor, and a small TV in the corner gets exactly three channels.",
    subObjects: [
      {
        id: 'bed',
        name: 'Bed',
        description: 'A small bed with worn but clean sheets.',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
      {
        id: 'nightstand',
        name: 'Nightstand',
        description: 'A small nightstand with a blue leather journal and a fancy drippy pen on top.',
        affordances: [
          { id: 'read-journal', name: 'Read the journal', emoji: '📓', defaultDurationMs: 60000 },
        ],
        subObjects: [
          {
            id: 'journal',
            name: 'Journal',
            description: "Kyle's blank blue leather journal.",
            affordances: [],
            portable: {
              itemId: 'journal',
              name: 'Journal',
              description: "Kyle's personal journal.",
              emoji: '📓',
              tags: ['paper', 'curio'],
              sellPrice: 4,
            },
          },
        ],
      },
      {
        id: 'dresser',
        name: 'Dresser',
        description: 'A weathered dresser. Drop laundry on the floor and it ends up here, folded.',
        affordances: [
          { id: 'change-clothes', name: 'Change clothes', emoji: '👕', defaultDurationMs: 45000 },
        ],
      },
      {
        id: 'trunk',
        name: 'Wooden trunk',
        description: 'A large wooden trunk at the foot of the bed.',
        affordances: [
          { id: 'rummage', name: 'Rummage in the trunk', emoji: '🧰', defaultDurationMs: 60000 },
        ],
      },
      {
        id: 'tv',
        name: 'Old TV',
        description: 'An old-fashioned TV with three channels: Weather, News, and a mysterious ???.',
        affordances: [
          { id: 'watch-tv', name: 'Watch TV', emoji: '📺', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'knapsack',
        name: 'Knapsack',
        description: "Grandpa's suede knapsack. Looks small but somehow fits everything.",
        affordances: [],
        subObjects: [
          {
            id: 'hoe',
            name: 'Hoe',
            description: "Grandfather's old hoe, dirty but ready to till.",
            affordances: [],
            portable: {
              itemId: 'hoe',
              name: 'Hoe',
              description: "Grandfather's old hoe.",
              emoji: '🪓',
              tags: ['tool', 'farm'],
              sellPrice: 6,
            },
          },
          {
            id: 'taskbook',
            name: 'Taskbook',
            description: 'A magical task book that records every formal Task you accept.',
            affordances: [
              { id: 'read-taskbook', name: 'Open the Taskbook', emoji: '📒', defaultDurationMs: 45000 },
            ],
            portable: {
              itemId: 'taskbook',
              name: 'Taskbook',
              description: 'Where formal Tasks are recorded.',
              emoji: '📒',
              tags: ['paper', 'curio'],
              sellPrice: 0,
            },
          },
        ],
      },
    ],
  },
  {
    id: 'town-hall',
    name: 'Town Hall',
    kind: 'home',
    bbox: { x: 28, y: 4, w: 5, h: 4 },
    description:
      'A whitewashed hall with a clock on its red roof. The Mayor lives and works here, presiding over the affairs of Willow Creek.',
    subObjects: [
      {
        id: 'mayor-desk',
        name: 'Mayor’s desk',
        description: 'A heavy oak desk piled with neat stacks of paper and a silver bell.',
        affordances: [
          { id: 'meet-mayor', name: 'Meet with the Mayor', emoji: '🎩', defaultDurationMs: 120000 },
          { id: 'propose-task', name: 'Propose a Task', emoji: '📜', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'task-board',
        name: 'Task board',
        description: 'A pinboard of posted Tasks awaiting a willing villager.',
        affordances: [
          { id: 'read-board', name: 'Read the board', emoji: '📋', defaultDurationMs: 60000 },
        ],
        subObjects: [
          {
            id: 'posted-tasks',
            name: 'Posted Tasks',
            description: 'A sheaf of formal Task notices, neatly pinned.',
            affordances: [],
            portable: {
              itemId: 'posted-tasks',
              name: 'Posted Tasks',
              description: 'A copy of the day’s posted Tasks.',
              emoji: '📋',
              tags: ['paper', 'curio'],
              sellPrice: 1,
            },
          },
        ],
      },
      {
        id: 'town-charter',
        name: 'Town charter',
        description: 'A leatherbound copy of the founding charter of Willow Creek.',
        affordances: [
          { id: 'read-charter', name: 'Read the charter', emoji: '📜', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
    ],
  },
  {
    id: 'collette-loft',
    name: "Collette's Loft",
    kind: 'home',
    bbox: { x: 52, y: 6, w: 5, h: 5 },
    description:
      "A small loft above the Willow Branch Inn. Collette lives here while her absent parents are away.",
    subObjects: [
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
      {
        id: 'vanity',
        name: 'Vanity',
        description: 'A small vanity with a streaked mirror and a single blue hair clip.',
        affordances: [
          { id: 'dress-up', name: 'Touch up the blue streak', emoji: '💄', defaultDurationMs: 60000 },
        ],
      },
      {
        id: 'letter-stash',
        name: 'Letter stash',
        description: 'A bundle of unsent letters tied with twine.',
        affordances: [
          { id: 'reread-letters', name: 'Re-read the letters', emoji: '✉️', defaultDurationMs: 90000 },
        ],
        subObjects: [
          {
            id: 'unsent-letters',
            name: 'Unsent letters',
            description: 'A small bundle of letters Collette has never managed to send.',
            affordances: [],
            portable: {
              itemId: 'unsent-letters',
              name: 'Unsent letters',
              description: 'A bundle of letters Collette never sent.',
              emoji: '✉️',
              tags: ['paper', 'curio'],
              sellPrice: 2,
            },
          },
        ],
      },
    ],
  },
  {
    id: 'willow-branch-inn',
    name: 'Willow Branch Inn',
    kind: 'shop',
    bbox: { x: 10, y: 22, w: 8, h: 6 },
    description:
      "The town's inn and gathering place. Harold tends bar, buys farm produce at the counter, and runs the day-labor board. An overflowing flagon hangs from the sign above the door.",
    subObjects: [
      {
        id: 'bar-counter',
        name: 'Bar counter',
        description: 'A long oak bar where Harold pours drinks and weighs farm produce for shipping.',
        affordances: [
          { id: 'order-drink', name: 'Order a drink', emoji: '🍺', defaultDurationMs: 45000 },
          { id: 'sell-produce', name: 'Sell produce to Harold', emoji: '🥬', defaultDurationMs: 60000 },
        ],
        commerce: {
          buy: [
            {
              itemId: 'ale',
              name: 'Ale',
              description: 'A foamy mug of Willow Branch ale.',
              emoji: '🍺',
              tags: ['food', 'drink'],
              price: 5,
              sellPrice: 1,
            },
            {
              itemId: 'cider',
              name: 'Cider',
              description: 'Sweet apple cider from the orchards.',
              emoji: '🍻',
              tags: ['food', 'drink'],
              price: 4,
              sellPrice: 1,
            },
            {
              itemId: 'hearty-stew',
              name: 'Hearty stew',
              description:
                'A bowl of stew with baby carrots, small potatoes, and wine-beef broth — exactly the way Grandpa used to make it.',
              emoji: '🍲',
              tags: ['food'],
              price: 8,
              sellPrice: 2,
            },
            {
              itemId: 'bread',
              name: 'Bread',
              description: 'A warm loaf, sliced.',
              emoji: '🍞',
              tags: ['food'],
              price: 3,
              sellPrice: 1,
            },
          ],
          sellTags: ['vegetable', 'herb', 'grain', 'fruit', 'curio', 'produce', 'food'],
        },
        subObjects: [
          {
            id: 'produce-scale',
            name: 'Produce scale',
            description: 'A brass scale Harold uses to weigh and price farm output.',
            affordances: [
              { id: 'weigh-produce', name: 'Weigh produce', emoji: '⚖️', defaultDurationMs: 45000 },
            ],
          },
        ],
      },
      {
        id: 'kitchen',
        name: 'Inn kitchen',
        description: 'A cramped kitchen where Collette and Harold trade off cooking duties.',
        affordances: [
          { id: 'cook-stew', name: 'Cook stew', emoji: '🍲', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'corner-table',
        name: 'Corner table',
        description: 'A quiet corner where regulars nurse their drinks.',
        affordances: [
          { id: 'sit', name: 'Sit at the corner table', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'nurse-drink', name: 'Nurse a drink', emoji: '🍺', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'front-table',
        name: 'Front table',
        description: 'A long table near the front, where most of the townsfolk eat.',
        affordances: [
          { id: 'sit', name: 'Sit at the table', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'share-stew', name: 'Share stew', emoji: '🍲', defaultDurationMs: 120000 },
        ],
      },
    ],
  },
  {
    id: 'town-square',
    name: 'Town Square',
    kind: 'park',
    bbox: { x: 28, y: 22, w: 12, h: 10 },
    description:
      'The heart of Willow Creek — pastel cobbles, some crooked. A great willow tree stands in the center, sick and sparsely bloomed. The base of its trunk is wrapped around a broken statue pedestal.',
    subObjects: [
      {
        id: 'great-willow-tree',
        name: 'Great Willow Tree',
        description:
          'An enormous willow tree whose blooms have grown sparse and brown-spotted since the curse fell.',
        affordances: [
          { id: 'rest-under-willow', name: 'Rest under the willow', emoji: '🌳', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'broken-statue-pedestal',
        name: 'Broken statue pedestal',
        description:
          'The shattered remains of the Harvest Queen statue. All that is left is a pair of stone feet wrapped in carved fabric. Laurel meditates here daily.',
        affordances: [
          { id: 'pay-respects', name: 'Pay respects', emoji: '🕯️', defaultDurationMs: 60000 },
          { id: 'meditate', name: 'Meditate at the pedestal', emoji: '🧘', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'ice-cream-cart',
        name: 'Ice cream cart',
        description: "Milo's wooden ice cream cart, painted blue. Seasonal flavors.",
        affordances: [
          { id: 'buy-cone', name: 'Buy a cone', emoji: '🍦', defaultDurationMs: 30000 },
        ],
        commerce: {
          buy: [
            {
              itemId: 'vanilla-cone',
              name: 'Vanilla cone',
              description: 'A simple vanilla ice cream cone.',
              emoji: '🍦',
              tags: ['food'],
              price: 2,
              sellPrice: 0,
            },
            {
              itemId: 'berry-cone',
              name: 'Spring berry cone',
              description: 'Pale blue ice cream made from Spring Mountain Berries.',
              emoji: '🍨',
              tags: ['food'],
              price: 3,
              sellPrice: 1,
            },
          ],
          sellTags: ['fruit', 'vegetable'],
        },
      },
      {
        id: 'bench',
        name: 'Bench',
        description: 'A wooden bench worn smooth by decades of townsfolk.',
        affordances: [
          { id: 'sit', name: 'Sit on the bench', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'people-watch', name: 'People-watch', emoji: '👀', defaultDurationMs: 120000 },
        ],
      },
    ],
  },
  {
    id: 'milo-cottage',
    name: "Milo's Place",
    kind: 'home',
    bbox: { x: 50, y: 22, w: 5, h: 5 },
    description: 'A small cottage on the edge of the square where Milo lives and stores his cart supplies.',
    subObjects: [
      {
        id: 'freezer-chest',
        name: 'Freezer chest',
        description: 'A magically cold chest where Milo stores tomorrow’s ice cream.',
        affordances: [
          { id: 'restock-ice-cream', name: 'Restock ice cream', emoji: '🍨', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'cart-spare-parts',
        name: 'Cart spare parts',
        description: 'Spare wheels, a hand-cranked churn, and tools for the ice cream cart.',
        affordances: [
          { id: 'tinker-cart', name: 'Tinker with the cart', emoji: '🔧', defaultDurationMs: 90000 },
        ],
        subObjects: [
          {
            id: 'spare-wheel',
            name: 'Spare wheel',
            description: 'A wooden cart wheel, ready to swap in.',
            affordances: [],
            portable: {
              itemId: 'spare-wheel',
              name: 'Spare wheel',
              description: 'A spare wooden cart wheel.',
              emoji: '🛞',
              tags: ['tool', 'curio'],
              sellPrice: 3,
            },
          },
        ],
      },
      {
        id: 'dresser',
        name: 'Dresser',
        affordances: [
          { id: 'change-clothes', name: 'Change clothes', emoji: '👕', defaultDurationMs: 45000 },
        ],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
    ],
  },
  {
    id: 'mountain-monastery',
    name: 'Mountain Monastery',
    kind: 'home',
    bbox: { x: 10, y: 38, w: 5, h: 7 },
    description:
      'The Mountain Monastery — a narrow stone refuge full of drying herbs and the smell of steeped tea. Laurel lives here.',
    subObjects: [
      {
        id: 'meditation-cushion',
        name: 'Meditation cushion',
        description: 'A worn blue cushion at the center of the floor.',
        affordances: [
          { id: 'meditate', name: 'Meditate', emoji: '🧘', defaultDurationMs: 180000 },
        ],
      },
      {
        id: 'herb-rack',
        name: 'Herb rack',
        description: 'A drying rack hung with bundles of fresh-cut herbs.',
        affordances: [
          { id: 'sort-herbs', name: 'Sort herbs', emoji: '🌿', defaultDurationMs: 90000 },
        ],
        subObjects: [
          {
            id: 'lavender-bundle',
            name: 'Lavender bundle',
            description: 'A small bundle of dried lavender.',
            affordances: [],
            portable: {
              itemId: 'lavender-bundle',
              name: 'Lavender bundle',
              description: 'A small bundle of dried lavender.',
              emoji: '💜',
              tags: ['herb', 'curio'],
              sellPrice: 5,
            },
          },
          {
            id: 'valerian-root',
            name: 'Valerian root',
            description: 'A knot of dried valerian root.',
            affordances: [],
            portable: {
              itemId: 'valerian-root',
              name: 'Valerian root',
              description: 'A knot of dried valerian root.',
              emoji: '🪴',
              tags: ['herb', 'curio'],
              sellPrice: 6,
            },
          },
          {
            id: 'chamomile',
            name: 'Chamomile',
            description: 'A small jar of chamomile flowers.',
            affordances: [],
            portable: {
              itemId: 'chamomile',
              name: 'Chamomile',
              description: 'A small jar of chamomile flowers.',
              emoji: '🌼',
              tags: ['herb', 'curio'],
              sellPrice: 4,
            },
          },
        ],
      },
      {
        id: 'tea-kettle',
        name: 'Tea kettle',
        description: 'A copper kettle that whistles softly when ready.',
        affordances: [
          { id: 'brew-tea', name: 'Brew tea', emoji: '🍵', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'bookshelf',
        name: 'Bookshelf',
        description: 'A small bookshelf of meditation and herbalism texts.',
        affordances: [
          { id: 'read-manual', name: 'Read meditation manual', emoji: '📖', defaultDurationMs: 120000 },
        ],
        subObjects: [
          {
            id: 'meditation-manual',
            name: 'Meditation manual',
            description: 'A weathered manual of mountain meditation practices.',
            affordances: [],
            portable: {
              itemId: 'meditation-manual',
              name: 'Meditation manual',
              description: 'A weathered manual of mountain meditation practices.',
              emoji: '📖',
              tags: ['book', 'curio'],
              sellPrice: 5,
            },
          },
        ],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
    ],
  },
];

export function poiCenter(p: Poi) {
  return {
    x: Math.floor(p.bbox.x + p.bbox.w / 2),
    y: Math.floor(p.bbox.y + p.bbox.h / 2),
  };
}
