import { Id } from '../_generated/dataModel';
import { AgentDescription } from './agentDescription';
import { Game } from './game';

function openLayer(width: number, height: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => -1));
}

function makeConversationGame(numMessages: number) {
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
        players: [
          {
            id: 'p:1',
            human: 'Me',
            lastInput: 0,
            position: { x: 1, y: 1 },
            facing: { dx: 0, dy: 1 },
            speed: 0,
          },
          {
            id: 'p:2',
            lastInput: 0,
            position: { x: 2, y: 1 },
            facing: { dx: -1, dy: 0 },
            speed: 0,
          },
        ],
        conversations: [
          {
            id: 'c:1',
            creator: 'p:1',
            created: 0,
            lastMessage: { author: 'p:2', timestamp: 0 },
            numMessages,
            participants: [
              {
                playerId: 'p:1',
                invited: 0,
                status: { kind: 'participating' as const, started: 0 },
              },
              {
                playerId: 'p:2',
                invited: 0,
                status: { kind: 'participating' as const, started: 0 },
              },
            ],
          },
        ],
        agents: [{ id: 'a:1', playerId: 'p:1' }],
      },
      playerDescriptions: [
        { playerId: 'p:1', name: 'Me', character: 'f5', description: 'Local player' },
        { playerId: 'p:2', name: 'NPC', character: 'f1', description: 'NPC' },
      ],
      agentDescriptions: [{ agentId: 'a:1', identity: 'Helpful', plan: 'Talk' }],
      worldMap: {
        width: 4,
        height: 4,
        tileSetUrl: '',
        tileSetDimX: 0,
        tileSetDimY: 0,
        tileDim: 32,
        bgTiles: [],
        objectTiles: [openLayer(4, 4)],
        animatedSprites: [],
      },
    },
  );
}

function makeIdleAgentGame(player: any = {}) {
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
        players: [
          {
            id: 'p:1',
            lastInput: 0,
            position: { x: 2, y: 2 },
            facing: { dx: 0, dy: 1 },
            speed: 0,
            ...player,
          },
        ],
        conversations: [],
        agents: [{ id: 'a:1', playerId: 'p:1' }],
      },
      playerDescriptions: [{ playerId: 'p:1', name: 'NPC', character: 'f1', description: 'NPC' }],
      agentDescriptions: [{ agentId: 'a:1', identity: 'Helpful', plan: 'Do things' }],
      worldMap: {
        width: 5,
        height: 5,
        tileSetUrl: '',
        tileSetDimX: 0,
        tileSetDimY: 0,
        tileDim: 32,
        bgTiles: [],
        objectTiles: [openLayer(5, 5)],
        animatedSprites: [],
        pois: [
          {
            id: 'coffee-shop',
            name: 'Coffee Shop',
            kind: 'shop',
            bbox: { x: 1, y: 1, w: 3, h: 3 },
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
      },
    },
  );
}

describe('Agent conversation message limit', () => {
  test('continues past the old 8-message limit', () => {
    const game = makeConversationGame(9);
    const agent = game.world.agents.get('a:1' as any)!;

    agent.tick(game, 3000);

    expect(game.pendingOperations).toHaveLength(1);
    expect(game.pendingOperations[0].name).toBe('agentGenerateMessage');
    expect(game.pendingOperations[0].args.type).toBe('continue');
  });

  test('leaves conversations above the new 20-message limit', () => {
    const game = makeConversationGame(21);
    const agent = game.world.agents.get('a:1' as any)!;

    agent.tick(game, 3000);

    expect(game.pendingOperations).toHaveLength(1);
    expect(game.pendingOperations[0].name).toBe('agentGenerateMessage');
    expect(game.pendingOperations[0].args.type).toBe('leave');
  });
});

describe('Agent object affordances', () => {
  test('includes nearby affordances in do-something operations', () => {
    const game = makeIdleAgentGame();
    const agent = game.world.agents.get('a:1' as any)!;

    agent.tick(game, 3000);

    expect(game.pendingOperations).toHaveLength(1);
    expect(game.pendingOperations[0].name).toBe('agentDoSomething');
    expect(game.pendingOperations[0].args.nearbyAffordances).toEqual([
      expect.objectContaining({
        objectRef: 'coffee-shop/counter',
        objectName: 'Counter',
        affordanceId: 'make-coffee',
        affordanceName: 'Make coffee',
      }),
    ]);
  });

  test('does not start a new operation while using an object', () => {
    const game = makeIdleAgentGame({
      objectUse: {
        objectRef: 'coffee-shop/counter',
        objectName: 'Counter',
        affordanceId: 'make-coffee',
        affordanceName: 'Make coffee',
        description: 'Make coffee',
        until: 10_000,
      },
    });
    const agent = game.world.agents.get('a:1' as any)!;

    agent.tick(game, 3000);

    expect(game.pendingOperations).toHaveLength(0);
  });
});

describe('AgentDescription', () => {
  test('serializes family relationships', () => {
    const description = new AgentDescription({
      agentId: 'a:1',
      identity: 'Lucky is curious.',
      plan: 'Listen and answer.',
      family: [
        { kind: 'sibling', name: 'Alice' },
        { kind: 'parent', name: 'Bob' },
      ],
      friends: ['Alice'],
      homeName: 'lucky-cottage',
      profession: 'space traveler',
      schedule: [],
    });

    expect(description.serialize().family).toEqual([
      { kind: 'sibling', name: 'Alice' },
      { kind: 'parent', name: 'Bob' },
    ]);
  });
});
