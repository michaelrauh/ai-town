import { Id } from '../_generated/dataModel';
import { Player } from './player';
import { AgentDescription } from './agentDescription';
import { currentGoalForAgent } from './agent';
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

function makeIdleAgentGame(player: any = {}, agent: any = {}, agentDescription: any = {}) {
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
        agents: [{ id: 'a:1', playerId: 'p:1', ...agent }],
      },
      playerDescriptions: [{ playerId: 'p:1', name: 'NPC', character: 'f1', description: 'NPC' }],
      agentDescriptions: [
        { agentId: 'a:1', identity: 'Helpful', plan: 'Do things', ...agentDescription },
      ],
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

describe('Agent explicit goals', () => {
  test('legacy agents expose a derived schedule goal', () => {
    const game = makeIdleAgentGame(
      {},
      {},
      { schedule: [{ block: 'morning', activity: 'Make coffee', poi: 'coffee-shop' }] },
    );
    const agent = game.world.agents.get('a:1' as any)!;

    const goal = currentGoalForAgent(game, agent, 0);

    expect(goal).toMatchObject({
      kind: 'followSchedule',
      source: 'schedule',
      description: 'Follow schedule: Make coffee at Coffee Shop',
      target: { poiId: 'coffee-shop', activityDescription: 'Make coffee' },
    });
  });

  test('explicit activity goals override schedule travel', () => {
    const game = makeIdleAgentGame(
      { position: { x: 0, y: 0 } },
      {
        intent: {
          kind: 'activity',
          description: 'Stay home and rest',
          rationale: 'A conversation made rest more important than the schedule.',
          source: 'reflection',
          created: 0,
          expiresAt: 60_000,
          priority: 8,
          target: { activityDescription: 'Resting at home' },
        },
      },
      { schedule: [{ block: 'morning', activity: 'Make coffee', poi: 'coffee-shop' }] },
    );
    const agent = game.world.agents.get('a:1' as any)!;
    const player = game.world.players.get('p:1' as any)!;

    agent.tick(game, 0);

    expect(player.activity?.description).toBe('Resting at home');
    expect(player.pathfinding).toBeUndefined();
    expect(agent.intent).toBeUndefined();
  });

  test('expired goals clear and fall back to schedule travel', () => {
    const game = makeIdleAgentGame(
      { position: { x: 0, y: 0 } },
      {
        intent: {
          kind: 'activity',
          description: 'Expired rest',
          rationale: 'Old conversation follow-up.',
          source: 'reflection',
          created: 0,
          expiresAt: 1,
          priority: 8,
          target: { activityDescription: 'Rest' },
        },
      },
      { schedule: [{ block: 'morning', activity: 'Make coffee', poi: 'coffee-shop' }] },
    );
    const agent = game.world.agents.get('a:1' as any)!;
    const player = game.world.players.get('p:1' as any)!;

    agent.tick(game, 3000);

    expect(agent.intent).toBeUndefined();
    expect(player.pathfinding?.destination).toEqual({ x: 2, y: 2 });
  });

  test('talkToPlayer goals start a conversation invite', () => {
    const game = makeIdleAgentGame(
      {},
      {
        intent: {
          kind: 'talkToPlayer',
          description: 'Tell Alice that Me is sick',
          rationale: 'Alice should know about the illness.',
          source: 'reflection',
          created: 0,
          expiresAt: 60_000,
          priority: 7,
          target: { playerId: 'p:2' },
        },
      },
    );
    game.world.players.set(
      'p:2' as any,
      new Player({
        id: 'p:2',
        lastInput: 0,
        position: { x: 3, y: 2 },
        facing: { dx: -1, dy: 0 },
        speed: 0,
      }),
    );
    const agent = game.world.agents.get('a:1' as any)!;

    agent.tick(game, 3000);

    expect(game.world.conversations.size).toBe(1);
    expect(agent.intent).toBeUndefined();
  });

  test('stayAtPoi goals prevent deterministic schedule travel while active', () => {
    const game = makeIdleAgentGame(
      { position: { x: 0, y: 0 } },
      {
        intent: {
          kind: 'stayAtPoi',
          description: 'Stay at the park to avoid Me',
          rationale: 'The last conversation made distance important.',
          source: 'reflection',
          created: 0,
          expiresAt: 60_000,
          priority: 9,
          target: { poiId: 'park' },
        },
      },
      { schedule: [{ block: 'morning', activity: 'Make coffee', poi: 'coffee-shop' }] },
    );
    game.worldMap.pois.push({
      id: 'park',
      name: 'Park',
      kind: 'park',
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      description: 'A quiet park.',
      subObjects: [],
    });
    const agent = game.world.agents.get('a:1' as any)!;
    const player = game.world.players.get('p:1' as any)!;

    agent.tick(game, 3000);

    expect(player.activity?.description).toBe('Stay at the park to avoid Me');
    expect(player.pathfinding).toBeUndefined();
    expect(agent.intent?.kind).toBe('stayAtPoi');
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
