import { Id, TableNames } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import {
  DatabaseReader,
  MutationCtx,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import schema from './schema';
import { DELETE_BATCH_SIZE } from './constants';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { insertInput } from './aiTown/insertInput';
import { fetchEmbedding } from './util/llm';
import { chatCompletion } from './util/llm';
import { startConversationMessage } from './agent/conversation';
import { GameId } from './aiTown/ids';

const DEFAULT_SAVE_SLOT = 'default';

// Clear all of the tables except for durable caches, saves, and the runner control flag.
const excludedTables: Array<TableNames> = ['embeddingsCache', 'runnerControl', 'gameSaves'];

const restoreWipeTables: Array<TableNames> = [
  'mcpAgentOperations',
  'inputs',
  'worldStatus',
  'worlds',
  'engines',
  'maps',
  'playerDescriptions',
  'agentDescriptions',
  'messages',
  'memories',
  'memoryEmbeddings',
  'archivedPlayers',
  'archivedConversations',
  'archivedAgents',
  'participatedTogether',
];

export type SnapshotRow = {
  _id: string;
  doc: Record<string, any>;
};

export type GameSnapshot = {
  version: 1;
  savedAt: number;
  rows: Record<string, SnapshotRow[]>;
};

function snapshotRow(row: Record<string, any>, sanitize?: (doc: Record<string, any>) => any) {
  const { _id, _creationTime, ...doc } = row;
  return {
    _id: String(_id),
    doc: sanitize ? sanitize(doc) : doc,
  };
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function sanitizeWorldDocForSave(world: Record<string, any>): Record<string, any> {
  const { historicalLocations: _historicalLocations, ...rest } = world;
  return {
    ...rest,
    agents: (world.agents ?? []).map((agent: Record<string, any>) => {
      const { inProgressOperation: _inProgressOperation, ...sanitized } = agent;
      return sanitized;
    }),
    conversations: (world.conversations ?? []).map((conversation: Record<string, any>) => {
      const { isTyping: _isTyping, ...sanitized } = conversation;
      return sanitized;
    }),
  };
}

export function prepareEngineForRestore(engine: Record<string, any>): Record<string, any> {
  const { processedInputNumber: _processedInputNumber, ...rest } = engine;
  return {
    ...rest,
    running: false,
  };
}

export function remapWorldIdField(doc: Record<string, any>, worldIdMap: Map<string, string>) {
  if (!doc.worldId) {
    return { ...doc };
  }
  return {
    ...doc,
    worldId: worldIdMap.get(doc.worldId) ?? doc.worldId,
  };
}

export function remapMemoryDocForRestore(
  doc: Record<string, any>,
  embeddingIdMap: Map<string, string>,
  memoryIdMap?: Map<string, string>,
) {
  const data =
    doc.data?.type === 'reflection' && memoryIdMap
      ? {
          ...doc.data,
          relatedMemoryIds: doc.data.relatedMemoryIds.map(
            (id: string) => memoryIdMap.get(id) ?? id,
          ),
        }
      : doc.data;
  return {
    ...doc,
    embeddingId: embeddingIdMap.get(doc.embeddingId) ?? doc.embeddingId,
    data,
  };
}

async function writeRunnerPaused(ctx: MutationCtx, paused: boolean) {
  const row = await ctx.db.query('runnerControl').first();
  if (row) {
    await ctx.db.patch(row._id, { paused });
  } else {
    await ctx.db.insert('runnerControl', { paused });
  }
}

export const getRunnerPaused = query({
  handler: async (ctx) => {
    const row = await ctx.db.query('runnerControl').first();
    return row?.paused ?? false;
  },
});

export const setRunnerPaused = internalMutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    await writeRunnerPaused(ctx, args.paused);
  },
});

export const pauseDefaultWorld = internalMutation({
  handler: async (ctx) => {
    await pauseDefaultWorldForMenu(ctx);
  },
});

export const restart = action({
  handler: async (ctx) => {
    await ctx.runMutation(internal.testing.setRunnerPaused, { paused: true });
    try {
      // Give the runner a moment to finish its current iteration.
      await new Promise((r) => setTimeout(r, 2000));
      await ctx.runMutation(internal.testing.wipeAllTables);
      while (true) {
        const ws = await ctx.runQuery(api.world.defaultWorldStatus);
        if (!ws) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      await ctx.runMutation(api.init.default, {});
      const ws = await ctx.runQuery(api.world.defaultWorldStatus);
      if (!ws) {
        throw new Error('Restart: init did not create a default world.');
      }
      await ctx.runMutation(api.world.joinWorld, { worldId: ws.worldId });
    } finally {
      await ctx.runMutation(internal.testing.setRunnerPaused, { paused: false });
    }
  },
});

export const wipeAllTables = internalMutation({
  handler: async (ctx) => {
    for (const tableName of Object.keys(schema.tables)) {
      if (excludedTables.includes(tableName as TableNames)) {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, { tableName, cursor: null });
    }
  },
});

export const deletePage = internalMutation({
  args: {
    tableName: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query(args.tableName as TableNames)
      .paginate({ cursor: args.cursor, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, {
        tableName: args.tableName,
        cursor: results.continueCursor,
      });
    }
  },
});

export const kick = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    await kickEngine(ctx, worldStatus.worldId);
  },
});

export const stopAllowed = query({
  handler: async () => {
    return !process.env.STOP_NOT_ALLOWED;
  },
});

export const stop = mutation({
  handler: async (ctx) => {
    if (process.env.STOP_NOT_ALLOWED) throw new Error('Stop not allowed');
    await pauseDefaultWorldForMenu(ctx);
  },
});

export const resume = mutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (worldStatus.status === 'running') {
      if (!engine.running) {
        throw new Error(`Engine ${engine._id} isn't running?`);
      }
      console.debug(`World ${worldStatus.worldId} is already running`);
      await writeRunnerPaused(ctx, false);
      return;
    }
    console.log(
      `Resuming engine ${engine._id} for world ${worldStatus.worldId} (state: ${worldStatus.status})...`,
    );
    await ctx.db.patch(worldStatus._id, { status: 'running' });
    await startEngine(ctx, worldStatus.worldId);
    await writeRunnerPaused(ctx, false);
  },
});

export const saveStatus = query({
  handler: async (ctx) => {
    const save = await ctx.db
      .query('gameSaves')
      .withIndex('slot', (q) => q.eq('slot', DEFAULT_SAVE_SLOT))
      .unique();
    return save ? { savedAt: save.savedAt } : null;
  },
});

export const saveGame = action({
  handler: async (ctx) => {
    const snapshot = (await ctx.runQuery(
      internal.testing.collectGameSnapshot as any,
    )) as GameSnapshot;
    const storageId = await ctx.storage.store(
      new Blob([JSON.stringify(snapshot)], { type: 'application/json' }),
    );
    await ctx.runMutation(internal.testing.upsertGameSave as any, {
      slot: DEFAULT_SAVE_SLOT,
      storageId,
      savedAt: snapshot.savedAt,
    });
    return { savedAt: snapshot.savedAt };
  },
});

export const loadGame = action({
  handler: async (ctx) => {
    await ctx.runMutation(internal.testing.pauseDefaultWorld as any);
    const save = (await ctx.runQuery(internal.testing.getGameSave as any, {
      slot: DEFAULT_SAVE_SLOT,
    })) as { storageId: string; savedAt: number } | null;
    if (!save) {
      throw new Error('No saved game found.');
    }
    const snapshotBlob = await ctx.storage.get(save.storageId as Id<'_storage'>);
    if (!snapshotBlob) {
      throw new Error('Saved game data is missing from storage.');
    }
    const snapshot = JSON.parse(await snapshotBlob.text()) as GameSnapshot;
    await ctx.runMutation(internal.testing.restoreGameSnapshot as any, { snapshot });
    return { loadedAt: Date.now(), savedAt: save.savedAt };
  },
});

export const collectGameSnapshot = internalQuery({
  handler: async (ctx): Promise<GameSnapshot> => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`World ${worldStatus.worldId} not found`);
    }
    const worldId = worldStatus.worldId;

    const maps = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', worldId))
      .collect();
    const archivedPlayers = await ctx.db
      .query('archivedPlayers')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const archivedConversations = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const archivedAgents = await ctx.db
      .query('archivedAgents')
      .withIndex('worldId', (q) => q.eq('worldId', worldId))
      .collect();
    const participatedTogether = await ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', worldId))
      .collect();

    const playerIds = new Set<string>();
    for (const player of world.players) {
      playerIds.add(player.id);
    }
    for (const player of archivedPlayers) {
      playerIds.add(player.id);
    }
    for (const conversation of archivedConversations) {
      for (const playerId of conversation.participants) {
        playerIds.add(playerId);
      }
    }

    const memories = (await ctx.db.query('memories').collect()).filter((memory) =>
      playerIds.has(memory.playerId),
    );
    const embeddingIds = new Set(memories.map((memory) => memory.embeddingId));
    const memoryEmbeddings = (
      await Promise.all([...embeddingIds].map((id) => ctx.db.get(id)))
    ).filter(isPresent);

    return {
      version: 1,
      savedAt: Date.now(),
      rows: {
        worlds: [snapshotRow(world, sanitizeWorldDocForSave)],
        worldStatus: [snapshotRow(worldStatus)],
        engines: [snapshotRow(engine)],
        maps: maps.map((row) => snapshotRow(row)),
        playerDescriptions: playerDescriptions.map((row) => snapshotRow(row)),
        agentDescriptions: agentDescriptions.map((row) => snapshotRow(row)),
        messages: messages.map((row) => snapshotRow(row)),
        memories: memories.map((row) => snapshotRow(row)),
        memoryEmbeddings: memoryEmbeddings.map((row) => snapshotRow(row)),
        archivedPlayers: archivedPlayers.map((row) => snapshotRow(row)),
        archivedConversations: archivedConversations.map((row) => snapshotRow(row)),
        archivedAgents: archivedAgents.map((row) => snapshotRow(row)),
        participatedTogether: participatedTogether.map((row) => snapshotRow(row)),
      },
    };
  },
});

export const getGameSave = internalQuery({
  args: { slot: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('gameSaves')
      .withIndex('slot', (q) => q.eq('slot', args.slot))
      .unique();
  },
});

export const upsertGameSave = internalMutation({
  args: {
    slot: v.string(),
    storageId: v.string(),
    savedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('gameSaves')
      .withIndex('slot', (q) => q.eq('slot', args.slot))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { storageId: args.storageId, savedAt: args.savedAt });
    } else {
      await ctx.db.insert('gameSaves', args);
    }
  },
});

export const restoreGameSnapshot = internalMutation({
  args: { snapshot: v.any() },
  handler: async (ctx, args) => {
    const snapshot = args.snapshot as GameSnapshot;
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported save version: ${snapshot.version}`);
    }

    await writeRunnerPaused(ctx, true);
    for (const tableName of restoreWipeTables) {
      await deleteAllRows(ctx, tableName);
    }

    const rows = snapshot.rows;
    const engineIdMap = new Map<string, string>();
    const worldIdMap = new Map<string, string>();
    const embeddingIdMap = new Map<string, string>();
    const memoryIdMap = new Map<string, string>();
    const now = Date.now();

    for (const row of rows.engines ?? []) {
      const newId = await ctx.db.insert('engines', prepareEngineForRestore(row.doc) as any);
      engineIdMap.set(row._id, newId);
    }
    for (const row of rows.worlds ?? []) {
      const newId = await ctx.db.insert('worlds', sanitizeWorldDocForSave(row.doc) as any);
      worldIdMap.set(row._id, newId);
    }
    for (const row of rows.memoryEmbeddings ?? []) {
      const newId = await ctx.db.insert('memoryEmbeddings', row.doc as any);
      embeddingIdMap.set(row._id, newId);
    }
    for (const row of rows.worldStatus ?? []) {
      await ctx.db.insert('worldStatus', {
        ...row.doc,
        worldId: worldIdMap.get(row.doc.worldId) ?? row.doc.worldId,
        engineId: engineIdMap.get(row.doc.engineId) ?? row.doc.engineId,
        lastViewed: now,
        status: 'stoppedByDeveloper',
      } as any);
    }

    await insertWorldScopedRows(ctx, 'maps', rows.maps ?? [], worldIdMap);
    await insertWorldScopedRows(
      ctx,
      'playerDescriptions',
      rows.playerDescriptions ?? [],
      worldIdMap,
    );
    await insertWorldScopedRows(ctx, 'agentDescriptions', rows.agentDescriptions ?? [], worldIdMap);
    await insertWorldScopedRows(ctx, 'messages', rows.messages ?? [], worldIdMap);
    await insertWorldScopedRows(ctx, 'archivedPlayers', rows.archivedPlayers ?? [], worldIdMap);
    await insertWorldScopedRows(
      ctx,
      'archivedConversations',
      rows.archivedConversations ?? [],
      worldIdMap,
    );
    await insertWorldScopedRows(ctx, 'archivedAgents', rows.archivedAgents ?? [], worldIdMap);
    await insertWorldScopedRows(
      ctx,
      'participatedTogether',
      rows.participatedTogether ?? [],
      worldIdMap,
    );

    for (const row of rows.memories ?? []) {
      const newId = await ctx.db.insert(
        'memories',
        remapMemoryDocForRestore(row.doc, embeddingIdMap) as any,
      );
      memoryIdMap.set(row._id, newId);
    }
    for (const row of rows.memories ?? []) {
      if (row.doc.data?.type !== 'reflection') {
        continue;
      }
      const newId = memoryIdMap.get(row._id);
      if (!newId) {
        continue;
      }
      await ctx.db.patch(
        newId as Id<'memories'>,
        {
          data: remapMemoryDocForRestore(row.doc, embeddingIdMap, memoryIdMap).data,
        } as any,
      );
    }
  },
});

export const archive = internalMutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (engine.running) {
      throw new Error(`Engine ${engine._id} is still running!`);
    }
    console.log(`Archiving world ${worldStatus.worldId}...`);
    await ctx.db.patch(worldStatus._id, { isDefault: false });
  },
});

async function getDefaultWorld(db: DatabaseReader) {
  const result = await getDefaultWorldOrNull(db);
  if (!result) {
    throw new Error('No default world found');
  }
  return result;
}

async function getDefaultWorldOrNull(db: DatabaseReader) {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .first();
  if (!worldStatus) {
    return null;
  }
  const engine = await db.get(worldStatus.engineId);
  if (!engine) {
    throw new Error(`Engine ${worldStatus.engineId} not found`);
  }
  return { worldStatus, engine };
}

async function pauseDefaultWorldForMenu(ctx: MutationCtx) {
  await writeRunnerPaused(ctx, true);
  const defaultWorld = await getDefaultWorldOrNull(ctx.db);
  if (!defaultWorld) {
    return;
  }
  const { worldStatus, engine } = defaultWorld;
  if (worldStatus.status === 'inactive' || worldStatus.status === 'stoppedByDeveloper') {
    if (engine.running) {
      console.log(`Stopping engine ${engine._id} for already inactive world...`);
      await stopEngine(ctx, worldStatus.worldId);
    }
    console.debug(`World ${worldStatus.worldId} is already inactive`);
    return;
  }
  console.log(`Stopping engine ${engine._id}...`);
  await ctx.db.patch(worldStatus._id, { status: 'stoppedByDeveloper' });
  if (engine.running) {
    await stopEngine(ctx, worldStatus.worldId);
  }
}

async function deleteAllRows(ctx: MutationCtx, tableName: TableNames) {
  const rows = await ctx.db.query(tableName).collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function insertWorldScopedRows(
  ctx: MutationCtx,
  tableName: TableNames,
  rows: SnapshotRow[],
  worldIdMap: Map<string, string>,
) {
  for (const row of rows) {
    await (ctx.db as any).insert(tableName, remapWorldIdField(row.doc, worldIdMap));
  }
}

export const debugCreatePlayers = internalMutation({
  args: {
    numPlayers: v.number(),
  },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    for (let i = 0; i < args.numPlayers; i++) {
      const inputId = await insertInput(ctx, worldStatus.worldId, 'join', {
        name: `Robot${i}`,
        description: `This player is a robot.`,
        character: `f${1 + (i % 8)}`,
      });
    }
  },
});

export const randomPositions = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const map = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!map) {
      throw new Error(`No map for world ${worldStatus.worldId}`);
    }
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`No world for world ${worldStatus.worldId}`);
    }
    for (const player of world.players) {
      await insertInput(ctx, world._id, 'moveTo', {
        playerId: player.id,
        destination: {
          x: 1 + Math.floor(Math.random() * (map.width - 2)),
          y: 1 + Math.floor(Math.random() * (map.height - 2)),
        },
      });
    }
  },
});

export const testEmbedding = internalAction({
  args: { input: v.string() },
  handler: async (_ctx, args) => {
    return await fetchEmbedding(args.input);
  },
});

export const testCompletion = internalAction({
  args: {},
  handler: async (ctx, args) => {
    return await chatCompletion({
      messages: [
        { content: 'You are helpful', role: 'system' },
        { content: 'Where is pizza?', role: 'user' },
      ],
    });
  },
});

export const testConvo = internalAction({
  args: {},
  handler: async (ctx, args) => {
    const a: any = (await startConversationMessage(
      ctx,
      'm1707m46wmefpejw1k50rqz7856qw3ew' as Id<'worlds'>,
      'c:115' as GameId<'conversations'>,
      'p:0' as GameId<'players'>,
      'p:6' as GameId<'players'>,
    )) as any;
    return await a.readAll();
  },
});
