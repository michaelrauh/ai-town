import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { advanceClock, makeInitialState, NARRATOR_TOOL_BUDGET } from './state';
import { getAction } from './actions';
import { getBeat } from './beats';
import { selectBeat } from './triggers';
import { getRoom, npcsInRoom, roomExists, type RoomId } from './rooms';
import { Descriptions } from '../../data/characters';

const DEFAULT_SLOT = 'default';

/**
 * Public query: the current scene from the perspective of a save slot.
 */
export const currentScene = query({
  args: { slot: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slot = args.slot ?? DEFAULT_SLOT;
    const save = await ctx.db
      .query('narrativeState')
      .withIndex('slot', (q) => q.eq('slot', slot))
      .unique();
    if (!save) return null;
    const room = roomExists(save.location) ? getRoom(save.location as RoomId) : null;
    return {
      slot: save.slot,
      day: save.day,
      timeOfDay: save.timeOfDay,
      clockMinutes: save.clockMinutes,
      location: save.location,
      roomName: room?.name ?? save.location,
      roomDescription: room?.description ?? '',
      exits: room?.exits ?? [],
      affordances: room?.affordances ?? [],
      npcsPresent: room ? npcsInRoom(room.id, save.timeOfDay) : [],
      coins: save.coins,
      inventory: save.inventory,
      hearts: save.hearts,
      flags: save.flags,
      beatActive: save.beatActive,
      transcript: save.transcript,
      pendingChoices: save.pendingChoices,
      turn: save.turn,
      narrating: save.narrating,
    };
  },
});

/**
 * Public mutation: create or reset a save.
 * After init, enqueues an opening narrator op so the player sees scenery on first load.
 */
export const startGame = mutation({
  args: { slot: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const slot = args.slot ?? DEFAULT_SLOT;
    const existing = await ctx.db
      .query('narrativeState')
      .withIndex('slot', (q) => q.eq('slot', slot))
      .unique();
    const now = Date.now();
    const initial: any = { ...makeInitialState(now, slot), narrating: true, pendingChoices: [] };

    // Fire the trigger evaluator on the fresh state so Beat 1 can open immediately.
    const beat = selectBeat(initial as any);
    let briefing =
      "Kyle Farmer has just arrived at his late grandfather's cottage in Willow Creek. Open the scene briefly and offer 3-4 choices.";
    let beatChoices: Array<{ id: string; label: string }> | null = null;
    if (beat) {
      initial.beatActive = beat.id;
      briefing = beat.openingBriefing(initial as any);
      beatChoices = beat.choices(initial as any);
    }

    let saveId;
    if (existing) {
      await ctx.db.replace(existing._id, initial);
      saveId = existing._id;
    } else {
      saveId = await ctx.db.insert('narrativeState', initial);
    }
    await enqueueNarratorOp(ctx, saveId, initial.turn, {
      reason: 'open_game',
      briefing,
      beatId: beat?.id ?? null,
      beatChoices,
    });
    return saveId;
  },
});

/**
 * Public mutation: the player picks an action from pendingChoices, or types free text.
 * Runs the scripted handler (state mutations + clock advance), then enqueues a
 * narrateScene operation that the agent-runner will pick up.
 */
export const submitAction = mutation({
  args: {
    slot: v.optional(v.string()),
    actionId: v.string(),
    payload: v.optional(v.any()),
    freeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slot = args.slot ?? DEFAULT_SLOT;
    const save = await ctx.db
      .query('narrativeState')
      .withIndex('slot', (q) => q.eq('slot', slot))
      .unique();
    if (!save) {
      throw new Error(`No save in slot ${slot}. Call startGame first.`);
    }
    if (save.narrating) {
      throw new Error('Narrator is mid-turn. Wait for the narration to finish.');
    }

    const now = Date.now();
    const action = getAction(args.actionId);
    if (!action) {
      throw new Error(`Unknown action: ${args.actionId}`);
    }

    // Build a mutable working state.
    const working: any = {
      day: save.day,
      timeOfDay: save.timeOfDay,
      clockMinutes: save.clockMinutes,
      location: save.location,
      coins: save.coins,
      inventory: save.inventory,
      hearts: save.hearts,
      flags: save.flags,
      beatActive: save.beatActive,
      beatsCompleted: save.beatsCompleted,
      transcript: save.transcript,
      pendingChoices: save.pendingChoices,
      turn: save.turn,
      slot: save.slot,
      narrating: save.narrating as boolean,
      createdAt: save.createdAt,
      updatedAt: save.updatedAt,
    };

    // Echo the player's choice into the transcript first.
    const chosenLabel =
      working.pendingChoices.find((c: { actionId: string }) => c.actionId === args.actionId)
        ?.label ?? args.actionId;
    const playerLine = args.freeText ? `> ${args.freeText}` : `> ${chosenLabel}`;
    working.transcript = [
      ...working.transcript,
      { role: 'player' as const, text: playerLine, turn: working.turn + 1, at: now },
    ];

    // Run the scripted handler (may throw on invalid payload).
    const payload = args.freeText ? { text: args.freeText, ...args.payload } : args.payload;
    const result = action.run(working as any, payload, now);

    // Advance clock per action.
    advanceClock(
      working as any,
      result.clockMinutes ?? 15,
    );

    // Increment turn and clear pending choices (narrator will repopulate).
    working.turn += 1;
    working.pendingChoices = [];
    working.narrating = true;
    working.updatedAt = now;

    if (result.preNarratorTranscript) {
      working.transcript = [...working.transcript, ...result.preNarratorTranscript];
    }

    // ----- Trigger evaluation. Did a new beat open after this action? -----
    // Skip if the action WAS a beat_choice and the beat is still expected to be cleared by it.
    let briefing = result.narratorBriefing;
    let beatChoices: Array<{ id: string; label: string }> | null = null;
    let activeBeatId: string | null = working.beatActive;
    if (!working.beatActive) {
      const next = selectBeat(working);
      if (next) {
        working.beatActive = next.id;
        activeBeatId = next.id;
        // The narrator paints the action result THEN the new beat opens. Stack briefings.
        briefing = `${briefing}\n\nA new beat opens: ${next.openingBriefing(working)}`;
        beatChoices = next.choices(working);
      }
    }

    await ctx.db.replace(save._id, working as any);

    // Enqueue the narrator op so the agent-runner can paint the result.
    await enqueueNarratorOp(ctx, save._id, working.turn, {
      reason: 'scripted_action',
      actionId: args.actionId,
      briefing,
      freeText: args.freeText ?? null,
      beatId: activeBeatId,
      beatChoices,
    });

    return { ok: true, turn: working.turn };
  },
});

// ---------- Internal: queue a narrator operation for the agent-runner ----------

async function enqueueNarratorOp(
  ctx: any,
  saveId: any,
  turn: number,
  context: Record<string, unknown>,
) {
  // Build the full scene context so the agent-runner doesn't need to re-query.
  const save = await ctx.db.get(saveId);
  if (!save) throw new Error(`enqueueNarratorOp: missing save ${saveId}`);
  const room = roomExists(save.location) ? getRoom(save.location) : null;
  const npcsPresent = room ? npcsInRoom(room.id, save.timeOfDay) : [];
  const npcVoices = npcsPresent
    .map((name) => {
      const desc = Descriptions.find((d) => d.name === name);
      return desc
        ? {
            name: desc.name,
            identity: desc.identity,
            profession: desc.profession,
          }
        : { name, identity: '', profession: '' };
    })
    .filter(Boolean);
  const recentTranscript = save.transcript.slice(-8);

  await ctx.db.insert('narrativeOperations', {
    saveId,
    turn,
    status: 'queued' as const,
    context: {
      ...context,
      day: save.day,
      timeOfDay: save.timeOfDay,
      location: save.location,
      roomName: room?.name ?? save.location,
      roomDescription: room?.description ?? '',
      exits: room?.exits ?? [],
      affordances: room?.affordances ?? [],
      npcsPresent,
      npcVoices,
      recentTranscript,
      coins: save.coins,
      inventory: save.inventory,
      hearts: save.hearts,
      flags: save.flags,
      beatActive: save.beatActive,
      toolBudget: NARRATOR_TOOL_BUDGET,
    },
    created: Date.now(),
  });
}

// ---------- Internal: agent-runner pulls the queue, posts back tool results ----------

export const claimNextNarrateOp = mutation({
  args: {},
  handler: async (ctx) => {
    const op = await ctx.db
      .query('narrativeOperations')
      .withIndex('status_created', (q) => q.eq('status', 'queued'))
      .order('asc')
      .first();
    if (!op) return null;
    await ctx.db.patch(op._id, { status: 'inProgress' });
    return {
      operationId: op._id,
      saveId: op.saveId,
      turn: op.turn,
      context: op.context,
    };
  },
});

export const narratorTool = mutation({
  args: {
    operationId: v.id('narrativeOperations'),
    tool: v.union(
      v.literal('narrate'),
      v.literal('npc_speak'),
      v.literal('offer_choice'),
      v.literal('end_turn'),
    ),
    text: v.optional(v.string()),
    speaker: v.optional(v.string()),
    label: v.optional(v.string()),
    actionId: v.optional(v.string()),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) throw new Error(`narratorTool: unknown operation ${args.operationId}`);
    if (op.status !== 'inProgress') {
      throw new Error(`narratorTool: operation ${args.operationId} is ${op.status}, not inProgress`);
    }
    const save = await ctx.db.get(op.saveId);
    if (!save) throw new Error(`narratorTool: missing save for op`);

    // Per-turn cap. Includes narrate + npc_speak + offer_choice.
    const used = (save.flags['__toolCallsThisTurn'] as number | undefined) ?? 0;
    const budget = (op.context as any).toolBudget ?? NARRATOR_TOOL_BUDGET;
    if (args.tool !== 'end_turn' && used >= budget) {
      throw new Error('narratorTool: tool budget exhausted; call end_turn');
    }

    const now = Date.now();
    const transcript = save.transcript.slice();
    const pendingChoices = save.pendingChoices.slice();
    const flags = { ...save.flags };

    switch (args.tool) {
      case 'narrate': {
        const text = (args.text ?? '').trim();
        if (!text) throw new Error('narrate: text is required');
        if (text.length > 500) throw new Error('narrate: text exceeds 500 chars');
        transcript.push({ role: 'narrator', text, turn: op.turn, at: now });
        flags['__toolCallsThisTurn'] = used + 1;
        break;
      }
      case 'npc_speak': {
        const speaker = (args.speaker ?? '').trim();
        const text = (args.text ?? '').trim();
        if (!speaker) throw new Error('npc_speak: speaker is required');
        if (!text) throw new Error('npc_speak: text is required');
        if (text.length > 300) throw new Error('npc_speak: text exceeds 300 chars');
        const ctxNpcs = (op.context as any).npcsPresent ?? [];
        if (!ctxNpcs.includes(speaker)) {
          throw new Error(`npc_speak: ${speaker} is not present in this scene`);
        }
        transcript.push({ role: 'npc', speaker, text, turn: op.turn, at: now });
        flags['__toolCallsThisTurn'] = used + 1;
        break;
      }
      case 'offer_choice': {
        const label = (args.label ?? '').trim();
        const actionId = (args.actionId ?? '').trim();
        if (!label) throw new Error('offer_choice: label is required');
        if (label.length > 80) throw new Error('offer_choice: label exceeds 80 chars');
        if (!actionId) throw new Error('offer_choice: actionId is required');
        if (!getAction(actionId)) {
          throw new Error(`offer_choice: actionId "${actionId}" is not a registered scripted action`);
        }
        if (pendingChoices.length >= 5) {
          throw new Error('offer_choice: max 5 choices per turn');
        }
        pendingChoices.push({ label, actionId, payload: args.payload });
        flags['__toolCallsThisTurn'] = used + 1;
        break;
      }
      case 'end_turn': {
        // Always-available default choices so the player isn't trapped if the narrator
        // forgets to offer anything.
        if (pendingChoices.length === 0) {
          const room = roomExists(save.location) ? getRoom(save.location as RoomId) : null;
          if (room) {
            for (const exit of room.exits) {
              const dest = getRoom(exit);
              if (pendingChoices.length >= 5) break;
              pendingChoices.push({
                label: `Walk to ${dest.name}`,
                actionId: 'move_to_room',
                payload: { roomId: exit },
              });
            }
            if (pendingChoices.length < 5) {
              pendingChoices.push({ label: 'Look around', actionId: 'look_around' });
            }
            if (pendingChoices.length < 5) {
              pendingChoices.push({ label: 'Wait a while', actionId: 'wait' });
            }
          }
        }
        flags['__toolCallsThisTurn'] = 0;
        await ctx.db.patch(op._id, { status: 'done', completed: now });
        break;
      }
    }

    await ctx.db.patch(save._id, {
      transcript,
      pendingChoices,
      flags,
      narrating: args.tool !== 'end_turn',
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const failNarrateOp = mutation({
  args: { operationId: v.id('narrativeOperations'), error: v.string() },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) return null;
    await ctx.db.patch(op._id, { status: 'failed', error: args.error, completed: Date.now() });
    const save = await ctx.db.get(op.saveId);
    if (save) {
      // Make sure the player isn't stuck.
      const room = roomExists(save.location) ? getRoom(save.location as RoomId) : null;
      const fallback = [
        { label: 'Look around', actionId: 'look_around' },
        ...((room?.exits ?? []).map((e) => ({
          label: `Walk to ${getRoom(e).name}`,
          actionId: 'move_to_room',
          payload: { roomId: e },
        }))),
        { label: 'Wait a while', actionId: 'wait' },
      ].slice(0, 5);
      await ctx.db.patch(save._id, {
        narrating: false,
        pendingChoices: fallback,
        transcript: [
          ...save.transcript,
          {
            role: 'system' as const,
            text: `(Narrator failed: ${args.error.slice(0, 200)})`,
            turn: op.turn,
            at: Date.now(),
          },
        ],
      });
    }
    return null;
  },
});
