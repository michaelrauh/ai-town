#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
const WAIT_FOR_INPUT_TIMEOUT_MS = Number(process.env.MCP_INPUT_TIMEOUT_MS ?? 10_000);
const WAIT_FOR_INPUT_POLL_MS = 250;

let convex;

function convexClient() {
  if (!CONVEX_URL) {
    throw new Error('Missing CONVEX_URL or VITE_CONVEX_URL for MCP server.');
  }
  convex ??= new ConvexHttpClient(CONVEX_URL);
  return convex;
}

export function resetConvexClient() {
  convex = undefined;
}

export async function runnerPaused() {
  return await convexClient().query(api.testing.getRunnerPaused);
}

function safeJson(value) {
  if (value instanceof ArrayBuffer) {
    return `<bytes:${value.byteLength}>`;
  }
  if (ArrayBuffer.isView(value)) {
    return `<bytes:${value.byteLength}>`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeJson(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeJson(item)]));
  }
  return value;
}

function textContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(safeJson(value), null, 2),
      },
    ],
  };
}

async function defaultWorldStatus() {
  const status = await convexClient().query(api.world.defaultWorldStatus);
  if (!status) {
    throw new Error('No default world exists. Run npm run predev or npm run dev first.');
  }
  return status;
}

async function defaultWorldId() {
  return (await defaultWorldStatus()).worldId;
}

async function worldBundle(worldId) {
  const client = convexClient();
  const [worldState, descriptions] = await Promise.all([
    client.query(api.world.worldState, { worldId }),
    client.query(api.world.gameDescriptions, { worldId }),
  ]);
  return { ...worldState, ...descriptions };
}

async function waitForInput(inputId) {
  const started = Date.now();
  while (Date.now() - started < WAIT_FOR_INPUT_TIMEOUT_MS) {
    const result = await convexClient().query(api.aiTown.main.inputStatus, { inputId });
    if (result) {
      if (result.kind === 'error') {
        throw new Error(result.message);
      }
      return result.value;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_FOR_INPUT_POLL_MS));
  }
  throw new Error(`Input ${inputId} was not processed within ${WAIT_FOR_INPUT_TIMEOUT_MS}ms.`);
}

async function callNarratorTool(name, args) {
  switch (name) {
    case 'aitown.claim_narrate_op': {
      const op = await convexClient().mutation(api.narrative.api.claimNextNarrateOp, {});
      return textContent(op);
    }
    case 'aitown.set_narrator_model':
      return textContent(
        await convexClient().mutation(api.narrative.api.setNarratorModel, {
          operationId: args.operationId,
          model: args.model,
        }),
      );
    case 'aitown.narrate':
      return await callRecordedNarratorTool('narrate', args, {
        operationId: args.operationId,
        tool: 'narrate',
        text: args.text,
      });
    case 'aitown.npc_speak':
      return await callRecordedNarratorTool('npc_speak', args, {
        operationId: args.operationId,
        tool: 'npc_speak',
        speaker: args.speaker,
        text: args.text,
      });
    case 'aitown.end_turn':
      return await callRecordedNarratorTool('end_turn', args, {
        operationId: args.operationId,
        tool: 'end_turn',
      });
    case 'aitown.fail_narrate_op':
      return textContent(
        await convexClient().mutation(api.narrative.api.failNarrateOp, {
          operationId: args.operationId,
          error: args.error,
        }),
      );
  }
  throw new Error(`callNarratorTool: unknown tool ${name}`);
}

async function callRecordedNarratorTool(tool, originalArgs, mutationArgs) {
  try {
    return textContent(await convexClient().mutation(api.narrative.api.narratorTool, mutationArgs));
  } catch (err) {
    await recordNarratorToolFailure(tool, originalArgs, err);
    throw err;
  }
}

async function recordNarratorToolFailure(tool, args, err) {
  if (!args?.operationId) return;
  try {
    await convexClient().mutation(api.narrative.api.recordNarratorToolFailure, {
      operationId: args.operationId,
      tool,
      args: safeJson(args),
      error: String(err?.message || err),
    });
  } catch {
    // Preserve the original tool error for the runner retry loop.
  }
}

async function sendInput(worldId, name, args) {
  const status = await defaultWorldStatus();
  const targetWorldId = worldId ?? status.worldId;
  if (targetWorldId !== status.worldId) {
    const inputId = await convexClient().mutation(api.aiTown.main.sendInput, {
      worldId: targetWorldId,
      name,
      args,
    });
    return await waitForInput(inputId);
  }
  const inputId = await convexClient().mutation(api.world.sendWorldInput, {
    engineId: status.engineId,
    name,
    args,
  });
  return await waitForInput(inputId);
}

export function tools() {
  return [
    {
      name: 'aitown.claim_agent_operation',
      description: 'Claim a queued autonomous NPC operation for the local MCP runner.',
      inputSchema: {
        type: 'object',
        properties: { operationId: { type: 'string' } },
        required: ['operationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.complete_agent_operation',
      description: 'Remove an MCP agent operation after its game-state input has completed.',
      inputSchema: {
        type: 'object',
        properties: { operationId: { type: 'string' } },
        required: ['operationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.fail_agent_operation',
      description: 'Mark an MCP agent operation failed without silently clearing the agent lock.',
      inputSchema: {
        type: 'object',
        properties: { operationId: { type: 'string' }, error: { type: 'string' } },
        required: ['operationId', 'error'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_wander',
      description:
        'Decide the NPC will wander to a map tile. Use when the character has no one to talk to and nothing specific to do. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
        },
        required: ['agentId', 'operationId', 'x', 'y'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_activity',
      description:
        'Decide the NPC will be busy with a personal activity. The activity runs until the end of the current schedule block — choose what to do, not how long. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          description: { type: 'string', minLength: 1, maxLength: 120 },
          emoji: { type: 'string', maxLength: 8 },
        },
        required: ['agentId', 'operationId', 'description'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_invite',
      description:
        'Decide the NPC will invite another listed free player to a conversation. Only choose a player listed as a free conversation candidate. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          invitee: { type: 'string' },
        },
        required: ['agentId', 'operationId', 'invitee'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_use_object',
      description:
        'Decide the NPC will use a nearby object affordance. Only choose an objectRef and affordanceId from the listed nearby affordances. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          objectRef: { type: 'string' },
          affordanceId: { type: 'string' },
          durationMs: { type: 'integer', minimum: 5000, maximum: 600000 },
        },
        required: ['agentId', 'operationId', 'objectRef', 'affordanceId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_pick_up_item',
      description:
        'Decide the NPC will pick up a listed portable object or nearby ground item into an empty inventory slot. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          sourceKind: { type: 'string', enum: ['poiObject', 'groundItem'] },
          objectRef: { type: 'string' },
          groundItemId: { type: 'string' },
        },
        required: ['agentId', 'operationId', 'sourceKind'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_put_down_item',
      description:
        'Decide the NPC will put down an inventory slot as a visible ground item. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          slotIndex: { type: 'integer', minimum: 0, maximum: 2 },
        },
        required: ['agentId', 'operationId', 'slotIndex'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_buy_item',
      description:
        'Decide the NPC will buy a listed shop-counter item into an empty inventory slot. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          objectRef: { type: 'string' },
          itemId: { type: 'string' },
        },
        required: ['agentId', 'operationId', 'objectRef', 'itemId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.do_sell_item',
      description:
        'Decide the NPC will sell an inventory slot to a listed shop-counter commerce object. Atomically commits the agentDoSomething operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          objectRef: { type: 'string' },
          slotIndex: { type: 'integer', minimum: 0, maximum: 2 },
        },
        required: ['agentId', 'operationId', 'objectRef', 'slotIndex'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.handle_invite_accept',
      description:
        'Accept a pending conversation invite for an NPC. Atomically accepts and finishes the agentHandleInvite operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          playerId: { type: 'string' },
          conversationId: { type: 'string' },
        },
        required: ['agentId', 'operationId', 'playerId', 'conversationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.handle_invite_reject',
      description:
        'Reject a pending conversation invite for an NPC. Atomically rejects and finishes the agentHandleInvite operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          operationId: { type: 'string' },
          playerId: { type: 'string' },
          conversationId: { type: 'string' },
        },
        required: ['agentId', 'operationId', 'playerId', 'conversationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.compose_message',
      description:
        'Send an in-character NPC message in the active conversation. The runner sets leaveConversation based on whether this is a leave-type message; agents do not choose to leave directly.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          conversationId: { type: 'string' },
          agentId: { type: 'string' },
          playerId: { type: 'string' },
          operationId: { type: 'string' },
          text: { type: 'string', minLength: 1, maxLength: 280 },
          leaveConversation: { type: 'boolean' },
        },
        required: [
          'conversationId',
          'agentId',
          'playerId',
          'operationId',
          'text',
          'leaveConversation',
        ],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.save_reflections',
      description:
        'Persist a batch of reflection memories for an NPC and finish the agentReflect operation.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          agentId: { type: 'string' },
          playerId: { type: 'string' },
          operationId: { type: 'string' },
          reflections: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                relatedMemoryIds: { type: 'array', items: { type: 'string' } },
                importance: { type: 'number' },
              },
              required: ['description', 'relatedMemoryIds', 'importance'],
              additionalProperties: false,
            },
          },
          nextIntent: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  kind: { type: 'string' },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  source: { type: 'string' },
                  created: { type: 'number' },
                  expiresAt: { type: 'number' },
                  priority: { type: 'number' },
                  target: { type: 'object' },
                },
                required: [
                  'kind',
                  'description',
                  'rationale',
                  'source',
                  'created',
                  'expiresAt',
                  'priority',
                ],
                additionalProperties: true,
              },
              { type: 'null' },
            ],
          },
        },
        required: ['agentId', 'playerId', 'operationId', 'reflections'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.remember_conversation',
      description: 'Create structured/vector memory for an archived conversation through MCP.',
      inputSchema: {
        type: 'object',
        properties: {
          worldId: { type: 'string' },
          playerId: { type: 'string' },
          agentId: { type: 'string' },
          conversationId: { type: 'string' },
          operationId: { type: 'string' },
        },
        required: ['playerId', 'agentId', 'conversationId', 'operationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.search_memories',
      description: 'Search an NPC memory vector store through the MCP surface.',
      inputSchema: {
        type: 'object',
        properties: {
          playerId: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['playerId', 'query'],
        additionalProperties: false,
      },
    },
    // ----- Narrator tools (Phase 2 of the VN/MUD pivot). Pure narrative; no state mutation. -----
    {
      name: 'aitown.claim_narrate_op',
      description: 'Claim the next queued narrator operation. Returns null if the queue is empty.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'aitown.set_narrator_model',
      description: 'Record the model currently handling a narrator operation for the UI inspector.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          model: { type: 'string' },
        },
        required: ['operationId', 'model'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.narrate',
      description:
        'Append a narration paragraph (≤500 chars) to the current turn. Use to describe the scene, action, or sensory detail.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          text: { type: 'string', minLength: 1, maxLength: 500 },
        },
        required: ['operationId', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.npc_speak',
      description:
        'Have a present NPC say a line (≤300 chars). The speaker must be listed in npcsPresent for the current scene.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          speaker: { type: 'string' },
          text: { type: 'string', minLength: 1, maxLength: 300 },
        },
        required: ['operationId', 'speaker', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.end_turn',
      description:
        'Mark the narrator operation complete. Must be the last tool called per turn. The engine owns the next legal choices.',
      inputSchema: {
        type: 'object',
        properties: { operationId: { type: 'string' } },
        required: ['operationId'],
        additionalProperties: false,
      },
    },
    {
      name: 'aitown.fail_narrate_op',
      description:
        'Abort the narrator operation with an error message. Engine restores safe defaults.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          error: { type: 'string' },
        },
        required: ['operationId', 'error'],
        additionalProperties: false,
      },
    },
  ];
}

export async function callTool(name, args) {
  // Narrator-tool path: no worldId / no engine input needed.
  if (
    name === 'aitown.claim_narrate_op' ||
    name === 'aitown.set_narrator_model' ||
    name === 'aitown.narrate' ||
    name === 'aitown.npc_speak' ||
    name === 'aitown.end_turn' ||
    name === 'aitown.fail_narrate_op'
  ) {
    return await callNarratorTool(name, args);
  }
  const needsWorld = ![
    'aitown.claim_agent_operation',
    'aitown.complete_agent_operation',
    'aitown.fail_agent_operation',
    'aitown.search_memories',
  ].includes(name);
  const worldId = args.worldId ?? (needsWorld ? await defaultWorldId() : undefined);
  switch (name) {
    case 'aitown.claim_agent_operation':
      return textContent(
        await convexClient().mutation(api.aiTown.agent.claimAgentOperation, {
          operationId: args.operationId,
        }),
      );
    case 'aitown.complete_agent_operation':
      return textContent(
        await convexClient().mutation(api.aiTown.agent.completeAgentOperation, {
          operationId: args.operationId,
        }),
      );
    case 'aitown.fail_agent_operation':
      return textContent(
        await convexClient().mutation(api.aiTown.agent.failAgentOperation, {
          operationId: args.operationId,
          error: args.error,
        }),
      );
    case 'aitown.do_wander':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          destination: { x: args.x, y: args.y },
        }),
      );
    case 'aitown.do_activity':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          activity: {
            description: args.description,
            emoji: args.emoji,
          },
        }),
      );
    case 'aitown.do_invite':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          invitee: args.invitee,
        }),
      );
    case 'aitown.do_use_object': {
      const useObject = {
        objectRef: args.objectRef,
        affordanceId: args.affordanceId,
      };
      if (args.durationMs !== undefined) {
        useObject.durationMs = args.durationMs;
      }
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          useObject,
        }),
      );
    }
    case 'aitown.do_pick_up_item': {
      let source;
      if (args.sourceKind === 'poiObject') {
        source = { kind: 'poiObject', objectRef: args.objectRef };
      } else if (args.sourceKind === 'groundItem') {
        source = { kind: 'groundItem', groundItemId: args.groundItemId };
      } else {
        throw new Error(`Invalid item pickup source kind ${args.sourceKind}`);
      }
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          pickUpItem: { source },
        }),
      );
    }
    case 'aitown.do_put_down_item':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          putDownItem: { slotIndex: args.slotIndex },
        }),
      );
    case 'aitown.do_buy_item':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          buyItem: { objectRef: args.objectRef, itemId: args.itemId },
        }),
      );
    case 'aitown.do_sell_item':
      return textContent(
        await sendInput(worldId, 'finishDoSomething', {
          agentId: args.agentId,
          operationId: args.operationId,
          sellItem: { objectRef: args.objectRef, slotIndex: args.slotIndex },
        }),
      );
    case 'aitown.handle_invite_accept':
      await sendInput(worldId, 'acceptInvite', {
        playerId: args.playerId,
        conversationId: args.conversationId,
      });
      return textContent(
        await sendInput(worldId, 'finishAgentOperation', {
          agentId: args.agentId,
          operationId: args.operationId,
        }),
      );
    case 'aitown.handle_invite_reject':
      await sendInput(worldId, 'rejectInvite', {
        playerId: args.playerId,
        conversationId: args.conversationId,
      });
      return textContent(
        await sendInput(worldId, 'finishAgentOperation', {
          agentId: args.agentId,
          operationId: args.operationId,
        }),
      );
    case 'aitown.compose_message': {
      const inputId = await convexClient().mutation(api.aiTown.agent.mcpAgentSendMessage, {
        worldId,
        conversationId: args.conversationId,
        agentId: args.agentId,
        playerId: args.playerId,
        text: args.text,
        messageUuid: crypto.randomUUID(),
        leaveConversation: args.leaveConversation,
        operationId: args.operationId,
      });
      return textContent(await waitForInput(inputId));
    }
    case 'aitown.save_reflections': {
      const result = await convexClient().action(api.agent.memory.mcpSaveReflections, {
        worldId,
        agentId: args.agentId,
        playerId: args.playerId,
        operationId: args.operationId,
        reflections: args.reflections,
        nextIntent: args.nextIntent,
      });
      return textContent(await waitForInput(result));
    }
    case 'aitown.remember_conversation': {
      const result = await convexClient().action(api.agent.memory.mcpRememberConversation, {
        worldId,
        playerId: args.playerId,
        agentId: args.agentId,
        conversationId: args.conversationId,
        operationId: args.operationId,
      });
      await sendInput(worldId, 'finishRememberConversation', {
        agentId: args.agentId,
        operationId: args.operationId,
      });
      return textContent(result);
    }
    case 'aitown.search_memories':
      return textContent(
        await convexClient().action(api.agent.memory.mcpSearchMemory, {
          playerId: args.playerId,
          query: args.query,
          limit: args.limit,
        }),
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function listResources() {
  const resources = [
    {
      uri: 'aitown://default-world',
      name: 'Default world status',
      description: 'The default world and engine IDs.',
      mimeType: 'application/json',
    },
    {
      uri: 'aitown://agent-operations/pending',
      name: 'Pending MCP agent operations',
      description: 'Queued autonomous NPC operations waiting for the local MCP runner.',
      mimeType: 'application/json',
    },
  ];
  const status = await convexClient().query(api.world.defaultWorldStatus);
  if (!status) {
    return { resources };
  }
  const bundle = await worldBundle(status.worldId);
  resources.push(
    {
      uri: `aitown://world/${status.worldId}/snapshot`,
      name: 'World snapshot',
      description: 'Current world, engine, map, and player descriptions.',
      mimeType: 'application/json',
    },
    {
      uri: `aitown://world/${status.worldId}/players`,
      name: 'Active players and NPCs',
      description: 'Active players, agents, and descriptions.',
      mimeType: 'application/json',
    },
    {
      uri: `aitown://world/${status.worldId}/conversations`,
      name: 'Active conversations',
      description: 'Active conversation state.',
      mimeType: 'application/json',
    },
  );
  for (const conversation of bundle.world.conversations) {
    resources.push({
      uri: `aitown://conversation/${status.worldId}/${conversation.id}/messages`,
      name: `Messages for ${conversation.id}`,
      description: `Recent messages for conversation ${conversation.id}.`,
      mimeType: 'application/json',
    });
  }
  return { resources };
}

export async function readResource(uri) {
  if (uri === 'aitown://default-world') {
    return resourceContents(uri, await defaultWorldStatus());
  }
  if (uri === 'aitown://agent-operations/pending') {
    return resourceContents(
      uri,
      await convexClient().query(api.aiTown.agent.pendingAgentOperations, { limit: 16 }),
    );
  }
  let match = uri.match(/^aitown:\/\/world\/([^/]+)\/snapshot$/);
  if (match) {
    return resourceContents(uri, await worldBundle(match[1]));
  }
  match = uri.match(/^aitown:\/\/world\/([^/]+)\/players$/);
  if (match) {
    const bundle = await worldBundle(match[1]);
    return resourceContents(uri, {
      players: bundle.world.players,
      agents: bundle.world.agents,
      playerDescriptions: bundle.playerDescriptions,
      agentDescriptions: bundle.agentDescriptions,
    });
  }
  match = uri.match(/^aitown:\/\/world\/([^/]+)\/conversations$/);
  if (match) {
    const bundle = await worldBundle(match[1]);
    return resourceContents(uri, { conversations: bundle.world.conversations });
  }
  match = uri.match(/^aitown:\/\/conversation\/([^/]+)\/([^/]+)\/messages$/);
  if (match) {
    const [, worldId, conversationId] = match;
    const messages = await convexClient().query(api.messages.listMessages, {
      worldId,
      conversationId,
    });
    return resourceContents(uri, messages);
  }
  match = uri.match(/^aitown:\/\/memories\/([^/]+)\/([^/]+)\/recent$/);
  if (match) {
    const [, worldId, playerId] = match;
    const data = await convexClient().query(api.agent.memory.recentMemoriesForReflection, {
      worldId,
      playerId,
      limit: 20,
    });
    return resourceContents(uri, data);
  }
  throw new Error(`Unknown resource: ${uri}`);
}

function resourceContents(uri, value) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(safeJson(value), null, 2),
      },
    ],
  };
}

async function handle(request) {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
        capabilities: {
          resources: {},
          tools: {},
        },
        serverInfo: {
          name: 'ai-town-local',
          version: '0.1.0',
        },
      };
    case 'ping':
      return {};
    case 'resources/list':
      return await listResources();
    case 'resources/read':
      return await readResource(request.params?.uri);
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return await callTool(request.params?.name, request.params?.arguments ?? {});
    case 'prompts/list':
      return { prompts: [] };
    default:
      throw new Error(`Unsupported MCP method: ${request.method}`);
  }
}

function writeMessage(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

async function dispatch(request) {
  if (request.id === undefined || request.id === null) {
    return;
  }
  try {
    writeMessage({
      jsonrpc: '2.0',
      id: request.id,
      result: await handle(request),
    });
  } catch (error) {
    writeMessage({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function startStdioServer() {
  let readBuffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    readBuffer = Buffer.concat([readBuffer, chunk]);
    while (true) {
      const headerEnd = readBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      const header = readBuffer.slice(0, headerEnd).toString('utf8');
      const lengthMatch = header.match(/Content-Length: (\d+)/i);
      if (!lengthMatch) {
        throw new Error(`Invalid MCP message header: ${header}`);
      }
      const contentLength = Number(lengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (readBuffer.length < messageEnd) {
        return;
      }
      const body = readBuffer.slice(messageStart, messageEnd).toString('utf8');
      readBuffer = readBuffer.slice(messageEnd);
      void dispatch(JSON.parse(body));
    }
  });

  process.stdin.resume();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdioServer();
}
