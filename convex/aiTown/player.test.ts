import { Id } from '../_generated/dataModel';
import { queryPath } from '../util/types';
import { Game } from './game';
import { findRoute, movementSpeedForPlayer } from './movement';
import { Player, playerInputs } from './player';
import { STARTING_COINS } from './inventory';
import type { Poi } from './worldMap';

function openLayer(width: number, height: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
}

function makeGame({
  playerPosition = { x: 1, y: 1 },
  npcPosition = { x: 2, y: 2 },
  width = 3,
  height = 3,
  blockedTiles = [],
  pathfinding = undefined,
  participating = false,
  pois = [],
  playerExtra = {},
  npcExtra = {},
  groundItems = [],
  takenPoiItemRefs = [],
}: {
  playerPosition?: { x: number; y: number };
  npcPosition?: { x: number; y: number };
  width?: number;
  height?: number;
  blockedTiles?: Array<{ x: number; y: number }>;
  pathfinding?: any;
  participating?: boolean;
  pois?: Poi[];
  playerExtra?: Record<string, unknown>;
  npcExtra?: Record<string, unknown>;
  groundItems?: any[];
  takenPoiItemRefs?: string[];
} = {}) {
  const layer = openLayer(width, height);
  for (const tile of blockedTiles) {
    layer[tile.x][tile.y] = 0;
  }
  const players = [
    {
      id: 'p:1',
      human: 'Me',
      pathfinding,
      lastInput: 0,
      position: playerPosition,
      facing: { dx: 0, dy: 1 },
      speed: 0,
      ...playerExtra,
    },
    {
      id: 'p:2',
      lastInput: 0,
      position: npcPosition,
      facing: { dx: -1, dy: 0 },
      speed: 0,
      ...npcExtra,
    },
  ];
  const conversations = participating
    ? [
        {
          id: 'c:1',
          creator: 'p:1',
          created: 0,
          numMessages: 0,
          participants: [
            { playerId: 'p:1', invited: 0, status: { kind: 'participating' as const, started: 0 } },
            { playerId: 'p:2', invited: 0, status: { kind: 'participating' as const, started: 0 } },
          ],
        },
      ]
    : [];
  return new Game(
    {
      _id: 'engine' as Id<'engines'>,
      _creationTime: 0,
      currentTime: 0,
      generationNumber: 0,
      running: true,
    },
    'world' as Id<'worlds'>,
    {
      world: {
        nextId: 10,
        players,
        conversations,
        agents: [],
        groundItems,
        takenPoiItemRefs,
      },
      playerDescriptions: [
        { playerId: 'p:1', name: 'Me', character: 'f5', description: 'Local player' },
        { playerId: 'p:2', name: 'NPC', character: 'f1', description: 'NPC' },
      ],
      agentDescriptions: [],
      worldMap: {
        width,
        height,
        tileSetUrl: '',
        tileSetDimX: 0,
        tileSetDimY: 0,
        tileDim: 32,
        bgTiles: [],
        objectTiles: [layer],
        animatedSprites: [],
        pois,
      },
    },
  );
}

function testItem(itemId: string, name = itemId) {
  return {
    itemId,
    name,
    tags: ['food'],
    sellPrice: 2,
  };
}

function portableShopPoi(): Poi {
  return {
    id: 'coffee-shop',
    name: 'Coffee Shop',
    kind: 'shop',
    bbox: { x: 2, y: 2, w: 5, h: 5 },
    description: 'A coffee shop.',
    subObjects: [
      {
        id: 'counter',
        name: 'Counter',
        affordances: [{ id: 'order', name: 'Order coffee' }],
        commerce: {
          buy: [
            {
              itemId: 'coffee-cup',
              name: 'Coffee cup',
              tags: ['food', 'drink'],
              price: 4,
              sellPrice: 1,
            },
          ],
          sellTags: ['food', 'drink'],
        },
        subObjects: [
          {
            id: 'pastry-case',
            name: 'Pastry case',
            affordances: [],
            subObjects: [
              {
                id: 'cookie',
                name: 'Cookie',
                affordances: [],
                portable: {
                  itemId: 'cookie',
                  name: 'Cookie',
                  tags: ['food'],
                  sellPrice: 2,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Player.join home spawn', () => {
  test('places a new player at the center of a known home POI', () => {
    const game = makeGame({
      width: 10,
      height: 10,
      playerPosition: { x: 0, y: 0 },
      npcPosition: { x: 9, y: 9 },
      pois: [
        {
          id: 'home',
          name: 'Home',
          kind: 'home',
          bbox: { x: 4, y: 4, w: 4, h: 4 },
          description: 'A home.',
        },
      ],
    });

    const playerId = Player.join(game, 100, 'New NPC', 'f1', 'A new NPC.', undefined, 'home');

    expect(game.world.players.get(playerId)?.position).toEqual({ x: 6, y: 6 });
  });

  test('falls back to random placement when the home is missing', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    const game = makeGame({
      width: 5,
      height: 5,
      playerPosition: { x: 2, y: 2 },
      npcPosition: { x: 3, y: 3 },
    });

    try {
      const playerId = Player.join(game, 100, 'New NPC', 'f1', 'A new NPC.', undefined, 'missing');

      expect(game.world.players.get(playerId)?.position).toEqual({ x: 0, y: 0 });
    } finally {
      Math.random = originalRandom;
    }
  });

  test('falls back to random placement when the home center is blocked', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    const game = makeGame({
      width: 5,
      height: 5,
      playerPosition: { x: 1, y: 1 },
      npcPosition: { x: 3, y: 3 },
      pois: [
        {
          id: 'home',
          name: 'Home',
          kind: 'home',
          bbox: { x: 0, y: 0, w: 3, h: 3 },
          description: 'A blocked home.',
        },
      ],
    });

    try {
      const playerId = Player.join(game, 100, 'New NPC', 'f1', 'A new NPC.', undefined, 'home');

      expect(game.world.players.get(playerId)?.position).toEqual({ x: 0, y: 0 });
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('player inventory and commerce', () => {
  test('normalizes legacy players to coins and three empty slots', () => {
    const game = makeGame();
    const player = game.world.players.get('p:1' as any)!;

    expect(player.coins).toBe(STARTING_COINS);
    expect(player.inventory).toEqual([null, null, null]);
    expect(player.serialize()).toMatchObject({
      coins: STARTING_COINS,
      inventory: [null, null, null],
    });
  });

  test('picks up a tagged POI object and marks it taken', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
    });

    const result = playerInputs.pickUpItem.handler(game, 100, {
      playerId: 'p:1',
      source: { kind: 'poiObject', objectRef: 'coffee-shop/counter/pastry-case/cookie' },
    });

    expect(result.slotIndex).toBe(0);
    expect(game.world.players.get('p:1' as any)?.inventory[0]).toMatchObject({
      itemId: 'cookie',
      name: 'Cookie',
      tags: ['food'],
      sellPrice: 2,
      sourceObjectRef: 'coffee-shop/counter/pastry-case/cookie',
    });
    expect(game.world.takenPoiItemRefs.has('coffee-shop/counter/pastry-case/cookie')).toBe(true);
  });

  test('rejects untagged, taken, out-of-POI, and full-inventory pickups', () => {
    const fullInventory = [testItem('a'), testItem('b'), testItem('c')];
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
      playerExtra: { inventory: fullInventory },
      takenPoiItemRefs: ['coffee-shop/counter/pastry-case/cookie'],
    });

    expect(() =>
      playerInputs.pickUpItem.handler(game, 100, {
        playerId: 'p:1',
        source: { kind: 'poiObject', objectRef: 'coffee-shop/counter' },
      }),
    ).toThrowError('coffee-shop/counter is not a portable object');
    expect(() =>
      playerInputs.pickUpItem.handler(game, 100, {
        playerId: 'p:1',
        source: { kind: 'poiObject', objectRef: 'coffee-shop/counter/pastry-case/cookie' },
      }),
    ).toThrowError('has already been picked up');

    game.world.takenPoiItemRefs.clear();
    expect(() =>
      playerInputs.pickUpItem.handler(game, 100, {
        playerId: 'p:1',
        source: { kind: 'poiObject', objectRef: 'coffee-shop/counter/pastry-case/cookie' },
      }),
    ).toThrowError('Inventory is full');

    const outside = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 0, y: 0 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
    });
    expect(() =>
      playerInputs.pickUpItem.handler(outside, 100, {
        playerId: 'p:1',
        source: { kind: 'poiObject', objectRef: 'coffee-shop/counter/pastry-case/cookie' },
      }),
    ).toThrowError('Player p:1 is not near Coffee Shop');
  });

  test('drops an inventory item and lets another character pick it up', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 3, y: 4 },
      playerExtra: { inventory: [testItem('cookie', 'Cookie'), null, null] },
    });

    const dropped = playerInputs.putDownItem.handler(game, 100, {
      playerId: 'p:1',
      slotIndex: 0,
    });

    expect(dropped).toMatchObject({
      id: 'g:10',
      position: { x: 3, y: 3 },
      item: { itemId: 'cookie', name: 'Cookie' },
    });
    expect(game.world.players.get('p:1' as any)?.inventory[0]).toBeNull();

    playerInputs.pickUpItem.handler(game, 200, {
      playerId: 'p:2',
      source: { kind: 'groundItem', groundItemId: dropped.id },
    });

    expect(game.world.groundItems.size).toBe(0);
    expect(game.world.players.get('p:2' as any)?.inventory[0]).toMatchObject({
      itemId: 'cookie',
      name: 'Cookie',
    });
  });

  test('buys only at shop-counter commerce with coins and open slots', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
      playerExtra: { coins: 5 },
    });

    const result = playerInputs.buyItem.handler(game, 100, {
      playerId: 'p:1',
      objectRef: 'coffee-shop/counter',
      itemId: 'coffee-cup',
    });

    expect(result.coins).toBe(1);
    expect(game.world.players.get('p:1' as any)?.inventory[0]).toMatchObject({
      itemId: 'coffee-cup',
      name: 'Coffee cup',
    });

    const broke = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
      playerExtra: { coins: 3 },
    });
    expect(() =>
      playerInputs.buyItem.handler(broke, 100, {
        playerId: 'p:1',
        objectRef: 'coffee-shop/counter',
        itemId: 'coffee-cup',
      }),
    ).toThrowError('Not enough coins');
  });

  test('sells accepted tagged items and credits sell price', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [portableShopPoi()],
      playerExtra: { coins: 1, inventory: [testItem('cookie', 'Cookie'), null, null] },
    });

    const result = playerInputs.sellItem.handler(game, 100, {
      playerId: 'p:1',
      objectRef: 'coffee-shop/counter',
      slotIndex: 0,
    });

    expect(result.coins).toBe(3);
    expect(game.world.players.get('p:1' as any)?.inventory[0]).toBeNull();
  });
});

describe('playerInputs.stepPlayer', () => {
  test('moves exactly one tile in a valid direction', () => {
    const game = makeGame();

    const destination = playerInputs.stepPlayer.handler(game, 100, {
      playerId: 'p:1',
      direction: 'east',
    });

    expect(destination).toEqual({ x: 2, y: 1 });
    expect(game.world.players.get('p:1' as any)?.pathfinding?.destination).toEqual({
      x: 2,
      y: 1,
    });
  });

  test('rejects blocked destination tiles', () => {
    const game = makeGame({ blockedTiles: [{ x: 1, y: 0 }] });

    expect(() =>
      playerInputs.stepPlayer.handler(game, 100, { playerId: 'p:1', direction: 'north' }),
    ).toThrowError("Can't step north: world blocked");
  });

  test('rejects out-of-bounds movement', () => {
    const game = makeGame({ playerPosition: { x: 0, y: 1 } });

    expect(() =>
      playerInputs.stepPlayer.handler(game, 100, { playerId: 'p:1', direction: 'west' }),
    ).toThrowError("Can't step west: out of bounds");
  });

  test('rejects missing players', () => {
    const game = makeGame();

    expect(() =>
      playerInputs.stepPlayer.handler(game, 100, { playerId: 'p:404', direction: 'west' }),
    ).toThrowError('Invalid player ID p:404');
  });

  test('extends held movement from the current path destination', () => {
    const game = makeGame({
      width: 4,
      npcPosition: { x: 0, y: 2 },
      pathfinding: { destination: { x: 2, y: 1 }, started: 0, state: { kind: 'needsPath' } },
    });

    const destination = playerInputs.stepPlayer.handler(game, 100, {
      playerId: 'p:1',
      direction: 'east',
    });

    expect(destination).toEqual({ x: 3, y: 1 });
    expect(game.world.players.get('p:1' as any)?.pathfinding?.destination).toEqual({
      x: 3,
      y: 1,
    });
  });

  test('still rejects blocked destinations while extending held movement', () => {
    const game = makeGame({
      width: 4,
      npcPosition: { x: 0, y: 2 },
      blockedTiles: [{ x: 3, y: 1 }],
      pathfinding: { destination: { x: 2, y: 1 }, started: 0, state: { kind: 'needsPath' } },
    });

    expect(() =>
      playerInputs.stepPlayer.handler(game, 100, { playerId: 'p:1', direction: 'east' }),
    ).toThrowError("Can't step east: world blocked");
  });

  test('rejects participating conversation members', () => {
    const game = makeGame({ participating: true });

    expect(() =>
      playerInputs.stepPlayer.handler(game, 100, { playerId: 'p:1', direction: 'east' }),
    ).toThrowError("Can't move when in a conversation. Leave the conversation first!");
  });
});

describe('playerInputs.useObject', () => {
  test('starts object-use state for a nearby affordance', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 3, y: 3 },
      npcPosition: { x: 7, y: 7 },
      pois: [
        {
          id: 'coffee-shop',
          name: 'Coffee Shop',
          kind: 'shop',
          bbox: { x: 2, y: 2, w: 3, h: 3 },
          description: 'A coffee shop.',
          subObjects: [
            {
              id: 'counter',
              name: 'Counter',
              affordances: [
                {
                  id: 'make-coffee',
                  name: 'Make coffee',
                  emoji: '☕',
                  defaultDurationMs: 30_000,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = playerInputs.useObject.handler(game, 1000, {
      playerId: 'p:1',
      objectRef: 'coffee-shop/counter',
      affordanceId: 'make-coffee',
    });

    expect(result.description).toBe('Make coffee');
    expect(game.world.players.get('p:1' as any)?.objectUse).toMatchObject({
      objectRef: 'coffee-shop/counter',
      objectName: 'Counter',
      affordanceId: 'make-coffee',
      affordanceName: 'Make coffee',
      emoji: '☕',
      until: 31_000,
    });
  });

  test('rejects object use when the player is outside the POI', () => {
    const game = makeGame({
      width: 8,
      height: 8,
      playerPosition: { x: 0, y: 0 },
      npcPosition: { x: 7, y: 7 },
      pois: [
        {
          id: 'coffee-shop',
          name: 'Coffee Shop',
          kind: 'shop',
          bbox: { x: 2, y: 2, w: 3, h: 3 },
          description: 'A coffee shop.',
          subObjects: [
            {
              id: 'counter',
              name: 'Counter',
              affordances: [{ id: 'make-coffee', name: 'Make coffee' }],
            },
          ],
        },
      ],
    });

    expect(() =>
      playerInputs.useObject.handler(game, 1000, {
        playerId: 'p:1',
        objectRef: 'coffee-shop/counter',
        affordanceId: 'make-coffee',
      }),
    ).toThrowError('Player p:1 is not near Coffee Shop');
  });
});

describe('playerInputs.moveTo', () => {
  test('still supports click-to-move pathfinding', () => {
    const game = makeGame();

    playerInputs.moveTo.handler(game, 100, { playerId: 'p:1', destination: { x: 2, y: 1 } });

    expect(game.world.players.get('p:1' as any)?.pathfinding?.destination).toEqual({
      x: 2,
      y: 1,
    });
  });
});

describe('movement speed split', () => {
  test('routes human players faster than NPCs', () => {
    const game = makeGame();
    const human = game.world.players.get('p:1' as any)!;
    const npc = game.world.players.get('p:2' as any)!;

    const humanRoute = findRoute(game, 100, human, { x: 2, y: 1 });
    const npcRoute = findRoute(game, 100, npc, { x: 1, y: 2 });

    expect(movementSpeedForPlayer(human)).toBe(3.0);
    expect(movementSpeedForPlayer(npc)).toBe(0.75);
    expect(humanRoute && queryPath(humanRoute.path, humanRoute.path.length - 1).t).toBeCloseTo(
      100 + 1000 / 3,
    );
    expect(npcRoute && queryPath(npcRoute.path, npcRoute.path.length - 1).t).toBeCloseTo(
      100 + 1000 / 0.75,
    );
  });
});
