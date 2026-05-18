import { Id } from '../../convex/_generated/dataModel';
import { Game } from '../../convex/aiTown/game';
import type { Poi } from '../../convex/aiTown/worldMap';
import {
  buildInspectorContext,
  currentPoiForPosition,
  flattenPoiAffordances,
} from './inspectorContext';

function openLayer(width: number, height: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
}

function makeServerGame({
  width = 20,
  height = 20,
  players = [],
  conversations = [],
  agents = [{ id: 'a:1', playerId: 'p:1' }],
  pois = [cafePoi()],
  groundItems = [],
  takenPoiItemRefs = [],
}: {
  width?: number;
  height?: number;
  players?: any[];
  conversations?: any[];
  agents?: any[];
  pois?: Poi[];
  groundItems?: any[];
  takenPoiItemRefs?: string[];
} = {}) {
  const game = new Game(
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
        players:
          players.length > 0
            ? players
            : [
                player('p:1', { x: 2, y: 2 }),
                player('p:2', { x: 9, y: 9 }),
                player('p:3', { x: 18, y: 18 }),
              ],
        conversations,
        agents,
        groundItems,
        takenPoiItemRefs,
      },
      playerDescriptions: [
        { playerId: 'p:1', name: 'Lucky', character: 'f1', description: 'Curious NPC' },
        { playerId: 'p:2', name: 'Alice', character: 'f2', description: 'Neighbor' },
        { playerId: 'p:3', name: 'Bob', character: 'f3', description: 'Distant neighbor' },
      ],
      agentDescriptions: [
        {
          agentId: 'a:1',
          identity: 'Lucky likes coffee.',
          plan: 'Find useful things.',
          homeName: 'cafe',
          profession: 'barista',
          family: [{ kind: 'sibling' as const, name: 'Alice' }],
          friends: ['Bob'],
          schedule: [{ block: 'morning' as const, activity: 'Make coffee', poi: 'cafe' }],
        },
      ],
      worldMap: {
        width,
        height,
        tileSetUrl: '',
        tileSetDimX: 0,
        tileSetDimY: 0,
        tileDim: 32,
        bgTiles: [],
        objectTiles: [openLayer(width, height)],
        animatedSprites: [],
        pois,
      },
    },
  );
  return {
    world: game.world,
    playerDescriptions: game.playerDescriptions,
    agentDescriptions: game.agentDescriptions,
    worldMap: game.worldMap,
  };
}

function player(id: string, position: { x: number; y: number }, extra: Record<string, unknown> = {}) {
  return {
    id,
    lastInput: 0,
    position,
    facing: { dx: 0, dy: 1 },
    speed: 0,
    ...extra,
  };
}

function cafePoi(): Poi {
  return {
    id: 'cafe',
    name: 'Cafe',
    kind: 'shop',
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    description: 'A warm cafe.',
    subObjects: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        affordances: [{ id: 'cook', name: 'Cook' }],
        subObjects: [
          {
            id: 'stove',
            name: 'Stove',
            affordances: [{ id: 'heat-pan', name: 'Heat pan' }],
            subObjects: [
              {
                id: 'burner',
                name: 'Burner',
                affordances: [{ id: 'ignite', name: 'Ignite' }],
              },
            ],
          },
        ],
      },
      {
        id: 'bookshelf',
        name: 'Bookshelf',
        affordances: [{ id: 'read', name: 'Read' }],
        subObjects: [
          {
            id: 'field-notes',
            name: 'Field notes',
            affordances: [],
            portable: {
              itemId: 'field-notes',
              name: 'Field notes',
              tags: ['book', 'curio'],
              sellPrice: 5,
            },
          },
        ],
      },
      {
        id: 'counter',
        name: 'Counter',
        affordances: [],
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
          sellTags: ['food', 'drink', 'book', 'curio'],
        },
      },
    ],
  };
}

describe('inspector context helpers', () => {
  test('finds current POI and flattens recursive affordance refs', () => {
    const poi = cafePoi();

    expect(currentPoiForPosition([poi], { x: 2, y: 2 })?.name).toBe('Cafe');
    expect(flattenPoiAffordances(poi)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cafe/kitchen#cook',
          objectRef: 'cafe/kitchen',
          objectName: 'Kitchen',
          affordanceId: 'cook',
        }),
        expect.objectContaining({
          id: 'cafe/kitchen/stove/burner#ignite',
          objectRef: 'cafe/kitchen/stove/burner',
          objectPath: ['kitchen', 'stove', 'burner'],
          objectName: 'Burner',
          affordanceName: 'Ignite',
        }),
      ]),
    );
  });

  test('returns current POI objects and no invented objects when outside POIs', () => {
    const game = makeServerGame({
      players: [player('p:1', { x: 15, y: 15 })],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 0);

    expect(context?.currentPoi).toBeNull();
    expect(context?.surroundings.nearbyAffordances).toEqual([]);
  });

  test('includes nearby players by same POI or distance', () => {
    const game = makeServerGame({
      players: [
        player('p:1', { x: 1, y: 1 }),
        player('p:2', { x: 9, y: 9 }),
        player('p:3', { x: 18, y: 18 }),
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 0);

    expect(context?.surroundings.nearbyPlayers.map((p) => p.name)).toEqual(['Alice']);
  });

  test('includes inventory, nearby items, and commerce state', () => {
    const game = makeServerGame({
      players: [
        player('p:1', { x: 1, y: 1 }, {
          coins: 12,
          inventory: [{ itemId: 'old-map', name: 'Old map', tags: ['curio'], sellPrice: 3 }],
        }),
      ],
      groundItems: [
        {
          id: 'g:1',
          item: { itemId: 'loose-cookie', name: 'Loose cookie', tags: ['food'], sellPrice: 2 },
          position: { x: 1, y: 2 },
          droppedAt: 100,
        },
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 1000);

    expect(context?.coins).toBe(12);
    expect(context?.inventory[0]).toMatchObject({ itemId: 'old-map' });
    expect(context?.surroundings.portableObjects).toEqual([
      expect.objectContaining({
        objectRef: 'cafe/bookshelf/field-notes',
        item: expect.objectContaining({ name: 'Field notes' }),
      }),
    ]);
    expect(context?.surroundings.nearbyGroundItems).toEqual([
      expect.objectContaining({
        id: 'g:1',
        item: expect.objectContaining({ name: 'Loose cookie' }),
      }),
    ]);
    expect(context?.surroundings.commerceOptions).toEqual([
      expect.objectContaining({
        objectRef: 'cafe/counter',
        buy: [expect.objectContaining({ itemId: 'coffee-cup' })],
        sellTags: expect.arrayContaining(['curio']),
      }),
    ]);
  });

  test('includes active object users in the same POI', () => {
    const game = makeServerGame({
      players: [
        player('p:1', { x: 1, y: 1 }),
        player('p:2', { x: 9, y: 9 }, {
          objectUse: {
            objectRef: 'cafe/kitchen/stove/burner',
            objectName: 'Burner',
            affordanceId: 'ignite',
            affordanceName: 'Ignite',
            description: 'Igniting the burner',
            until: 5000,
          },
        }),
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 1000);

    expect(context?.surroundings.objectUsers).toEqual([
      expect.objectContaining({
        playerId: 'p:2',
        playerName: 'Alice',
        objectRef: 'cafe/kitchen/stove/burner',
        objectName: 'Burner',
        affordanceId: 'ignite',
        affordanceName: 'Ignite',
      }),
    ]);
  });

  test('excludes expired object users', () => {
    const game = makeServerGame({
      players: [
        player('p:1', { x: 1, y: 1 }),
        player('p:2', { x: 2, y: 2 }, {
          objectUse: {
            objectRef: 'cafe/kitchen/stove/burner',
            objectName: 'Burner',
            affordanceId: 'ignite',
            affordanceName: 'Ignite',
            description: 'Igniting the burner',
            until: 500,
          },
        }),
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 1000);

    expect(context?.surroundings.objectUsers).toEqual([]);
  });

  test('includes schedule and active player state', () => {
    const game = makeServerGame({
      players: [
        player('p:1', { x: 2, y: 2 }, {
          activity: { description: 'Sweeping', until: 5000 },
          objectUse: {
            objectRef: 'cafe/kitchen/stove/burner',
            objectName: 'Burner',
            affordanceId: 'ignite',
            affordanceName: 'Ignite',
            description: 'Igniting the burner',
            until: 5000,
          },
          pathfinding: {
            destination: { x: 4, y: 4 },
            started: 0,
            state: { kind: 'needsPath' },
          },
        }),
        player('p:2', { x: 3, y: 2 }),
      ],
      conversations: [
        {
          id: 'c:1',
          creator: 'p:1',
          created: 0,
          numMessages: 2,
          lastMessage: { author: 'p:2', timestamp: 900 },
          participants: [
            { playerId: 'p:1', invited: 0, status: { kind: 'participating', started: 100 } },
            { playerId: 'p:2', invited: 0, status: { kind: 'participating', started: 100 } },
          ],
        },
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 1000);

    expect(context?.schedule).toEqual({
      currentBlock: 'morning',
      scheduledActivity: 'Make coffee',
      scheduledPoi: { id: 'cafe', name: 'Cafe' },
      atScheduledPoi: true,
    });
    expect(context?.currentGoal).toMatchObject({
      kind: 'followSchedule',
      source: 'schedule',
      target: { poiId: 'cafe', activityDescription: 'Make coffee' },
    });
    expect(context?.goalStatus.movementReason).toBe('Follow schedule: Make coffee at Cafe');
    expect(context?.state.activity?.description).toBe('Sweeping');
    expect(context?.state.objectUse?.objectName).toBe('Burner');
    expect(context?.state.pathfinding?.destination).toEqual({ x: 4, y: 4 });
    expect(context?.state.conversation?.participants.map((p) => p.status)).toEqual([
      'participating',
      'participating',
    ]);
  });

  test('includes explicit intent and schedule conflict status', () => {
    const game = makeServerGame({
      agents: [
        {
          id: 'a:1',
          playerId: 'p:1',
          intent: {
            kind: 'stayAtPoi',
            description: 'Stay away from the cafe crowd',
            rationale: 'A recent conversation made quiet time important.',
            source: 'reflection',
            created: 0,
            expiresAt: 5000,
            priority: 8,
            target: { poiId: 'home' },
          },
        },
      ],
      pois: [
        cafePoi(),
        {
          id: 'home',
          name: 'Home',
          kind: 'home',
          bbox: { x: 12, y: 12, w: 3, h: 3 },
          description: 'A quiet home.',
          subObjects: [],
        },
      ],
    });

    const context = buildInspectorContext(game, 'p:1' as any, 1000);

    expect(context?.explicitIntent?.kind).toBe('stayAtPoi');
    expect(context?.currentGoal.description).toBe('Stay away from the cafe crowd');
    expect(context?.goalStatus.hasExplicitIntent).toBe(true);
    expect(context?.goalStatus.scheduleConflict).toBe(true);
  });
});
