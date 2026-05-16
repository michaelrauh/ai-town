#!/usr/bin/env node

import dotenv from 'dotenv';
import { callTool, readResource, resetConvexClient, runnerPaused } from './server.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
const LOOP_INTERVAL_MS = Number(process.env.MCP_AGENT_RUNNER_INTERVAL_MS ?? 1000);
const CONVEX_CALL_TIMEOUT_MS = Number(process.env.MCP_CONVEX_TIMEOUT_MS ?? 30_000);
const OPERATION_TIMEOUT_MS = Number(process.env.MCP_OPERATION_TIMEOUT_MS ?? 90_000);

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
  return resourceJson(await readResource('aitown://agent-operations/pending'));
}

async function worldSnapshot(worldId) {
  return resourceJson(await readResource(`aitown://world/${worldId}/snapshot`));
}

async function conversationMessages(worldId, conversationId) {
  return resourceJson(
    await readResource(`aitown://conversation/${worldId}/${conversationId}/messages`),
  );
}

async function recentMemories(worldId, playerId) {
  return resourceJson(await readResource(`aitown://memories/${worldId}/${playerId}/recent`));
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

function doSomethingSchema(args) {
  const freeIds = args.otherFreePlayers.map((p) => p.id);
  const hasFree = freeIds.length > 0;
  const actionEnum = hasFree ? ['wander', 'activity', 'invite'] : ['wander', 'activity'];
  const inviteeProperty = hasFree
    ? { anyOf: [{ type: 'string', enum: freeIds }, { type: 'null' }] }
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
    },
    required: ['action', 'x', 'y', 'description', 'emoji', 'durationMs', 'invitee'],
    additionalProperties: false,
  };
}

async function handleDoSomething(operation, snapshot) {
  const args = operation.args;
  const schema = doSomethingSchema(args);
  const self = buildSelfFacts(snapshot, args.player.id, args.agent.id);
  const decision = await llmSchema(
    [
      {
        role: 'system',
        content:
          'You are roleplaying an NPC in AI Town. Pick exactly one action — wander, activity, or invite. Fill the fields for the chosen action and set the others to null. For wander, x and y must be integer tile coordinates inside the map bounds. For activity, durationMs is 5000-600000. Use your character facts (profession, home, family, friends, daily schedule) to make a choice in character. Prefer doing your scheduled activity if you are at the scheduled location.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          self,
          position: args.player.position,
          currentBlock: args.scheduledBlock,
          scheduledActivity: args.scheduledActivity ?? null,
          scheduledPoi: args.scheduledPoi ?? null,
          atScheduledPoi: !!args.atScheduledPoi,
          otherFreePlayers: args.otherFreePlayers.map((p) => {
            const desc = snapshot.playerDescriptions.find((d) => d.playerId === p.id);
            return { id: p.id, name: desc?.name, position: p.position };
          }),
          map: { width: args.map.width, height: args.map.height },
        }),
      },
    ],
    schema,
    'do_something_decision',
  );
  const { action, x, y, description, emoji, durationMs, invitee } = decision;
  if (action === 'wander') {
    if (x == null || y == null) {
      throw new Error('wander action missing x or y');
    }
    await callTool('aitown.do_wander', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      x,
      y,
    });
  } else if (action === 'activity') {
    if (!description || durationMs == null) {
      throw new Error('activity action missing description or durationMs');
    }
    await callTool('aitown.do_activity', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      description,
      emoji: emoji ?? undefined,
      durationMs,
    });
  } else if (action === 'invite') {
    if (!invitee) {
      throw new Error('invite action missing invitee');
    }
    await callTool('aitown.do_invite', {
      worldId: operation.worldId,
      agentId: args.agent.id,
      operationId: operation.operationId,
      invitee,
    });
  } else {
    throw new Error(`agentDoSomething: unexpected action ${action}`);
  }
}

async function handleInvite(operation, snapshot) {
  const args = operation.args;
  let chosen;
  if (args.otherPlayerIsHuman) {
    chosen = 'accept';
  } else {
    const self = buildSelfFacts(snapshot, args.playerId, args.agentId);
    const otherDescription = findById(
      snapshot.playerDescriptions,
      args.otherPlayerId,
      'other player description',
    );
    const schema = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['accept', 'reject'] },
      },
      required: ['action'],
      additionalProperties: false,
    };
    const decision = await llmSchema(
      [
        {
          role: 'system',
          content:
            'You are an NPC in AI Town who just received a conversation invite. Decide accept or reject and return JSON matching the schema. Lean on your character facts (especially family and friends) to decide.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            self,
            inviter: otherDescription,
            inviterIsFriend: self.friends.includes(otherDescription.name),
            inviterIsFamily: self.family.some((f) => f.name === otherDescription.name),
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
  await callTool(`aitown.handle_invite_${chosen}`, {
    worldId: operation.worldId,
    agentId: args.agentId,
    operationId: operation.operationId,
    playerId: args.playerId,
    conversationId: args.conversationId,
  });
}

async function handleGenerateMessage(operation, snapshot) {
  const args = operation.args;
  const otherPlayer = findById(snapshot.world.players, args.otherPlayerId, 'other player');
  const otherDescription = findById(
    snapshot.playerDescriptions,
    args.otherPlayerId,
    'other player description',
  );
  const self = buildSelfFacts(snapshot, args.playerId, args.agentId);
  const messages = await conversationMessages(args.worldId, args.conversationId);
  const memoryText = mcpText(
    await callTool('aitown.search_memories', {
      playerId: args.playerId,
      query: `Conversation with ${otherDescription.name}`,
      limit: 3,
    }),
  );
  const recipientIsFriend = self.friends.includes(otherDescription.name);
  const recipientIsFamily = self.family.find((f) => f.name === otherDescription.name);
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
  const decision = await llmSchema(
    [
      {
        role: 'system',
        content: `You are roleplaying an NPC in AI Town. Write exactly one short in-character chat line (under 280 characters) to ${verb}. No narration, no markdown. Return JSON with a single field "text".`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: verb,
          self,
          recipient: {
            id: otherPlayer.id,
            name: otherDescription.name,
            description: otherDescription.description,
            isHuman: !!otherPlayer.human,
            isFriend: recipientIsFriend,
            familyRelation: recipientIsFamily ? recipientIsFamily.kind : null,
          },
          messageType: args.type,
          recentMessages: messages.map((message) => ({
            authorName: message.authorName,
            text: message.text,
          })),
          relatedMemories: JSON.parse(memoryText),
        }),
      },
    ],
    schema,
    'message',
  );
  await callTool('aitown.compose_message', {
    worldId: operation.worldId,
    conversationId: args.conversationId,
    agentId: args.agentId,
    playerId: args.playerId,
    operationId: operation.operationId,
    text: decision.text,
    leaveConversation: args.type === 'leave',
  });
}

async function handleReflect(operation) {
  const args = operation.args;
  const { name, memories } = await recentMemories(args.worldId, args.playerId);
  if (!memories || memories.length === 0) {
    // Nothing to reflect on yet; just finish the op.
    await callTool('aitown.save_reflections', {
      worldId: args.worldId,
      agentId: args.agentId,
      playerId: args.playerId,
      operationId: operation.operationId,
      reflections: [],
    });
    return;
  }
  const schema = {
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
    },
    required: ['reflections'],
    additionalProperties: false,
  };
  const result = await llmSchema(
    [
      {
        role: 'system',
        content:
          'You are roleplaying an NPC who just finished a conversation. Look at recent statements and produce up to 3 high-level insights about yourself, others, or the town. Each insight cites the statementIds it draws from. Importance is 1 (trivial) to 10 (life-changing).',
      },
      {
        role: 'user',
        content: JSON.stringify({
          you: name,
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
  await callTool('aitown.save_reflections', {
    worldId: args.worldId,
    agentId: args.agentId,
    playerId: args.playerId,
    operationId: operation.operationId,
    reflections,
  });
}

async function tryFailOperation(operationId, error) {
  try {
    await withTimeout(
      callTool('aitown.fail_agent_operation', {
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
    callTool('aitown.claim_agent_operation', { operationId: operation.operationId }),
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
      await callTool('aitown.remember_conversation', operation.args);
    } else if (operation.name === 'agentGenerateMessage') {
      await handleGenerateMessage(operation, snapshot);
    } else if (operation.name === 'agentDoSomething') {
      await handleDoSomething(operation, snapshot);
    } else if (operation.name === 'agentHandleInvite') {
      await handleInvite(operation, snapshot);
    } else if (operation.name === 'agentReflect') {
      await handleReflect(operation);
    } else {
      throw new Error(`Unknown MCP agent operation: ${operation.name}`);
    }
    await withTimeout(
      callTool('aitown.complete_agent_operation', { operationId: operation.operationId }),
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
      const paused = await withTimeout(
        runnerPaused(),
        CONVEX_CALL_TIMEOUT_MS,
        'runnerPaused',
      );
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

void main();
