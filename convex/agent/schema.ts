import { v } from 'convex/values';
import { agentId, playerId, conversationId } from '../aiTown/ids';
import { defineTable } from 'convex/server';
import { EMBEDDING_DIMENSION } from '../util/llm';

export const memoryFields = {
  playerId,
  description: v.string(),
  embeddingId: v.id('memoryEmbeddings'),
  importance: v.number(),
  lastAccess: v.number(),
  data: v.union(
    // Setting up dynamics between players
    v.object({
      type: v.literal('relationship'),
      // The player this memory is about, from the perspective of the player
      // whose memory this is.
      playerId,
    }),
    v.object({
      type: v.literal('conversation'),
      conversationId,
      // The other player(s) in the conversation.
      playerIds: v.array(playerId),
    }),
    v.object({
      type: v.literal('reflection'),
      relatedMemoryIds: v.array(v.id('memories')),
    }),
  ),
};
export const memoryTables = {
  memories: defineTable(memoryFields)
    .index('embeddingId', ['embeddingId'])
    .index('playerId_type', ['playerId', 'data.type'])
    .index('playerId', ['playerId']),
  memoryEmbeddings: defineTable({
    playerId,
    embedding: v.array(v.float64()),
  }).vectorIndex('embedding', {
    vectorField: 'embedding',
    filterFields: ['playerId'],
    dimensions: EMBEDDING_DIMENSION,
  }),
};

export const agentTables = {
  ...memoryTables,
  embeddingsCache: defineTable({
    textHash: v.bytes(),
    embedding: v.array(v.float64()),
  }).index('text', ['textHash']),
  mcpAgentOperations: defineTable({
    worldId: v.id('worlds'),
    operationId: v.string(),
    name: v.string(),
    agentId: v.optional(agentId),
    playerId: v.optional(playerId),
    args: v.any(),
    status: v.union(v.literal('queued'), v.literal('running'), v.literal('failed')),
    created: v.number(),
    claimedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    humanInvolved: v.optional(v.boolean()),
  })
    .index('status_human_created', ['status', 'humanInvolved', 'created'])
    .index('status_created', ['status', 'created'])
    .index('operationId', ['operationId']),
};
