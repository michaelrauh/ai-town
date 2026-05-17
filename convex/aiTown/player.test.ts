import { Id } from '../_generated/dataModel';
import { queryPath } from '../util/types';
import { Game } from './game';
import { findRoute, movementSpeedForPlayer } from './movement';
import { playerInputs } from './player';

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
}: {
  playerPosition?: { x: number; y: number };
  npcPosition?: { x: number; y: number };
  width?: number;
  height?: number;
  blockedTiles?: Array<{ x: number; y: number }>;
  pathfinding?: any;
  participating?: boolean;
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
    },
    {
      id: 'p:2',
      lastInput: 0,
      position: npcPosition,
      facing: { dx: -1, dy: 0 },
      speed: 0,
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
      },
    },
  );
}

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
