import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { insertInput } from './aiTown/insertInput';
import { conversationId, playerId } from './aiTown/ids';

export const listMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationId,
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) =>
        q.eq('worldId', args.worldId).eq('conversationId', args.conversationId),
      )
      .collect();
    const out = [];
    for (const message of messages) {
      const playerDescription = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('playerId', message.author))
        .first();
      if (!playerDescription) {
        throw new Error(`Invalid author ID: ${message.author}`);
      }
      out.push({ ...message, authorName: playerDescription.name });
    }
    return out;
  },
});

export const DEFAULT_INSPECTOR_MESSAGE_LIMIT = 25;
export const MAX_INSPECTOR_MESSAGE_LIMIT = 100;

export function normalizeInspectorMessageLimit(limit: number | undefined) {
  if (limit === undefined) {
    return DEFAULT_INSPECTOR_MESSAGE_LIMIT;
  }
  return Math.max(0, Math.min(MAX_INSPECTOR_MESSAGE_LIMIT, Math.floor(limit)));
}

export const inspectorConversationMessages = query({
  args: {
    worldId: v.id('worlds'),
    conversationIds: v.array(conversationId),
    limitPerConversation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const names = new Map(playerDescriptions.map((description) => [
      description.playerId,
      description.name,
    ]));
    const limit = normalizeInspectorMessageLimit(args.limitPerConversation);
    const conversations = [];
    for (const id of args.conversationIds) {
      const messages = await ctx.db
        .query('messages')
        .withIndex('conversationId', (q) => q.eq('worldId', args.worldId).eq('conversationId', id))
        .order('desc')
        .take(limit);
      conversations.push({
        conversationId: id,
        messages: messages.reverse().map((message) => ({
          id: message._id,
          createdAt: message._creationTime,
          author: message.author,
          authorName: names.get(message.author) ?? message.author,
          text: message.text,
        })),
      });
    }
    return { conversations };
  },
});

export const writeMessage = mutation({
  args: {
    worldId: v.id('worlds'),
    conversationId,
    messageUuid: v.string(),
    playerId,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('messages', {
      conversationId: args.conversationId,
      author: args.playerId,
      messageUuid: args.messageUuid,
      text: args.text,
      worldId: args.worldId,
    });
    return await insertInput(ctx, args.worldId, 'finishSendingMessage', {
      conversationId: args.conversationId,
      playerId: args.playerId,
      timestamp: Date.now(),
    });
  },
});
