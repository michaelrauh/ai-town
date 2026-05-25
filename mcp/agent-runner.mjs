#!/usr/bin/env node

import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { callTool as serverCallTool, resetConvexClient } from './server.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini';
const LOOP_INTERVAL_MS = Number(process.env.MCP_AGENT_RUNNER_INTERVAL_MS ?? 1000);
const OPERATION_TIMEOUT_MS = Number(process.env.MCP_OPERATION_TIMEOUT_MS ?? 90_000);

// ---------- Helpers ----------

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

// ---------- Narrator tool surface (mirrors mcp/server.mjs registrations) ----------

const NARRATOR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'narrate',
      description:
        'Append a narration paragraph (≤500 chars). Use to describe scene, action, or sensory detail.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', maxLength: 500 } },
        required: ['text'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'npc_speak',
      description: 'Have a present NPC say a line (≤300 chars). Speaker must be in npcsPresent.',
      parameters: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string', maxLength: 300 },
        },
        required: ['speaker', 'text'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_turn',
      description: 'Mark the turn complete. Must be the LAST tool you call.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
];

function narratorSystemPrompt(ctx) {
  const npcLines = (ctx.npcVoices ?? [])
    .map((v) => `- ${v.name} (${v.profession}): ${v.identity}`)
    .join('\n');
  const transcriptLines = (ctx.recentTranscript ?? [])
    .map((e) => {
      if (e.role === 'narrator') return `Narrator: ${e.text}`;
      if (e.role === 'npc') return `${e.speaker}: ${e.text}`;
      if (e.role === 'player') return `Player: ${e.text}`;
      return `System: ${e.text}`;
    })
    .join('\n');
  const affordanceLines = (ctx.affordances ?? [])
    .map((a) => `- look_at(${a.id}) — "${a.label}"`)
    .join('\n');
  const exitLines = (ctx.exits ?? []).map((e) => `- move_to_room({roomId: "${e}"})`).join('\n');
  const actionLines = (ctx.availableActions ?? [])
    .map((choice) => {
      const payload =
        choice.payload && Object.keys(choice.payload).length > 0
          ? ` payload=${JSON.stringify(choice.payload)}`
          : '';
      return `- "${choice.label}" -> ${choice.actionId}${payload}`;
    })
    .join('\n');

  const beatActive = Boolean(ctx.beatId || ctx.beatActive);
  const beatBlock = beatActive
    ? `\n# STORY BEAT ACTIVE: ${ctx.beatId}
A scripted story beat is active. The engine has already computed the legal story choices. Use them only as context; do not register, invent, or alter choices.`
    : `\n# Free play (no active beat)
The engine has already computed legal next actions from the room, exits, affordances, and game state. Use them only as context; do not register, invent, or alter choices.

Exits (use actionId="move_to_room" with payload {roomId}):
${exitLines || '(none)'}

Examinables (use actionId="look_at" with payload {affordanceId}):
${affordanceLines || '(none)'}

Other registered actions: look_around, wait, free_text.`;

  return `You are the NARRATOR of a turn-based text adventure called "New Dawn Pastures", a cozy LitRPG about Kyle Farmer inheriting his late grandfather's farm in Willow Creek.

# Your role
Paint the scene. Voice the NPCs present. You DO NOT control the world — every state change (items, hearts, clock, room moves, and choice availability) happens outside your tool surface.

# Hard rules
- You MUST call \`end_turn\` exactly once as your LAST tool call.
- You SHOULD call \`narrate\` at least once to describe the result of the player's last action.
- If NPCs are present, voice at most one or two of them with short, in-character lines.
- DO NOT invent NPCs not in npcsPresent. DO NOT invent items, rooms, or affordances not in the lists below.
- DO NOT offer, register, or imply new choices. The engine-owned next actions below are already what the player will see.
- DO NOT imply state changed unless the briefing or state delta says it changed.
- Keep narration tight — 1-3 short sentences per \`narrate\` call. Cozy, sensory, slightly melancholy LitRPG voice. NO markdown, NO meta-commentary.

# Scene state
- Day ${ctx.day}, time of day: ${ctx.timeOfDay}
- Room: ${ctx.roomName} (id=${ctx.location})
- Room description: ${ctx.roomDescription}
- NPCs present: ${(ctx.npcsPresent ?? []).join(', ') || '(none)'}
${npcLines ? `\n# NPC voices\n${npcLines}\n` : ''}${beatBlock}

# Engine-owned next actions
${actionLines || '(none)'}

${ctx.stateDelta ? `# State delta from the player action\n${JSON.stringify(ctx.stateDelta, null, 2)}\n` : ''}

# Briefing for this turn
${ctx.briefing ?? ''}

${ctx.freeText ? `\n# Player free text\nThe player typed: "${ctx.freeText}". Respond in-character.` : ''}

# Recent transcript
${transcriptLines || '(none yet)'}

Begin. Call tools.`;
}

async function llmTools(messages, tools, { temperature = 0.7 } = {}) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      temperature,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI chat (tools) failed ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function recordNarratorModel(operationId, model) {
  try {
    await serverCallTool('aitown.set_narrator_model', { operationId, model });
  } catch (err) {
    console.warn(`Failed to record narrator model: ${String(err.message || err)}`);
  }
}

async function handleNarrateScene(op) {
  const { operationId, context } = op;
  const budget = context?.toolBudget ?? 8;
  await recordNarratorModel(operationId, OPENAI_CHAT_MODEL);
  const messages = [
    { role: 'system', content: narratorSystemPrompt(context) },
    {
      role: 'user',
      content:
        "Narrate the result of the player's last action, optionally voice an NPC, then call end_turn.",
    },
  ];

  let calls = 0;
  let ended = false;
  while (!ended && calls < budget + 4 /* a little headroom for malformed loops */) {
    let resp;
    try {
      resp = await llmTools(messages, NARRATOR_TOOLS);
      if (resp.model && resp.model !== OPENAI_CHAT_MODEL) {
        await recordNarratorModel(operationId, resp.model);
      }
    } catch (err) {
      await serverCallTool('aitown.fail_narrate_op', {
        operationId,
        error: String(err.message || err),
      });
      return;
    }
    const choice = resp.choices?.[0];
    const message = choice?.message;
    if (!message) {
      await serverCallTool('aitown.fail_narrate_op', {
        operationId,
        error: 'LLM returned no message',
      });
      return;
    }
    messages.push(message);
    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Force end_turn if the model went off-script.
      await serverCallTool('aitown.end_turn', { operationId });
      ended = true;
      break;
    }
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args = {};
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (err) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `error: invalid JSON arguments: ${String(err)}`,
        });
        continue;
      }
      try {
        if (name === 'narrate') {
          await serverCallTool('aitown.narrate', { operationId, text: args.text });
        } else if (name === 'npc_speak') {
          await serverCallTool('aitown.npc_speak', {
            operationId,
            speaker: args.speaker,
            text: args.text,
          });
        } else if (name === 'end_turn') {
          await serverCallTool('aitown.end_turn', { operationId });
          ended = true;
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `error: unknown tool ${name}`,
          });
          continue;
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ok' });
        calls += 1;
      } catch (err) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `error: ${String(err.message || err)}`,
        });
      }
    }
    if (calls >= budget && !ended) {
      try {
        await serverCallTool('aitown.end_turn', { operationId });
      } catch {
        /* already ended */
      }
      ended = true;
    }
  }
  if (!ended) {
    try {
      await serverCallTool('aitown.end_turn', { operationId });
    } catch {
      /* already ended */
    }
  }
}

// ---------- Main loop ----------

async function runOnce() {
  const narrateText = mcpText(await serverCallTool('aitown.claim_narrate_op', {}));
  if (!narrateText || narrateText === 'null') return false;
  let parsed;
  try {
    parsed = JSON.parse(narrateText);
  } catch (err) {
    console.error(`claim_narrate_op returned non-JSON: ${narrateText}`);
    return false;
  }
  if (!parsed) return false;
  await withTimeout(handleNarrateScene(parsed), OPERATION_TIMEOUT_MS, 'handleNarrateScene');
  return true;
}

async function main() {
  requireConfig();
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      resetConvexClient();
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
