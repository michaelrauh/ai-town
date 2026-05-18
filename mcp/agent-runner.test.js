import { describe, expect, test } from '@jest/globals';
import {
  buildAgentContext,
  dedupeMemories,
  handleDoSomething,
  handleReflect,
  handleGenerateMessage,
  nearbyAffordancesForPosition,
} from './agent-runner.mjs';

function textContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
  };
}

function makeSnapshot({ luckyPosition = { x: 5, y: 8 }, luckyAgent = {} } = {}) {
  return {
    engine: { currentTime: 60_000 },
    worldMap: {
      width: 64,
      height: 48,
      pois: [
        {
          id: 'lucky-cottage',
          name: "Lucky's Cottage",
          kind: 'home',
          bbox: { x: 4, y: 6, w: 6, h: 5 },
          description: 'A cottage full of old books and coffee gear.',
          subObjects: [
            {
              id: 'kitchen',
              name: 'Kitchen',
              affordances: [{ id: 'make-coffee', name: 'Make coffee', emoji: ':coffee:' }],
              subObjects: [
                {
                  id: 'stove',
                  name: 'Stove',
                  affordances: [],
                  subObjects: [
                    {
                      id: 'burner',
                      name: 'Burner',
                      affordances: [{ id: 'brew-coffee', name: 'Brew coffee', emoji: ':coffee:' }],
                    },
                  ],
                },
              ],
            },
            {
              id: 'bookshelf',
              name: 'Bookshelf',
              affordances: [{ id: 'read', name: 'Read science history', emoji: ':book:' }],
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
          ],
        },
        {
          id: 'coffee-shop',
          name: 'Coffee Shop',
          kind: 'shop',
          bbox: { x: 12, y: 12, w: 5, h: 5 },
          description: 'A shop with a counter.',
          subObjects: [
            {
              id: 'counter',
              name: 'Counter',
              affordances: [{ id: 'order', name: 'Order coffee', emoji: ':coffee:' }],
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
        },
      ],
    },
    world: {
      players: [
        {
          id: 'p:lucky',
          position: luckyPosition,
          facing: { dx: 0, dy: 1 },
          speed: 0,
          lastInput: 0,
          coins: 20,
          inventory: [
            { itemId: 'old-map', name: 'Old map', tags: ['curio'], sellPrice: 3 },
            null,
            null,
          ],
        },
        {
          id: 'p:me',
          human: 'Me',
          position: { x: 6, y: 8 },
          facing: { dx: -1, dy: 0 },
          speed: 0,
          lastInput: 0,
          objectUse: {
            objectRef: 'lucky-cottage/kitchen/stove/burner',
            objectName: 'Burner',
            affordanceId: 'brew-coffee',
            affordanceName: 'Brew coffee',
            description: 'Brewing coffee',
            until: 120_000,
          },
        },
      ],
      agents: [{ id: 'a:lucky', playerId: 'p:lucky', ...luckyAgent }],
      groundItems: [
        {
          id: 'g:1',
          item: { itemId: 'loose-cookie', name: 'Loose cookie', tags: ['food'], sellPrice: 2 },
          position: { x: 5, y: 8 },
          droppedAt: 0,
        },
      ],
      takenPoiItemRefs: [],
      conversations: [
        {
          id: 'c:1',
          creator: 'p:me',
          created: 0,
          lastMessage: { author: 'p:me', timestamp: 500 },
          numMessages: 1,
          participants: [
            { playerId: 'p:lucky', invited: 0, status: { kind: 'participating', started: 0 } },
            { playerId: 'p:me', invited: 0, status: { kind: 'participating', started: 0 } },
          ],
        },
      ],
    },
    playerDescriptions: [
      {
        playerId: 'p:lucky',
        name: 'Lucky',
        character: 'f1',
        description: 'Lucky is curious.',
      },
      {
        playerId: 'p:me',
        name: 'Me',
        character: 'f5',
        description: 'The local human player.',
      },
    ],
    agentDescriptions: [
      {
        agentId: 'a:lucky',
        identity: 'Lucky is curious and direct.',
        plan: 'Answer questions directly.',
        homeName: 'lucky-cottage',
        profession: 'space traveler',
        family: [],
        friends: [],
        schedule: [
          {
            block: 'morning',
            activity: 'brew coffee at home',
            poi: 'lucky-cottage',
          },
        ],
      },
    ],
  };
}

describe('MCP agent context helpers', () => {
  test('flattens recursive POI objects into nearby affordances', () => {
    const snapshot = makeSnapshot();

    const affordances = nearbyAffordancesForPosition(snapshot.worldMap, { x: 5, y: 8 });

    expect(affordances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'lucky-cottage/kitchen#make-coffee',
          objectName: 'Kitchen',
          affordanceName: 'Make coffee',
        }),
        expect.objectContaining({
          id: 'lucky-cottage/kitchen/stove/burner#brew-coffee',
          objectName: 'Burner',
          affordanceName: 'Brew coffee',
        }),
        expect.objectContaining({
          id: 'lucky-cottage/bookshelf#read',
          objectName: 'Bookshelf',
          affordanceName: 'Read science history',
        }),
      ]),
    );
  });

  test('returns current POI and no invented affordances when outside POIs', () => {
    const snapshot = makeSnapshot({ luckyPosition: { x: 20, y: 20 } });

    const context = buildAgentContext(snapshot, {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(context.currentPoi).toBeNull();
    expect(context.surroundings.nearbyAffordances).toEqual([]);
  });

  test('includes nearby object users in context', () => {
    const snapshot = makeSnapshot();

    const context = buildAgentContext(snapshot, {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(context.surroundings.objectUsers).toEqual([
      expect.objectContaining({
        playerId: 'p:me',
        playerName: 'Me',
        objectRef: 'lucky-cottage/kitchen/stove/burner',
        objectName: 'Burner',
        affordanceId: 'brew-coffee',
        affordanceName: 'Brew coffee',
      }),
    ]);
  });

  test('includes inventory, portable objects, ground items, and commerce in context', () => {
    const homeContext = buildAgentContext(makeSnapshot(), {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(homeContext.coins).toBe(20);
    expect(homeContext.inventory[0]).toMatchObject({ itemId: 'old-map', name: 'Old map' });
    expect(homeContext.surroundings.portableObjects).toEqual([
      expect.objectContaining({
        objectRef: 'lucky-cottage/bookshelf/field-notes',
        item: expect.objectContaining({ name: 'Field notes' }),
      }),
    ]);
    expect(homeContext.surroundings.nearbyGroundItems).toEqual([
      expect.objectContaining({
        id: 'g:1',
        item: expect.objectContaining({ name: 'Loose cookie' }),
      }),
    ]);

    const shopContext = buildAgentContext(makeSnapshot({ luckyPosition: { x: 13, y: 13 } }), {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(shopContext.surroundings.commerceOptions).toEqual([
      expect.objectContaining({
        objectRef: 'coffee-shop/counter',
        buy: [expect.objectContaining({ itemId: 'coffee-cup', price: 4 })],
        sellTags: expect.arrayContaining(['curio']),
      }),
    ]);
  });

  test('includes explicit and derived goals in context', () => {
    const derivedContext = buildAgentContext(makeSnapshot(), {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(derivedContext.explicitIntent).toBeNull();
    expect(derivedContext.currentGoal).toMatchObject({
      kind: 'followSchedule',
      source: 'schedule',
      target: { poiId: 'lucky-cottage', activityDescription: 'brew coffee at home' },
    });

    const explicitIntent = {
      kind: 'talkToPlayer',
      description: 'Tell Me about the burner',
      rationale: 'Me asked for help.',
      source: 'reflection',
      created: 0,
      expiresAt: 120_000,
      priority: 7,
      target: { playerId: 'p:me' },
    };
    const explicitContext = buildAgentContext(makeSnapshot({ luckyAgent: { intent: explicitIntent } }), {
      playerId: 'p:lucky',
      agentId: 'a:lucky',
    });

    expect(explicitContext.explicitIntent).toEqual(explicitIntent);
    expect(explicitContext.currentGoal).toEqual(explicitIntent);
    expect(explicitContext.goalStatus.hasExplicitIntent).toBe(true);
  });

  test('dedupes memories from multiple memory searches', () => {
    const memories = dedupeMemories([
      [
        { id: 'm:1', description: 'first' },
        { id: 'm:2', description: 'second' },
      ],
      [
        { id: 'm:1', description: 'first duplicate' },
        { id: 'm:3', description: 'third' },
      ],
    ]);

    expect(memories.map((m) => m.id)).toEqual(['m:1', 'm:2', 'm:3']);
  });
});

describe('handleDoSomething inventory actions', () => {
  test('exposes inventory actions and commits pickup through MCP', async () => {
    const snapshot = makeSnapshot();
    const toolCalls = [];
    const operation = {
      worldId: 'world',
      operationId: 'o:1',
      args: {
        worldId: 'world',
        player: snapshot.world.players[0],
        agent: snapshot.world.agents[0],
        otherFreePlayers: [],
      },
    };

    await handleDoSomething(operation, snapshot, {
      callTool: async (name, args) => {
        if (name === 'aitown.search_memories') {
          return textContent([]);
        }
        toolCalls.push({ name, args });
        return textContent({ ok: true });
      },
      llmSchema: async (messages, schema) => {
        expect(schema.properties.action.enum).toEqual(expect.arrayContaining(['pickUpItem']));
        const payload = JSON.parse(messages[1].content);
        expect(payload.currentContext.surroundings.portableObjects[0]).toMatchObject({
          objectRef: 'lucky-cottage/bookshelf/field-notes',
        });
        return {
          action: 'pickUpItem',
          x: null,
          y: null,
          description: null,
          emoji: null,
          durationMs: null,
          invitee: null,
          useObject: null,
          pickUpItem: 'poi:lucky-cottage/bookshelf/field-notes',
          putDownSlot: null,
          buyItem: null,
          sellItem: null,
        };
      },
      conversationMessages: async () => [],
      recentMemories: async () => ({ name: 'Lucky', memories: [] }),
    });

    expect(toolCalls).toEqual([
      {
        name: 'aitown.do_pick_up_item',
        args: expect.objectContaining({
          sourceKind: 'poiObject',
          objectRef: 'lucky-cottage/bookshelf/field-notes',
        }),
      },
    ]);
  });
});

describe('handleReflect intent setting', () => {
  test('saves reflections and commits a structured nextIntent', async () => {
    const snapshot = makeSnapshot();
    const operation = {
      worldId: 'world',
      operationId: 'o:reflect',
      args: {
        worldId: 'world',
        playerId: 'p:lucky',
        agentId: 'a:lucky',
      },
    };
    const toolCalls = [];

    await handleReflect(operation, snapshot, {
      recentMemories: async () => ({
        name: 'Lucky',
        memories: [
          {
            id: 'm:sick',
            description: 'Me said, "I am sick."',
            type: 'conversation',
          },
        ],
      }),
      callTool: async (name, args) => {
        toolCalls.push({ name, args });
        return textContent({ ok: true });
      },
      llmSchema: async (messages, schema) => {
        expect(schema.properties.nextIntent.anyOf[0].properties.kind.enum).toEqual(
          expect.arrayContaining(['stayAtPoi', 'talkToPlayer', 'activity']),
        );
        const payload = JSON.parse(messages[1].content);
        expect(payload.currentContext.currentGoal.kind).toBe('followSchedule');
        expect(payload.statements[0].text).toContain('I am sick');
        return {
          reflections: [
            {
              insight: 'Me may need care after saying they are sick.',
              statementIds: [0],
              importance: 7,
            },
          ],
          nextIntent: {
            kind: 'stayAtPoi',
            description: 'Stay home to avoid spreading illness',
            rationale: 'Me said they are sick, so keeping distance is prudent.',
            source: 'conversation',
            durationMs: 600_000,
            priority: 8,
            target: {
              playerId: null,
              poiId: 'lucky-cottage',
              objectRef: null,
              affordanceId: null,
              itemId: null,
              slotIndex: null,
              activityDescription: 'Stay home and keep distance',
            },
          },
        };
      },
      conversationMessages: async () => [],
    });

    expect(toolCalls).toEqual([
      {
        name: 'aitown.save_reflections',
        args: expect.objectContaining({
          reflections: [
            {
              description: 'Me may need care after saying they are sick.',
              importance: 7,
              relatedMemoryIds: ['m:sick'],
            },
          ],
          nextIntent: {
            kind: 'stayAtPoi',
            description: 'Stay home to avoid spreading illness',
            rationale: 'Me said they are sick, so keeping distance is prudent.',
            source: 'conversation',
            created: 60_000,
            expiresAt: 660_000,
            priority: 8,
            target: {
              poiId: 'lucky-cottage',
              activityDescription: 'Stay home and keep distance',
            },
          },
        }),
      },
    ]);
  });
});

describe('handleGenerateMessage context payload', () => {
  test('includes surroundings, schedule, state, messages, and real nearby objects', async () => {
    const snapshot = makeSnapshot();
    const llmCalls = [];
    const composed = [];
    const operation = {
      worldId: 'world',
      operationId: 'o:1',
      args: {
        worldId: 'world',
        conversationId: 'c:1',
        playerId: 'p:lucky',
        agentId: 'a:lucky',
        otherPlayerId: 'p:me',
        type: 'continue',
      },
    };

    await handleGenerateMessage(operation, snapshot, {
      conversationMessages: async () => [
        { authorName: 'Me', text: 'Do you know of any objects nearby?' },
      ],
      callTool: async (name, args) => {
        if (name === 'aitown.search_memories') {
          return textContent([
            {
              id: `memory:${args.query}`,
              description: `Memory for ${args.query}`,
              importance: 5,
              data: { type: 'reflection' },
            },
          ]);
        }
        if (name === 'aitown.compose_message') {
          composed.push(args);
          return textContent({ ok: true });
        }
        throw new Error(`Unexpected tool ${name}`);
      },
      llmSchema: async (messages) => {
        llmCalls.push(messages);
        const payload = JSON.parse(messages[1].content);
        const objectNames = payload.currentContext.surroundings.nearbyAffordances.map(
          (a) => a.objectName,
        );
        expect(objectNames).toEqual(expect.arrayContaining(['Kitchen', 'Burner', 'Bookshelf']));
        expect(payload.currentContext.surroundings.objectUsers).toEqual([
          expect.objectContaining({
            playerName: 'Me',
            objectName: 'Burner',
            affordanceName: 'Brew coffee',
          }),
        ]);
        return { text: `I can see ${objectNames.join(', ')} nearby.` };
      },
      recentMemories: async () => ({ name: 'Lucky', memories: [] }),
    });

    const payload = JSON.parse(llmCalls[0][1].content);
    expect(payload.currentContext.currentPoi.name).toBe("Lucky's Cottage");
    expect(payload.currentContext.schedule).toMatchObject({
      currentBlock: 'morning',
      scheduledActivity: 'brew coffee at home',
      scheduledPoi: 'lucky-cottage',
      atScheduledPoi: true,
    });
    expect(payload.currentContext.state.conversation.id).toBe('c:1');
    expect(payload.currentContext.surroundings.nearbyPlayers).toEqual([
      expect.objectContaining({ id: 'p:me', name: 'Me', isHuman: true }),
    ]);
    expect(payload.currentContext.recentConversationMessages).toEqual([
      { authorName: 'Me', text: 'Do you know of any objects nearby?' },
    ]);
    expect(payload.currentContext.relatedMemories.map((m) => m.id)).toEqual([
      'memory:Conversation with Me',
      "memory:At Lucky's Cottage",
      "memory:Lucky's Cottage",
    ]);
    expect(composed[0].text).toContain('Kitchen');
  });
});
