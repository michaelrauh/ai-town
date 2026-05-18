#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  callTool as serverCallTool,
  readResource as serverReadResource,
  resetConvexClient,
  runnerPaused,
} from './server.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
const LOOP_INTERVAL_MS = Number(process.env.MCP_AGENT_RUNNER_INTERVAL_MS ?? 1000);
const CONVEX_CALL_TIMEOUT_MS = Number(process.env.MCP_CONVEX_TIMEOUT_MS ?? 30_000);
const OPERATION_TIMEOUT_MS = Number(process.env.MCP_OPERATION_TIMEOUT_MS ?? 90_000);
const GAME_DAY_MS = 10 * 60_000;
const SCHEDULE_BLOCKS = ['morning', 'midday', 'afternoon', 'evening', 'night'];
// Must match convex/constants.ts SCHEDULE_BLOCK_WEIGHTS.
const SCHEDULE_BLOCK_WEIGHTS = {
  morning: 0.28,
  midday: 0.28,
  afternoon: 0.24,
  evening: 0.08,
  night: 0.12,
};
const NEARBY_PLAYER_DISTANCE_TILES = 6;
const MEMORY_SEARCH_LIMIT = 3;
const MAX_CONTEXT_MEMORIES = 8;
const INVENTORY_SLOT_COUNT = 3;
const STARTING_COINS = 20;
const GROUND_ITEM_PICKUP_RADIUS = 1.5;
const INTENT_KINDS = [
  'followSchedule',
  'goToPoi',
  'stayAtPoi',
  'talkToPlayer',
  'avoidPlayer',
  'useObject',
  'buyItem',
  'sellItem',
  'pickUpItem',
  'putDownItem',
  'activity',
];
const REFLECTION_INTENT_KINDS = INTENT_KINDS.filter((kind) => kind !== 'followSchedule');
const REFLECTION_INTENT_SOURCES = ['reflection', 'conversation'];

const WIPE_RACE_PATTERNS = [
  'mcp agent operation',
  'invalid world',
  'invalid input id',
  'no engine found',
  'world for engine',
  'invalid player id',
  'invalid conversation id',
];

function isWipeRaceError(err) {
  const msg = ((err && err.message) || String(err)).toLowerCase();
  return WIPE_RACE_PATTERNS.some((pat) => msg.includes(pat));
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireConfig() {
  if (!OPENAI_API_KEY) {
    throw new Error('MCP agent runner requires OPENAI_API_KEY in .env.local.');
  }
}

function mcpText(result) {
  return result.content?.find((part) => part.type === 'text')?.text ?? '';
}

function resourceJson(result) {
  const text = result.contents?.[0]?.text;
  if (!text) {
    throw new Error('MCP resource returned no JSON text.');
  }
  return JSON.parse(text);
}

function findById(items, id, label) {
  const item = items.find(
    (candidate) => candidate.id === id || candidate.playerId === id || candidate.agentId === id,
  );
  if (!item) {
    throw new Error(`Missing ${label} ${id} in MCP world snapshot.`);
  }
  return item;
}

async function llmSchema(messages, schema, schemaName) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
      temperature: 0.2,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI chat failed ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty message.');
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`OpenAI returned non-JSON content: ${content}`);
  }
}

async function pendingOperations() {
  return resourceJson(await serverReadResource('aitown://agent-operations/pending'));
}

async function worldSnapshot(worldId) {
  return resourceJson(await serverReadResource(`aitown://world/${worldId}/snapshot`));
}

async function conversationMessages(worldId, conversationId) {
  return resourceJson(
    await serverReadResource(`aitown://conversation/${worldId}/${conversationId}/messages`),
  );
}

async function recentMemories(worldId, playerId) {
  return resourceJson(await serverReadResource(`aitown://memories/${worldId}/${playerId}/recent`));
}

function buildSelfFacts(snapshot, playerId, agentId) {
  const playerDesc = snapshot.playerDescriptions.find((d) => d.playerId === playerId);
  const agentDesc = snapshot.agentDescriptions.find((d) => d.agentId === agentId);
  if (!playerDesc || !agentDesc) {
    throw new Error(`Missing self descriptions for player ${playerId} / agent ${agentId}.`);
  }
  return {
    name: playerDesc.name,
    identity: agentDesc.identity,
    plan: agentDesc.plan,
    profession: agentDesc.profession,
    homeName: agentDesc.homeName,
    family: agentDesc.family ?? [],
    friends: agentDesc.friends ?? [],
    schedule: agentDesc.schedule ?? [],
  };
}

function gameTimeOfDay(now) {
  const fractionOfDay = (((now % GAME_DAY_MS) + GAME_DAY_MS) % GAME_DAY_MS) / GAME_DAY_MS;
  let cumulative = 0;
  for (const block of SCHEDULE_BLOCKS) {
    cumulative += SCHEDULE_BLOCK_WEIGHTS[block];
    if (fractionOfDay < cumulative) return block;
  }
  return SCHEDULE_BLOCKS[SCHEDULE_BLOCKS.length - 1];
}

function scheduleBlockEnd(now) {
  const dayOffset = ((now % GAME_DAY_MS) + GAME_DAY_MS) % GAME_DAY_MS;
  const fractionOfDay = dayOffset / GAME_DAY_MS;
  let cumulative = 0;
  for (const block of SCHEDULE_BLOCKS) {
    cumulative += SCHEDULE_BLOCK_WEIGHTS[block];
    if (fractionOfDay < cumulative) {
      return now + (cumulative * GAME_DAY_MS - dayOffset);
    }
  }
  return now + (GAME_DAY_MS - dayOffset);
}

function activeExplicitIntent(intent, now) {
  return intent && intent.expiresAt > now ? intent : null;
}

function inBbox(position, bbox) {
  return (
    position.x >= bbox.x &&
    position.y >= bbox.y &&
    position.x < bbox.x + bbox.w &&
    position.y < bbox.y + bbox.h
  );
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function playerDescription(snapshot, playerId) {
  return snapshot.playerDescriptions.find((d) => d.playerId === playerId) ?? null;
}

function agentDescriptionForPlayer(snapshot, playerId) {
  const agent = snapshot.world.agents.find((a) => a.playerId === playerId);
  if (!agent) {
    return null;
  }
  return snapshot.agentDescriptions.find((d) => d.agentId === agent.id) ?? null;
}

function currentPoiForPosition(pois, position) {
  return (pois ?? []).find((p) => inBbox(position, p.bbox)) ?? null;
}

function objectRefFor(poiId, objectPath) {
  return [poiId, ...objectPath].join('/');
}

function collectAffordances(poi, objects, path = []) {
  const result = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = objectRefFor(poi.id, objectPath);
    for (const affordance of object.affordances ?? []) {
      result.push({
        id: `${objectRef}#${affordance.id}`,
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        affordanceId: affordance.id,
        affordanceName: affordance.name,
        description: affordance.description ?? null,
        emoji: affordance.emoji ?? null,
        defaultDurationMs: affordance.defaultDurationMs ?? null,
      });
    }
    result.push(...collectAffordances(poi, object.subObjects, objectPath));
  }
  return result;
}

function normalizeInventory(inventory) {
  const slots = Array.isArray(inventory) ? inventory.slice(0, INVENTORY_SLOT_COUNT) : [];
  while (slots.length < INVENTORY_SLOT_COUNT) {
    slots.push(null);
  }
  return slots;
}

function normalizeCoins(coins) {
  return Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : STARTING_COINS;
}

function itemFromPortable(object, objectRef) {
  if (!object.portable) {
    return null;
  }
  return {
    itemId: object.portable.itemId,
    name: object.portable.name ?? object.name,
    description: object.portable.description ?? object.description ?? null,
    emoji: object.portable.emoji ?? null,
    tags: object.portable.tags ?? [],
    sellPrice: object.portable.sellPrice ?? null,
    sourceObjectRef: objectRef,
  };
}

function collectPortableObjects(poi, objects, takenRefs, path = []) {
  const result = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = objectRefFor(poi.id, objectPath);
    const item = itemFromPortable(object, objectRef);
    if (item && !takenRefs.has(objectRef)) {
      result.push({
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        item,
      });
    }
    result.push(...collectPortableObjects(poi, object.subObjects, takenRefs, objectPath));
  }
  return result;
}

function portableObjectsForPosition(snapshot, position) {
  const currentPoi = currentPoiForPosition(snapshot.worldMap?.pois ?? [], position);
  if (!currentPoi) {
    return [];
  }
  const takenRefs = new Set(snapshot.world?.takenPoiItemRefs ?? []);
  return collectPortableObjects(currentPoi, currentPoi.subObjects, takenRefs);
}

function collectCommerceOptions(poi, objects, path = []) {
  const result = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = objectRefFor(poi.id, objectPath);
    if (object.commerce) {
      result.push({
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        buy: object.commerce.buy ?? [],
        sellTags: object.commerce.sellTags ?? [],
      });
    }
    result.push(...collectCommerceOptions(poi, object.subObjects, objectPath));
  }
  return result;
}

function commerceOptionsForPosition(worldMap, position) {
  const currentPoi = currentPoiForPosition(worldMap?.pois ?? [], position);
  if (!currentPoi || currentPoi.kind !== 'shop') {
    return [];
  }
  return collectCommerceOptions(currentPoi, currentPoi.subObjects);
}

function nearbyGroundItems(snapshot, position) {
  return (snapshot.world?.groundItems ?? [])
    .filter((item) => distance(position, item.position) <= GROUND_ITEM_PICKUP_RADIUS)
    .map((item) => ({
      id: item.id,
      item: item.item,
      position: item.position,
      droppedAt: item.droppedAt ?? null,
      droppedBy: item.droppedBy ?? null,
    }));
}

export function nearbyAffordancesForPosition(worldMap, position) {
  const currentPoi = currentPoiForPosition(worldMap?.pois ?? [], position);
  if (!currentPoi) {
    return [];
  }
  return collectAffordances(currentPoi, currentPoi.subObjects);
}

function conversationForPlayer(snapshot, playerId) {
  return (
    snapshot.world.conversations.find((conversation) =>
      conversation.participants.some((p) => p.playerId === playerId),
    ) ?? null
  );
}

function conversationState(snapshot, playerId) {
  const conversation = conversationForPlayer(snapshot, playerId);
  if (!conversation) {
    return null;
  }
  const participant = conversation.participants.find((p) => p.playerId === playerId);
  return {
    id: conversation.id,
    status: participant?.status ?? null,
    participantIds: conversation.participants.map((p) => p.playerId),
    lastMessage: conversation.lastMessage ?? null,
    numMessages: conversation.numMessages ?? 0,
  };
}

function activeUntil(item, now) {
  return item && item.until > now ? item : null;
}

function playerState(snapshot, player, now) {
  return {
    activity: activeUntil(player.activity, now),
    objectUse: activeUntil(player.objectUse, now),
    pathfindingDestination: player.pathfinding?.destination ?? null,
    conversation: conversationState(snapshot, player.id),
    lastInput: player.lastInput ?? null,
  };
}

function nearbyPlayers(snapshot, player, currentPoi, now) {
  const players = snapshot.world.players ?? [];
  return players
    .filter((other) => other.id !== player.id)
    .filter((other) => {
      if (currentPoi && inBbox(other.position, currentPoi.bbox)) {
        return true;
      }
      return distance(player.position, other.position) <= NEARBY_PLAYER_DISTANCE_TILES;
    })
    .map((other) => {
      const desc = playerDescription(snapshot, other.id);
      const agentDesc = agentDescriptionForPlayer(snapshot, other.id);
      return {
        id: other.id,
        name: desc?.name ?? other.id,
        description: desc?.description ?? null,
        isHuman: !!other.human,
        position: other.position,
        profession: agentDesc?.profession ?? null,
        homeName: agentDesc?.homeName ?? null,
        state: playerState(snapshot, other, now),
      };
    });
}

function objectUsers(snapshot, player, currentPoi, now) {
  const players = snapshot.world.players ?? [];
  return players
    .filter((other) => activeUntil(other.objectUse, now))
    .filter((other) => {
      if (currentPoi && inBbox(other.position, currentPoi.bbox)) {
        return true;
      }
      return distance(player.position, other.position) <= NEARBY_PLAYER_DISTANCE_TILES;
    })
    .map((other) => {
      const desc = playerDescription(snapshot, other.id);
      const use = other.objectUse;
      return {
        playerId: other.id,
        playerName: desc?.name ?? other.id,
        position: other.position,
        objectRef: use.objectRef,
        objectName: use.objectName,
        affordanceId: use.affordanceId,
        affordanceName: use.affordanceName,
        description: use.description,
        until: use.until,
      };
    });
}

function compactPoi(poi) {
  if (!poi) {
    return null;
  }
  return {
    id: poi.id,
    name: poi.name,
    kind: poi.kind,
    description: poi.description,
    bbox: poi.bbox,
  };
}

function normalizeMessages(messages) {
  return (messages ?? []).map((message) => ({
    authorName: message.authorName ?? message.author ?? null,
    text: message.text,
  }));
}

function followScheduleGoal(now, block, scheduled, scheduledPoi, atScheduledPoi) {
  const place = scheduledPoi?.name ?? scheduled?.poi ?? null;
  const description =
    scheduled?.activity && place
      ? `Follow schedule: ${scheduled.activity} at ${place}`
      : scheduled?.activity
        ? `Follow schedule: ${scheduled.activity}`
        : place
          ? `Follow schedule at ${place}`
          : `Follow schedule for ${block}`;
  const target = {};
  if (scheduled?.poi) {
    target.poiId = scheduled.poi;
  }
  if (scheduled?.activity) {
    target.activityDescription = scheduled.activity;
  }
  return {
    kind: 'followSchedule',
    description,
    rationale: atScheduledPoi
      ? `The current schedule block is ${block}, and this character is at the scheduled place.`
      : `The current schedule block is ${block}.`,
    source: 'schedule',
    created: now,
    expiresAt: scheduleBlockEnd(now),
    priority: 0,
    target: Object.keys(target).length > 0 ? target : null,
  };
}

function currentGoalForContext(agent, now, block, scheduled, scheduledPoi, atScheduledPoi) {
  const explicitIntent = activeExplicitIntent(agent?.intent, now);
  return explicitIntent ?? followScheduleGoal(now, block, scheduled, scheduledPoi, atScheduledPoi);
}

function goalStatusForContext(agent, currentGoal, scheduled, currentPoi, player, now) {
  const explicitIntent = activeExplicitIntent(agent?.intent, now);
  const targetPoiId = explicitIntent?.target?.poiId ?? null;
  const scheduleConflict =
    !!explicitIntent &&
    !!scheduled?.poi &&
    (targetPoiId ? targetPoiId !== scheduled.poi : currentPoi?.id !== scheduled.poi);
  return {
    hasExplicitIntent: !!explicitIntent,
    expiredExplicitIntent: !!agent?.intent && !explicitIntent,
    scheduleConflict,
    movementReason: player.pathfinding?.destination ? currentGoal.description : null,
  };
}

export function dedupeMemories(memoryLists, max = MAX_CONTEXT_MEMORIES) {
  const seen = new Set();
  const result = [];
  for (const memory of memoryLists.flat()) {
    if (!memory || seen.has(memory.id)) {
      continue;
    }
    seen.add(memory.id);
    result.push(memory);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

export function buildAgentContext(snapshot, args, extras = {}) {
  const player = args.player ?? findById(snapshot.world.players, args.playerId, 'player');
  const agent = args.agent ?? snapshot.world.agents.find((a) => a.playerId === player.id);
  const agentId = args.agentId ?? agent?.id;
  if (!agentId) {
    throw new Error(`Missing agent for player ${player.id}`);
  }
  const self = buildSelfFacts(snapshot, player.id, agentId);
  const now = snapshot.engine?.currentTime ?? Date.now();
  const block = args.scheduledBlock ?? gameTimeOfDay(now);
  const scheduled = self.schedule.find((s) => s.block === block) ?? null;
  const scheduledPoi = scheduled
    ? ((snapshot.worldMap.pois ?? []).find((p) => p.id === scheduled.poi) ?? null)
    : null;
  const currentPoi = currentPoiForPosition(snapshot.worldMap.pois ?? [], player.position);
  const nearbyAffordances = nearbyAffordancesForPosition(snapshot.worldMap, player.position);
  const inventory = normalizeInventory(player.inventory);
  const coins = normalizeCoins(player.coins);
  const atScheduledPoi =
    args.atScheduledPoi ?? !!(scheduledPoi && inBbox(player.position, scheduledPoi.bbox));
  const explicitIntent = activeExplicitIntent(agent?.intent, now);
  const currentGoal = currentGoalForContext(
    agent,
    now,
    block,
    scheduled,
    scheduledPoi,
    atScheduledPoi,
  );
  return {
    self,
    currentTime: now,
    position: player.position,
    inventory,
    coins,
    currentPoi: compactPoi(currentPoi),
    explicitIntent,
    currentGoal,
    goalStatus: goalStatusForContext(agent, currentGoal, scheduled, currentPoi, player, now),
    schedule: {
      currentBlock: block,
      scheduledActivity: args.scheduledActivity ?? scheduled?.activity ?? null,
      scheduledPoi: args.scheduledPoi ?? scheduled?.poi ?? null,
      atScheduledPoi,
    },
    surroundings: {
      nearbyAffordances,
      nearbyPlayers: nearbyPlayers(snapshot, player, currentPoi, now),
      objectUsers: objectUsers(snapshot, player, currentPoi, now),
      nearbyGroundItems: nearbyGroundItems(snapshot, player.position),
      portableObjects: portableObjectsForPosition(snapshot, player.position),
      commerceOptions: commerceOptionsForPosition(snapshot.worldMap, player.position),
      map: {
        width: snapshot.worldMap.width,
        height: snapshot.worldMap.height,
      },
    },
    state: playerState(snapshot, player, now),
    recentConversationMessages: normalizeMessages(extras.recentConversationMessages),
    relatedMemories: extras.relatedMemories ?? [],
  };
}

function memoryQueriesForContext(context, recipientName) {
  const queries = [];
  if (recipientName) {
    queries.push(`Conversation with ${recipientName}`);
  }
  if (context.currentPoi?.name) {
    queries.push(`At ${context.currentPoi.name}`, context.currentPoi.name);
  }
  for (const player of context.surroundings.nearbyPlayers) {
    if (player.name && player.name !== recipientName) {
      queries.push(`Conversation with ${player.name}`);
    }
  }
  return [...new Set(queries)].slice(0, 5);
}

async function fetchContextMemories(context, playerId, deps, recipientName) {
  const queries = memoryQueriesForContext(context, recipientName);
  const memoryLists = await Promise.all(
    queries.map(async (query) => {
      const text = mcpText(
        await deps.callTool('aitown.search_memories', {
          playerId,
          query,
          limit: MEMORY_SEARCH_LIMIT,
        }),
      );
      return JSON.parse(text);
    }),
  );
  return dedupeMemories(memoryLists);
}

function defaultDeps() {
  return {
    callTool: serverCallTool,
    llmSchema,
    conversationMessages,
    recentMemories,
  };
}

function occupiedInventorySlots(context) {
  return context.inventory
    .map((item, slotIndex) => (item ? { item, slotIndex } : null))
    .filter(Boolean);
}

function hasEmptyInventorySlot(context) {
  return context.inventory.some((item) => item === null);
}

function pickupOptionIds(context) {
  if (!hasEmptyInventorySlot(context)) {
    return [];
  }
  return [
    ...context.surroundings.portableObjects.map((item) => `poi:${item.objectRef}`),
    ...context.surroundings.nearbyGroundItems.map((item) => `ground:${item.id}`),
  ];
}

function buyOptionIds(context) {
  if (!hasEmptyInventorySlot(context)) {
    return [];
  }
  return context.surroundings.commerceOptions.flatMap((commerce) =>
    commerce.buy
      .filter((item) => item.price <= context.coins)
      .map((item) => `${commerce.objectRef}#${item.itemId}`),
  );
}

function sellOptionIds(context) {
  return context.surroundings.commerceOptions.flatMap((commerce) =>
    occupiedInventorySlots(context)
      .filter(({ item }) => {
        const sellPrice = item.sellPrice ?? 0;
        return sellPrice > 0 && item.tags?.some((tag) => commerce.sellTags.includes(tag));
      })
      .map(({ slotIndex }) => `${commerce.objectRef}#slot-${slotIndex}`),
  );
}

function enumStringOrNull(ids) {
  return ids.length > 0
    ? { anyOf: [{ type: 'string', enum: ids }, { type: 'null' }] }
    : { type: 'null' };
}

function doSomethingSchema(args, context) {
  const freeIds = args.otherFreePlayers.map((p) => p.id);
  const hasFree = freeIds.length > 0;
  const nearbyAffordanceIds = context.surroundings.nearbyAffordances.map((a) => a.id);
  const hasAffordances = nearbyAffordanceIds.length > 0;
  const pickupIds = pickupOptionIds(context);
  const putDownSlots = occupiedInventorySlots(context).map(({ slotIndex }) => slotIndex);
  const buyIds = buyOptionIds(context);
  const sellIds = sellOptionIds(context);
  const actionEnum = ['wander', 'activity'];
  if (hasFree) {
    actionEnum.push('invite');
  }
  if (hasAffordances) {
    actionEnum.push('useObject');
  }
  if (pickupIds.length > 0) {
    actionEnum.push('pickUpItem');
  }
  if (putDownSlots.length > 0) {
    actionEnum.push('putDownItem');
  }
  if (buyIds.length > 0) {
    actionEnum.push('buyItem');
  }
  if (sellIds.length > 0) {
    actionEnum.push('sellItem');
  }
  const inviteeProperty = hasFree
    ? { anyOf: [{ type: 'string', enum: freeIds }, { type: 'null' }] }
    : { type: 'null' };
  const useObjectProperty = enumStringOrNull(nearbyAffordanceIds);
  const putDownSlotProperty =
    putDownSlots.length > 0
      ? { anyOf: [{ type: 'integer', enum: putDownSlots }, { type: 'null' }] }
      : { type: 'null' };
  return {
    type: 'object',
    properties: {
      action: { type: 'string', enum: actionEnum },
      x: { type: ['integer', 'null'] },
      y: { type: ['integer', 'null'] },
      description: { type: ['string', 'null'] },
      emoji: { type: ['string', 'null'] },
      durationMs: { type: ['integer', 'null'] },
      invitee: inviteeProperty,
      useObject: useObjectProperty,
      pickUpItem: enumStringOrNull(pickupIds),
      putDownSlot: putDownSlotProperty,
      buyItem: enumStringOrNull(buyIds),
      sellItem: enumStringOrNull(sellIds),
    },
    required: [
      'action',
      'x',
      'y',
      'description',
      'emoji',
      'durationMs',
      'invitee',
      'useObject',
      'pickUpItem',
      'putDownSlot',
      'buyItem',
      'sellItem',
    ],
    additionalProperties: false,
  };
}

export async function handleDoSomething(operation, snapshot, deps = defaultDeps()) {
  const args = operation.args;
  const baseContext = buildAgentContext(snapshot, args);
  const relatedMemories = await fetchContextMemories(baseContext, args.player.id, deps);
  const currentContext = buildAgentContext(snapshot, args, { relatedMemories });
  const schema = doSomethingSchema(args, currentContext);
  const nearbyAffordances = currentContext.surroundings.nearbyAffordances;
  const pickupIds = pickupOptionIds(currentContext);
  const buyIds = buyOptionIds(currentContext);
  const sellIds = sellOptionIds(currentContext);
  const decision = await deps.llmSchema(
    [
      {
        role: 'system',
        content:
          'You are roleplaying an NPC in AI Town. Pick exactly one action — wander, activity, invite, useObject, pickUpItem, putDownItem, buyItem, or sellItem. Fill the fields for the chosen action and set the others to null. Treat currentContext as factual. Prioritize currentContext.currentGoal, especially explicit reflection or conversation goals, unless the available actions cannot satisfy it yet. For wander, x and y must be integer tile coordinates inside the map bounds. For activity, choose a description and emoji — the activity automatically runs until the end of the current schedule block, do not pick a duration. For useObject, choose one listed currentContext.surroundings.nearbyAffordances id and optionally set durationMs (5000-600000). For pickUpItem, buyItem, sellItem, and putDownItem, choose only an id or slot listed in the schema and currentContext; do not invent items, money, shop stock, or inventory slots. Use currentContext.surroundings.objectUsers as factual present-tense perception of who is using nearby objects. Use your character facts, schedule, surroundings, inventory, coins, memories, goals, and current state to make a choice in character.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentContext,
          otherFreePlayers: args.otherFreePlayers.map((p) => {
            const desc = snapshot.playerDescriptions.find((d) => d.playerId === p.id);
            return { id: p.id, name: desc?.name, position: p.position };
          }),
        }),
      },
    ],
    schema,
    'do_something_decision',
  );
  const {
    action,
    x,
    y,
    description,
    emoji,
    durationMs,
    invitee,
    useObject,
    pickUpItem,
    putDownSlot,
    buyItem,
    sellItem,
  } = decision;
  if (action === 'wander') {
    if (x == null || y == null) {
      throw new Error('wander action missing x or y');
    }
    await deps.callTool('aitown.do_wander', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      x,
      y,
    });
  } else if (action === 'activity') {
    if (!description) {
      throw new Error('activity action missing description');
    }
    await deps.callTool('aitown.do_activity', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      description,
      emoji: emoji ?? undefined,
    });
  } else if (action === 'invite') {
    if (!invitee) {
      throw new Error('invite action missing invitee');
    }
    await deps.callTool('aitown.do_invite', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      invitee,
    });
  } else if (action === 'useObject') {
    if (!useObject) {
      throw new Error('useObject action missing selected affordance');
    }
    const selected = nearbyAffordances.find((item) => item.id === useObject);
    if (!selected) {
      throw new Error(`useObject action selected unavailable affordance ${useObject}`);
    }
    await deps.callTool('aitown.do_use_object', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      objectRef: selected.objectRef,
      affordanceId: selected.affordanceId,
      durationMs: durationMs ?? selected.defaultDurationMs,
    });
  } else if (action === 'pickUpItem') {
    if (!pickUpItem || !pickupIds.includes(pickUpItem)) {
      throw new Error(`pickUpItem action selected unavailable item ${pickUpItem}`);
    }
    if (pickUpItem.startsWith('poi:')) {
      await deps.callTool('aitown.do_pick_up_item', {
        worldId: operation.worldId,
        agentId: args.agent.id,
        operationId: operation.operationId,
        sourceKind: 'poiObject',
        objectRef: pickUpItem.slice('poi:'.length),
      });
    } else if (pickUpItem.startsWith('ground:')) {
      await deps.callTool('aitown.do_pick_up_item', {
        worldId: operation.worldId,
        agentId: args.agent.id,
        operationId: operation.operationId,
        sourceKind: 'groundItem',
        groundItemId: pickUpItem.slice('ground:'.length),
      });
    } else {
      throw new Error(`pickUpItem action selected invalid source ${pickUpItem}`);
    }
  } else if (action === 'putDownItem') {
    if (!Number.isInteger(putDownSlot)) {
      throw new Error('putDownItem action missing slot');
    }
    await deps.callTool('aitown.do_put_down_item', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      slotIndex: putDownSlot,
    });
  } else if (action === 'buyItem') {
    if (!buyItem || !buyIds.includes(buyItem)) {
      throw new Error(`buyItem action selected unavailable item ${buyItem}`);
    }
    const splitAt = buyItem.lastIndexOf('#');
    await deps.callTool('aitown.do_buy_item', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      objectRef: buyItem.slice(0, splitAt),
      itemId: buyItem.slice(splitAt + 1),
    });
  } else if (action === 'sellItem') {
    if (!sellItem || !sellIds.includes(sellItem)) {
      throw new Error(`sellItem action selected unavailable slot ${sellItem}`);
    }
    const splitAt = sellItem.lastIndexOf('#slot-');
    await deps.callTool('aitown.do_sell_item', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      objectRef: sellItem.slice(0, splitAt),
      slotIndex: Number(sellItem.slice(splitAt + '#slot-'.length)),
    });
  } else {
    throw new Error(`agentDoSomething: unexpected action ${action}`);
  }
}

export async function handleInvite(operation, snapshot, deps = defaultDeps()) {
  const args = operation.args;
  let chosen;
  if (args.otherPlayerIsHuman) {
    chosen = 'accept';
  } else {
    const otherDescription = findById(
      snapshot.playerDescriptions,
      args.otherPlayerId,
      'other player description',
    );
    const baseContext = buildAgentContext(snapshot, args);
    const relatedMemories = await fetchContextMemories(
      baseContext,
      args.playerId,
      deps,
      otherDescription.name,
    );
    const currentContext = buildAgentContext(snapshot, args, { relatedMemories });
    const schema = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['accept', 'reject'] },
      },
      required: ['action'],
      additionalProperties: false,
    };
    const decision = await deps.llmSchema(
      [
        {
          role: 'system',
          content:
            'You are an NPC in AI Town who just received a conversation invite. Decide accept or reject and return JSON matching the schema. Treat currentContext as factual. Lean on your character facts, relationships, memories, schedule, current state, and surroundings to decide.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentContext,
            inviter: otherDescription,
            inviterIsFriend: currentContext.self.friends.includes(otherDescription.name),
            inviterIsFamily: currentContext.self.family.some(
              (f) => f.name === otherDescription.name,
            ),
          }),
        },
      ],
      schema,
      'invite_decision',
    );
    if (decision.action !== 'accept' && decision.action !== 'reject') {
      throw new Error(`agentHandleInvite: unexpected action ${decision.action}`);
    }
    chosen = decision.action;
  }
  await deps.callTool(`aitown.handle_invite_${chosen}`, {
    worldId: operation.worldId,
    agentId: args.agentId,
    operationId: operation.operationId,
    playerId: args.playerId,
    conversationId: args.conversationId,
  });
}

export async function handleGenerateMessage(operation, snapshot, deps = defaultDeps()) {
  const args = operation.args;
  const otherPlayer = findById(snapshot.world.players, args.otherPlayerId, 'other player');
  const otherDescription = findById(
    snapshot.playerDescriptions,
    args.otherPlayerId,
    'other player description',
  );
  const messages = await deps.conversationMessages(args.worldId, args.conversationId);
  const baseContext = buildAgentContext(snapshot, args, { recentConversationMessages: messages });
  const relatedMemories = await fetchContextMemories(
    baseContext,
    args.playerId,
    deps,
    otherDescription.name,
  );
  const currentContext = buildAgentContext(snapshot, args, {
    recentConversationMessages: messages,
    relatedMemories,
  });
  const recipientIsFriend = currentContext.self.friends.includes(otherDescription.name);
  const recipientIsFamily = currentContext.self.family.find(
    (f) => f.name === otherDescription.name,
  );
  const verb =
    args.type === 'leave'
      ? 'politely end the conversation'
      : args.type === 'start'
        ? 'start the conversation'
        : 'continue the conversation';
  const schema = {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
    additionalProperties: false,
  };
  const decision = await deps.llmSchema(
    [
      {
        role: 'system',
        content: `You are roleplaying an NPC in AI Town. Write exactly one short in-character chat line (under 280 characters) to ${verb}. Treat currentContext as factual. Answer direct questions directly and follow the other speaker's topic. If asked about nearby objects, answer only from currentContext.surroundings.nearbyAffordances. If asked about people using objects, answer only from currentContext.surroundings.objectUsers. If asked about inventory, money, nearby items, or shop stock, answer only from currentContext.inventory, currentContext.coins, currentContext.surroundings.nearbyGroundItems, currentContext.surroundings.portableObjects, and currentContext.surroundings.commerceOptions. Do not invent map objects, places, people, memories, inventory items, money, shop stock, or prior actions. If currentContext has no matching facts, say so naturally in character. Do not force your profession, goal, belief, scheme, science, hobby, family, or other core trait into every reply; bring those up only when relevant or asked. No narration, no markdown. Return JSON with a single field "text".`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: verb,
          currentContext,
          recipient: {
            id: otherPlayer.id,
            name: otherDescription.name,
            description: otherDescription.description,
            isHuman: !!otherPlayer.human,
            isFriend: recipientIsFriend,
            familyRelation: recipientIsFamily ? recipientIsFamily.kind : null,
          },
          messageType: args.type,
        }),
      },
    ],
    schema,
    'message',
  );
  await deps.callTool('aitown.compose_message', {
    worldId: operation.worldId,
    conversationId: args.conversationId,
    agentId: args.agentId,
    playerId: args.playerId,
    operationId: operation.operationId,
    text: decision.text,
    leaveConversation: args.type === 'leave',
  });
}

function nullableEnum(values) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length > 0
    ? { anyOf: [{ type: 'string', enum: unique }, { type: 'null' }] }
    : { type: 'null' };
}

function nullableIntegerEnum(values) {
  const unique = [...new Set(values.filter(Number.isInteger))];
  return unique.length > 0
    ? { anyOf: [{ type: 'integer', enum: unique }, { type: 'null' }] }
    : { type: 'null' };
}

function allAffordances(snapshot) {
  return (snapshot.worldMap?.pois ?? []).flatMap((poi) => collectAffordances(poi, poi.subObjects));
}

function reflectionIntentSchema(snapshot, currentContext) {
  const affordances = allAffordances(snapshot);
  const commerceOptions = (snapshot.worldMap?.pois ?? []).flatMap((poi) =>
    collectCommerceOptions(poi, poi.subObjects),
  );
  const objectRefs = [
    ...affordances.map((item) => item.objectRef),
    ...currentContext.surroundings.portableObjects.map((item) => item.objectRef),
    ...commerceOptions.map((item) => item.objectRef),
  ];
  const itemIds = [
    ...currentContext.inventory.filter(Boolean).map((item) => item.itemId),
    ...currentContext.surroundings.nearbyGroundItems.map((item) => item.item.itemId),
    ...currentContext.surroundings.portableObjects.map((item) => item.item.itemId),
    ...commerceOptions.flatMap((item) => item.buy.map((buy) => buy.itemId)),
  ];
  const targetSchema = {
    type: 'object',
    properties: {
      playerId: nullableEnum(snapshot.world.players.map((player) => player.id)),
      poiId: nullableEnum((snapshot.worldMap?.pois ?? []).map((poi) => poi.id)),
      objectRef: nullableEnum(objectRefs),
      affordanceId: nullableEnum(affordances.map((item) => item.affordanceId)),
      itemId: nullableEnum(itemIds),
      slotIndex: nullableIntegerEnum(currentContext.inventory.map((_, index) => index)),
      activityDescription: { type: ['string', 'null'] },
    },
    required: [
      'playerId',
      'poiId',
      'objectRef',
      'affordanceId',
      'itemId',
      'slotIndex',
      'activityDescription',
    ],
    additionalProperties: false,
  };
  return {
    type: 'object',
    properties: {
      reflections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            insight: { type: 'string' },
            statementIds: { type: 'array', items: { type: 'integer' } },
            importance: { type: 'integer', minimum: 1, maximum: 10 },
          },
          required: ['insight', 'statementIds', 'importance'],
          additionalProperties: false,
        },
      },
      nextIntent: {
        anyOf: [
          {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: REFLECTION_INTENT_KINDS },
              description: { type: 'string' },
              rationale: { type: 'string' },
              source: { type: 'string', enum: REFLECTION_INTENT_SOURCES },
              durationMs: { type: 'integer', minimum: 60_000, maximum: 3_600_000 },
              priority: { type: 'integer', minimum: 1, maximum: 10 },
              target: { anyOf: [targetSchema, { type: 'null' }] },
            },
            required: [
              'kind',
              'description',
              'rationale',
              'source',
              'durationMs',
              'priority',
              'target',
            ],
            additionalProperties: false,
          },
          { type: 'null' },
        ],
      },
    },
    required: ['reflections', 'nextIntent'],
    additionalProperties: false,
  };
}

function normalizeNextIntent(nextIntent, now) {
  if (!nextIntent) {
    return null;
  }
  const target = {};
  for (const [key, value] of Object.entries(nextIntent.target ?? {})) {
    if (value !== null && value !== undefined && value !== '') {
      target[key] = value;
    }
  }
  return {
    kind: nextIntent.kind,
    description: nextIntent.description,
    rationale: nextIntent.rationale,
    source: nextIntent.source,
    created: now,
    expiresAt: now + nextIntent.durationMs,
    priority: nextIntent.priority,
    target: Object.keys(target).length > 0 ? target : undefined,
  };
}

export async function handleReflect(operation, snapshot, deps = defaultDeps()) {
  const args = operation.args;
  const { name, memories } = await deps.recentMemories(args.worldId, args.playerId);
  const currentContext = snapshot ? buildAgentContext(snapshot, args) : null;
  if (!memories || memories.length === 0) {
    // Nothing to reflect on yet; just finish the op.
    await deps.callTool('aitown.save_reflections', {
      worldId: args.worldId,
      agentId: args.agentId,
      playerId: args.playerId,
      operationId: operation.operationId,
      reflections: [],
      nextIntent: null,
    });
    return;
  }
  const schema = reflectionIntentSchema(snapshot, currentContext);
  const result = await deps.llmSchema(
    [
      {
        role: 'system',
        content:
          'You are roleplaying an NPC who just finished a conversation. Treat currentContext as factual. Look at recent statements and produce up to 3 high-level insights about yourself, others, or the town. Each insight cites the statementIds it draws from. Importance is 1 (trivial) to 10 (life-changing). Also decide whether the conversation implies one concrete nextIntent: actionable information, a request, a risk, or a social obligation should usually become a goal. Examples: if someone says "I am sick", a plausible nextIntent could be stayAtPoi, avoidPlayer, talkToPlayer to notify a friend, or activity such as making soup, depending on your character and currentContext. Use only playerId, poiId, objectRef, affordanceId, itemId, and slotIndex values allowed by currentContext/schema. Do not invent players, POIs, objects, inventory items, shop stock, or money. Use nextIntent null when nothing actionable follows.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          you: name,
          currentContext,
          statements: memories.map((m, idx) => ({
            id: idx,
            text: m.description,
            type: m.type,
          })),
        }),
      },
    ],
    schema,
    'reflections',
  );
  const reflections = (result.reflections ?? [])
    .slice(0, 3)
    .map((r) => ({
      description: r.insight,
      importance: r.importance,
      relatedMemoryIds: (r.statementIds ?? [])
        .filter((i) => Number.isInteger(i) && i >= 0 && i < memories.length)
        .map((i) => memories[i].id),
    }))
    .filter((r) => r.description && r.description.length > 0);
  const nextIntent = normalizeNextIntent(result.nextIntent, currentContext.currentTime);
  await deps.callTool('aitown.save_reflections', {
    worldId: args.worldId,
    agentId: args.agentId,
    playerId: args.playerId,
    operationId: operation.operationId,
    reflections,
    nextIntent,
  });
}

async function tryFailOperation(operationId, error) {
  try {
    await withTimeout(
      serverCallTool('aitown.fail_agent_operation', {
        operationId,
        error: error instanceof Error ? error.message : String(error),
      }),
      CONVEX_CALL_TIMEOUT_MS,
      'fail_agent_operation',
    );
  } catch (failError) {
    if (!isWipeRaceError(failError)) {
      console.error('fail_agent_operation:', failError.message ?? failError);
    }
  }
}

async function processOperation(operation) {
  await withTimeout(
    serverCallTool('aitown.claim_agent_operation', { operationId: operation.operationId }),
    CONVEX_CALL_TIMEOUT_MS,
    'claim_agent_operation',
  );
  try {
    const snapshot = await withTimeout(
      worldSnapshot(operation.worldId),
      CONVEX_CALL_TIMEOUT_MS,
      'worldSnapshot',
    );
    if (operation.name === 'agentRememberConversation') {
      await serverCallTool('aitown.remember_conversation', operation.args);
    } else if (operation.name === 'agentGenerateMessage') {
      await handleGenerateMessage(operation, snapshot);
    } else if (operation.name === 'agentDoSomething') {
      await handleDoSomething(operation, snapshot);
    } else if (operation.name === 'agentHandleInvite') {
      await handleInvite(operation, snapshot);
    } else if (operation.name === 'agentReflect') {
      await handleReflect(operation, snapshot);
    } else {
      throw new Error(`Unknown MCP agent operation: ${operation.name}`);
    }
    await withTimeout(
      serverCallTool('aitown.complete_agent_operation', { operationId: operation.operationId }),
      CONVEX_CALL_TIMEOUT_MS,
      'complete_agent_operation',
    );
  } catch (error) {
    if (!isWipeRaceError(error)) {
      await tryFailOperation(operation.operationId, error);
    }
    throw error;
  }
}

async function runOnce() {
  const operations = await withTimeout(
    pendingOperations(),
    CONVEX_CALL_TIMEOUT_MS,
    'pendingOperations',
  );
  if (operations.length === 0) {
    return false;
  }
  await withTimeout(processOperation(operations[0]), OPERATION_TIMEOUT_MS, 'processOperation');
  return true;
}

async function main() {
  requireConfig();
  while (true) {
    try {
      const paused = await withTimeout(runnerPaused(), CONVEX_CALL_TIMEOUT_MS, 'runnerPaused');
      if (paused) {
        await sleep(LOOP_INTERVAL_MS);
        continue;
      }
      await runOnce();
    } catch (error) {
      if (isWipeRaceError(error)) {
        resetConvexClient();
      } else {
        console.error(error instanceof Error ? error.message : error);
        resetConvexClient();
      }
    }
    await sleep(LOOP_INTERVAL_MS);
  }
}

function isMainModule() {
  return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  void main();
}
