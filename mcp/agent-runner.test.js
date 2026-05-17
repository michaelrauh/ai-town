import { describe, expect, test } from '@jest/globals';
import {
  buildAgentContext,
  dedupeMemories,
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

function makeSnapshot({ luckyPosition = { x: 5, y: 8 } } = {}) {
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
        },
        {
          id: 'p:me',
          human: 'Me',
          position: { x: 6, y: 8 },
          facing: { dx: -1, dy: 0 },
          speed: 0,
          lastInput: 0,
        },
      ],
      agents: [{ id: 'a:lucky', playerId: 'p:lucky' }],
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
