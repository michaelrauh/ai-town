import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { narrativeStateFields } from './narrative/state';

export default defineSchema({
  // Narrative pivot: a single save per slot (e.g. 'default'), holding the entire game state.
  narrativeState: defineTable(narrativeStateFields).index('slot', ['slot']),

  // Per-turn narrator operations consumed by the MCP agent-runner.
  narrativeOperations: defineTable({
    saveId: v.id('narrativeState'),
    turn: v.number(),
    status: v.union(
      v.literal('queued'),
      v.literal('inProgress'),
      v.literal('done'),
      v.literal('failed'),
    ),
    context: v.any(),
    created: v.number(),
    completed: v.optional(v.number()),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
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
          output: v.optional(v.any()),
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
});
