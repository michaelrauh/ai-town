import { Id } from '../../convex/_generated/dataModel';
import { Game } from '../../convex/aiTown/game';
import type { GameId } from '../../convex/aiTown/ids';
import type { Poi } from '../../convex/aiTown/worldMap';
import { buildInspectorContext } from './inspectorContext';
import {
  buildInspectorSearchRecords,
  searchInspectorRecords,
  type InspectorConversationMessageGroups,
  type InspectorMemoryGroups,
} from './inspectorSearch';

function openLayer(width: number, height: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
}

function makeServerGame() {
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
        players: [
          player('p:1', { x: 2, y: 2 }),
          player('p:2', { x: 3, y: 2 }, {
            objectUse: {
              objectRef: 'cafe/kitchen/burner',
              objectName: 'Burner',
              affordanceId: 'ignite',
              affordanceName: 'Ignite',
              description: 'Igniting the burner',
              until: 5000,
            },
          }),
        ],
        conversations: [
          {
            id: 'c:1',
            creator: 'p:1',
            created: 0,
            numMessages: 1,
            participants: [
              { playerId: 'p:1', invited: 0, status: { kind: 'participating', started: 0 } },
              { playerId: 'p:2', invited: 0, status: { kind: 'participating', started: 0 } },
            ],
          },
        ],
        agents: [{ id: 'a:1', playerId: 'p:1' }],
      },
      playerDescriptions: [
        { playerId: 'p:1', name: 'Lucky', character: 'f1', description: 'Curious NPC' },
        { playerId: 'p:2', name: 'Alice', character: 'f2', description: 'Neighbor' },
      ],
      agentDescriptions: [
        {
          agentId: 'a:1',
          identity: 'Lucky likes coffee.',
          plan: 'Find useful things.',
          homeName: 'cafe',
          profession: 'barista',
          schedule: [{ block: 'morning' as const, activity: 'Make coffee', poi: 'cafe' }],
        },
      ],
      worldMap: {
        width: 8,
        height: 8,
        tileSetUrl: '',
        tileSetDimX: 0,
        tileSetDimY: 0,
        tileDim: 32,
        bgTiles: [],
        objectTiles: [openLayer(8, 8)],
        animatedSprites: [],
        pois: [cafePoi()],
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
    bbox: { x: 0, y: 0, w: 6, h: 6 },
    description: 'A warm cafe with a quiet corner.',
    subObjects: [
      {
        id: 'kitchen',
        name: 'Kitchen',
        affordances: [],
        subObjects: [
          {
            id: 'burner',
            name: 'Burner',
            affordances: [{ id: 'ignite', name: 'Ignite' }],
          },
        ],
      },
    ],
  };
}

function makeRecords() {
  const game = makeServerGame();
  const contexts = [...game.world.players.values()]
    .map((item) => buildInspectorContext(game, item.id, 0))
    .filter((item): item is NonNullable<typeof item> => !!item);
  const memories: InspectorMemoryGroups = {
    players: [
      {
        playerId: 'p:1' as GameId<'players'>,
        name: 'Lucky',
        memories: [
          {
            id: 'memory:1',
            description: 'Lucky remembered the bookshelf near the cafe.',
            importance: 5,
            type: 'reflection',
            data: { type: 'reflection', relatedMemoryIds: [] },
            createdAt: 1,
            lastAccess: 2,
          },
        ],
      },
    ],
  };
  const conversationMessages: InspectorConversationMessageGroups = {
    conversations: [
      {
        conversationId: 'c:1' as GameId<'conversations'>,
        messages: [
          {
            id: 'message:1',
            createdAt: 10,
            author: 'p:2' as GameId<'players'>,
            authorName: 'Alice',
            text: 'The burner is lit.',
          },
        ],
      },
    ],
  };
  return buildInspectorSearchRecords({ game, contexts, memories, conversationMessages });
}

describe('inspector search', () => {
  test('finds character identity, schedule, object, POI, memory, and message matches', () => {
    const records = makeRecords();

    expect(searchInspectorRecords(records, 'coffee')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'Characters',
          targetTab: 'characters',
          playerId: 'p:1',
        }),
        expect.objectContaining({
          category: 'Schedules',
          targetTab: 'characters',
          playerId: 'p:1',
        }),
      ]),
    );
    expect(searchInspectorRecords(records, 'ignite')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Objects', targetTab: 'perception', playerId: 'p:1' }),
      ]),
    );
    expect(searchInspectorRecords(records, 'quiet corner')).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'Places', targetTab: 'world' })]),
    );
    expect(searchInspectorRecords(records, 'bookshelf')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Memories', targetTab: 'memories', playerId: 'p:1' }),
      ]),
    );
    expect(searchInspectorRecords(records, 'burner is lit')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Messages', targetTab: 'perception', playerId: 'p:2' }),
      ]),
    );
    expect(searchInspectorRecords(records, 'igniting the burner')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Object Use', targetTab: 'perception', playerId: 'p:1' }),
      ]),
    );
  });

  test('returns no results for an absent keyword', () => {
    expect(searchInspectorRecords(makeRecords(), 'not-present-anywhere')).toEqual([]);
  });
});
