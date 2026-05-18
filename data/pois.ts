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
    id: 'lucky-cottage',
    name: "Lucky's Cottage",
    kind: 'home',
    bbox: { x: 4, y: 6, w: 6, h: 5 },
    description: 'A cluttered cottage smelling of aged cheese and old books. Lucky lives here.',
    subObjects: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        description: 'A tiny kitchen with coffee gear packed beside old field notes.',
        affordances: [
          { id: 'make-coffee', name: 'Make coffee', emoji: '☕', defaultDurationMs: 60000 },
        ],
        subObjects: [
          {
            id: 'stove',
            name: 'Stove',
            affordances: [],
            subObjects: [
              {
                id: 'burner',
                name: 'Burner',
                affordances: [
                  { id: 'brew-coffee', name: 'Brew coffee', emoji: '☕', defaultDurationMs: 90000 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'cheese-cellar',
        name: 'Cheese cellar',
        affordances: [
          { id: 'inspect-cheese', name: 'Inspect cheese', emoji: '🧀', defaultDurationMs: 90000 },
        ],
        subObjects: [
          {
            id: 'aged-cheese',
            name: 'Aged cheese',
            description: 'A small wrapped wedge of Lucky’s best aged cheese.',
            affordances: [],
            portable: {
              itemId: 'aged-cheese',
              name: 'Aged cheese',
              description: 'A small wrapped wedge of Lucky’s best aged cheese.',
              emoji: '🧀',
              tags: ['food', 'cheese'],
              sellPrice: 3,
            },
          },
        ],
      },
      {
        id: 'bookshelf',
        name: 'Bookshelf',
        affordances: [
          { id: 'read', name: 'Read science history', emoji: '📖', defaultDurationMs: 120000 },
        ],
        subObjects: [
          {
            id: 'field-notes',
            name: 'Field notes',
            description: 'A pocket-sized bundle of handwritten observations.',
            affordances: [],
            portable: {
              itemId: 'field-notes',
              name: 'Field notes',
              description: 'A pocket-sized bundle of handwritten observations.',
              emoji: '📓',
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
  {
    id: 'bob-hut',
    name: "Bob's Hut",
    kind: 'home',
    bbox: { x: 28, y: 4, w: 5, h: 4 },
    description: 'A small hut surrounded by a vegetable garden. Bob lives here.',
    subObjects: [
      {
        id: 'garden',
        name: 'Vegetable garden',
        affordances: [
          { id: 'tend', name: 'Tend vegetables', emoji: '🥕', defaultDurationMs: 120000 },
          { id: 'weed', name: 'Pull weeds', emoji: '🌱', defaultDurationMs: 90000 },
        ],
        subObjects: [
          {
            id: 'carrot-bunch',
            name: 'Carrot bunch',
            description: 'A tied bunch of fresh carrots from Bob’s garden.',
            affordances: [],
            portable: {
              itemId: 'carrot-bunch',
              name: 'Carrot bunch',
              description: 'A tied bunch of fresh carrots from Bob’s garden.',
              emoji: '🥕',
              tags: ['food', 'vegetable'],
              sellPrice: 2,
            },
          },
        ],
      },
      {
        id: 'table',
        name: 'Kitchen table',
        affordances: [{ id: 'eat', name: 'Eat lunch', emoji: '🍲', defaultDurationMs: 90000 }],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
    ],
  },
  {
    id: 'stella-loft',
    name: "Stella's Loft",
    kind: 'home',
    bbox: { x: 52, y: 6, w: 5, h: 5 },
    description: 'A second-floor loft over an empty storefront. Stella lives here.',
    subObjects: [
      {
        id: 'desk',
        name: 'Planning desk',
        affordances: [
          { id: 'plan', name: 'Plan the day', emoji: '📝', defaultDurationMs: 90000 },
          { id: 'count-money', name: 'Count earnings', emoji: '💰', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'lockbox',
        name: 'Lockbox',
        affordances: [
          { id: 'stash', name: 'Stash valuables', emoji: '🔒', defaultDurationMs: 60000 },
        ],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [
          { id: 'sleep', name: 'Sleep lightly', emoji: '💤', defaultDurationMs: 180000 },
        ],
      },
    ],
  },
  {
    id: 'coffee-shop',
    name: 'The Coffee Shop',
    kind: 'shop',
    bbox: { x: 10, y: 22, w: 8, h: 6 },
    description: "The town's only coffee shop. Where everyone ends up sooner or later.",
    subObjects: [
      {
        id: 'counter',
        name: 'Counter',
        affordances: [{ id: 'order', name: 'Order coffee', emoji: '☕', defaultDurationMs: 45000 }],
        commerce: {
          buy: [
            {
              itemId: 'coffee-cup',
              name: 'Coffee cup',
              description: 'A hot cup of coffee from the counter.',
              emoji: '☕',
              tags: ['food', 'drink'],
              price: 4,
              sellPrice: 1,
            },
            {
              itemId: 'pastry',
              name: 'Pastry',
              description: 'A flaky pastry from the display.',
              emoji: '🥐',
              tags: ['food'],
              price: 5,
              sellPrice: 2,
            },
          ],
          sellTags: ['food', 'drink', 'book', 'curio', 'cheese', 'vegetable'],
        },
        subObjects: [
          {
            id: 'espresso-machine',
            name: 'Espresso machine',
            affordances: [
              { id: 'make-coffee', name: 'Make coffee', emoji: '☕', defaultDurationMs: 75000 },
              { id: 'steam-milk', name: 'Steam milk', emoji: '🥛', defaultDurationMs: 45000 },
            ],
          },
        ],
      },
      {
        id: 'back-corner',
        name: 'Back corner table',
        affordances: [
          { id: 'sit', name: 'Sit in the back corner', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'nurse-drink', name: 'Nurse a drink', emoji: '🍺', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'front-table',
        name: 'Front table',
        affordances: [
          { id: 'sit', name: 'Sit at the table', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'tell-story', name: 'Tell stories', emoji: '💬', defaultDurationMs: 120000 },
        ],
      },
    ],
  },
  {
    id: 'town-square',
    name: 'Town Square',
    kind: 'park',
    bbox: { x: 28, y: 22, w: 12, h: 10 },
    description: 'An open paved square in the middle of town with a fountain.',
    subObjects: [
      {
        id: 'fountain',
        name: 'Fountain',
        affordances: [
          { id: 'watch-water', name: 'Watch the water', emoji: '⛲', defaultDurationMs: 90000 },
          { id: 'pace', name: 'Pace around the fountain', emoji: '🚶', defaultDurationMs: 90000 },
        ],
      },
      {
        id: 'bench',
        name: 'Bench',
        affordances: [
          { id: 'sit', name: 'Sit on the bench', emoji: '🪑', defaultDurationMs: 120000 },
          { id: 'people-watch', name: 'Watch the square', emoji: '👀', defaultDurationMs: 120000 },
        ],
      },
    ],
  },
  {
    id: 'pete-rectory',
    name: "Pete's Rectory",
    kind: 'home',
    bbox: { x: 50, y: 22, w: 5, h: 5 },
    description: 'A small wooden rectory beside the chapel. Pete lives here.',
    subObjects: [
      {
        id: 'writing-desk',
        name: 'Writing desk',
        affordances: [
          {
            id: 'prepare-sermon',
            name: 'Prepare a sermon',
            emoji: '✍️',
            defaultDurationMs: 120000,
          },
          { id: 'read-scripture', name: 'Read scripture', emoji: '📖', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'prayer-kneeler',
        name: 'Prayer kneeler',
        affordances: [{ id: 'pray', name: 'Pray', emoji: '🙏', defaultDurationMs: 90000 }],
      },
      {
        id: 'bed',
        name: 'Bed',
        affordances: [{ id: 'sleep', name: 'Sleep', emoji: '💤', defaultDurationMs: 180000 }],
      },
    ],
  },
  {
    id: 'alice-tower',
    name: "Alice's Tower",
    kind: 'home',
    bbox: { x: 10, y: 38, w: 5, h: 7 },
    description: 'A narrow tower stuffed with telescopes and chalkboards. Alice lives here.',
    subObjects: [
      {
        id: 'chalkboard',
        name: 'Chalkboard',
        affordances: [
          {
            id: 'derive-equations',
            name: 'Derive equations',
            emoji: '🧮',
            defaultDurationMs: 120000,
          },
        ],
      },
      {
        id: 'telescope',
        name: 'Telescope',
        affordances: [
          { id: 'observe-sky', name: 'Observe the sky', emoji: '🔭', defaultDurationMs: 120000 },
        ],
      },
      {
        id: 'lab-bench',
        name: 'Lab bench',
        affordances: [
          { id: 'experiment', name: 'Run an experiment', emoji: '⚗️', defaultDurationMs: 120000 },
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
