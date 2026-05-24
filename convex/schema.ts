import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';
import { narrativeStateFields } from './narrative/state';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  runnerControl: defineTable({
    paused: v.boolean(),
  }),

  gameSaves: defineTable({
    slot: v.string(),
    storageId: v.string(),
    savedAt: v.number(),
  }).index('slot', ['slot']),

  worldFlags: defineTable({
    worldId: v.id('worlds'),
    name: v.string(),
    value: v.any(),
  }).index('worldId_name', ['worldId', 'name']),

  // Narrative pivot: a single save per slot (e.g. 'default'), holding the entire game state.
  narrativeState: defineTable(narrativeStateFields).index('slot', ['slot']),

  // Per-turn narrator operations consumed by the MCP agent-runner.
  narrativeOperations: defineTable({
    saveId: v.id('narrativeState'),
    turn: v.number(),
    status: v.union(v.literal('queued'), v.literal('inProgress'), v.literal('done'), v.literal('failed')),
    context: v.any(),
    created: v.number(),
    completed: v.optional(v.number()),
    error: v.optional(v.string()),
    // Inspector fields (Level 1) -- all optional, populated as we go.
    actionId: v.optional(v.string()),
    actionLabel: v.optional(v.string()),
    actionPayload: v.optional(v.any()),
    freeText: v.optional(v.string()),
    stateBefore: v.optional(v.any()),
    stateAfter: v.optional(v.any()),
    toolCalls: v.optional(
      v.array(
        v.object({
          tool: v.string(),
          args: v.any(),
          at: v.number(),
          ok: v.boolean(),
          error: v.optional(v.string()),
        }),
      ),
    ),
  })
    .index('status_created', ['status', 'created'])
    .index('saveId', ['saveId'])
    .index('saveId_turn', ['saveId', 'turn']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
