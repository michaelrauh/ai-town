#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;

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

// ---------- Narrator tool surface (the only tools the LLM is exposed to) ----------

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

export function tools() {
  return [
    {
      name: 'aitown.claim_narrate_op',
      description: 'Claim the next queued narrator operation. Returns null if the queue is empty.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'aitown.set_narrator_model',
      description: 'Record which LLM model is producing this turn (for the Inspector history).',
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
        'Mark the narrator operation complete. Must be the last tool called per turn.',
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
  return await callNarratorTool(name, args);
}

// ---------- MCP transport (stdio JSON-RPC) ----------

async function handle(request) {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: request.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'ai-town-narrative',
          version: '0.2.0',
        },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: tools() };
    case 'tools/call':
      return await callTool(request.params?.name, request.params?.arguments ?? {});
    case 'resources/list':
      return { resources: [] };
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
