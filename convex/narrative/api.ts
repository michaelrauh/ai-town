import { v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { advanceClock, makeInitialState, NARRATOR_TOOL_BUDGET, type PendingChoice } from './state';
import { getAction } from './actions';
import { getBeat, listBeats } from './beats';
import { selectBeat } from './triggers';
import { getRoom, npcsInRoom, roomExists, type RoomId } from './rooms';
import { Descriptions } from '../../data/characters';

const DEFAULT_SLOT = 'default';

const BEAT_TITLES: Record<string, string> = {
  'lawyers-office': 'Inheritance Papers',
  arrival: 'Arrival in Willow Creek',
  'accept-task': 'Fix Up the Forgotten Farm',
  'first-night': 'First Night',
  'morning-chores': 'Harold at the Farm',
  'rescue-elvira': 'A Noise in the Brambles',
  'town-visit': 'The Town Square',
  'mushroom-mistake': 'Forest Foraging',
  'evening-at-inn': 'Evening at the Inn',
  'first-harvest': 'First Harvest',
  'curse-hint': 'The Broken Statue',
  cliffhanger: 'Laurel at the Monastery',
};

const ACTIVE_OBJECTIVES: Record<string, string> = {
  'lawyers-office': 'Decide what Kyle does with the inheritance papers.',
  arrival: 'Choose how Kyle answers the Mayor.',
  'accept-task': "Respond to the Mayor's formal Task offer.",
  'first-night': "Get Kyle through his first night in Grandfather's cottage.",
  'morning-chores': "Receive Harold's farm supplies.",
  'rescue-elvira': 'Deal with the thrashing in the brambles.',
  'town-visit': 'Choose who Kyle engages with in Town Square.',
  'mushroom-mistake': 'Choose what Kyle eats at the Forest Edge.',
  'evening-at-inn': 'Spend the evening at the Willow Branch Inn.',
  'first-harvest': "Decide what to do with Kyle's first harvest.",
  'curse-hint': "Listen to Milo's account of the broken statue.",
  cliffhanger: "Answer Laurel's invitation at the monastery.",
};

type BeatLead = {
  beatId: string;
  title: string;
  ready: boolean;
  summary: string;
  detail: string;
  requirements: string[];
};

type StateInvariant = {
  level: 'warning' | 'error';
  message: string;
};

function narrativeProgress(state: any) {
  const invariants = validateNarrativeState(state);
  const activeBeat = state.beatActive ? getBeat(state.beatActive) : null;
  const readyBeat = activeBeat ? null : selectBeat(state);
  const nextBeat =
    activeBeat ??
    readyBeat ??
    listBeats().find((beat) => !state.beatsCompleted.includes(beat.id)) ??
    null;

  if (!nextBeat) {
    return {
      taskbook: {
        status: 'complete',
        objective: 'First chapter complete.',
        detail: 'Explore Willow Creek or restart when you want to replay the current demo.',
      },
      currentBeat: null,
      nextLead: null,
      invariants,
    };
  }

  const lead = beatLead(nextBeat.id, state, Boolean(activeBeat || readyBeat));
  const currentBeat = activeBeat
    ? {
        id: activeBeat.id,
        title: beatTitle(activeBeat.id),
        status: 'active',
        objective: ACTIVE_OBJECTIVES[activeBeat.id] ?? lead.summary,
      }
    : null;

  return {
    taskbook: {
      status: activeBeat ? 'active' : readyBeat ? 'ready' : 'lead',
      objective: activeBeat ? (ACTIVE_OBJECTIVES[activeBeat.id] ?? lead.summary) : lead.summary,
      detail: activeBeat ? 'Pick one of the story choices below to continue.' : lead.detail,
    },
    currentBeat,
    nextLead: lead,
    invariants,
  };
}

function validateNarrativeState(state: any): StateInvariant[] {
  const invariants: StateInvariant[] = [];
  if (state.beatActive) {
    const beat = getBeat(state.beatActive);
    if (!beat) {
      invariants.push({
        level: 'error',
        message: `Active beat "${state.beatActive}" is not registered.`,
      });
      return invariants;
    }
    if (state.beatsCompleted.includes(state.beatActive)) {
      invariants.push({
        level: 'error',
        message: `Active beat "${state.beatActive}" is already marked completed.`,
      });
    }
    if (!pendingChoicesMatchAvailableActions(state)) {
      invariants.push({
        level: 'warning',
        message:
          'Saved choices drifted from the engine legal actions and were repaired for display.',
      });
    }
    return invariants;
  }
  if (
    state.pendingChoices.some((choice: { actionId?: string }) => choice.actionId === 'beat_choice')
  ) {
    invariants.push({
      level: 'warning',
      message: 'Beat choices are present even though no beat is active.',
    });
  }
  if (!pendingChoicesMatchAvailableActions(state)) {
    invariants.push({
      level: 'warning',
      message: 'Saved choices drifted from the engine legal actions and were repaired for display.',
    });
  }
  if (!state.narrating && availableActions(state).length === 0) {
    invariants.push({
      level: 'warning',
      message: 'No pending choices are available while narration is idle.',
    });
  }
  return invariants;
}

function displayPendingChoices(state: any) {
  return availableActions(state);
}

function availableActions(state: any): PendingChoice[] {
  if (state.beatActive) {
    return canonicalBeatPendingChoices(state.beatActive, state);
  }

  if (!roomExists(state.location)) return [];

  const room = getRoom(state.location as RoomId);
  const choices: PendingChoice[] = [];

  for (const affordance of room.affordances ?? []) {
    choices.push({
      label: affordance.label,
      actionId: 'look_at',
      payload: { affordanceId: affordance.id },
    });
  }

  for (const exit of room.exits) {
    choices.push({
      label: `Walk to ${getRoom(exit).name}`,
      actionId: 'move_to_room',
      payload: { roomId: exit },
    });
  }

  choices.push({ label: 'Look around', actionId: 'look_around' });
  choices.push({ label: 'Wait a while', actionId: 'wait' });

  return uniquePendingChoices(choices);
}

function canonicalBeatPendingChoices(beatId: string, state: any) {
  return promptBeatChoices(beatId, state).map((choice) => ({
    label: choice.label,
    actionId: 'beat_choice',
    payload: { beatId, choiceId: choice.id },
  }));
}

function promptBeatChoices(beatId: string, state: any): Array<{ id: string; label: string }> {
  const beat = getBeat(beatId);
  if (!beat) return [];
  return beat.choices(state);
}

function pendingChoicesMatchAvailableActions(state: any): boolean {
  const canonical = availableActions(state);
  if (canonical.length === 0) return state.pendingChoices.length === 0;
  if (state.pendingChoices.length !== canonical.length) return false;
  return canonical.every((choice) =>
    state.pendingChoices.some((candidate: any) => samePendingChoice(candidate, choice)),
  );
}

function uniquePendingChoices(choices: PendingChoice[]): PendingChoice[] {
  const unique: PendingChoice[] = [];
  for (const choice of choices) {
    if (!unique.some((candidate) => samePendingChoice(candidate, choice))) {
      unique.push(choice);
    }
  }
  return unique;
}

function samePendingChoice(a: any, b: any): boolean {
  return (
    a?.label === b?.label &&
    a?.actionId === b?.actionId &&
    sameChoicePayload(a?.actionId, a?.payload, b?.payload)
  );
}

function sameChoicePayload(actionId: string | undefined, a: any, b: any): boolean {
  switch (actionId) {
    case 'beat_choice':
      return a?.beatId === b?.beatId && a?.choiceId === b?.choiceId;
    case 'move_to_room':
      return a?.roomId === b?.roomId;
    case 'look_at':
      return a?.affordanceId === b?.affordanceId;
    default:
      return true;
  }
}

function choiceLabelForState(state: any, actionId: string, payload?: any) {
  return (
    displayPendingChoices(state).find((choice: any) =>
      choiceMatchesAction(choice, actionId, payload),
    )?.label ??
    state.pendingChoices.find((choice: any) => choiceMatchesAction(choice, actionId, payload))
      ?.label ??
    actionId
  );
}

function choiceMatchesAction(choice: any, actionId: string, payload?: any): boolean {
  if (choice?.actionId !== actionId) return false;
  return sameChoicePayload(actionId, choice?.payload, payload);
}

function beatTitle(beatId: string) {
  return BEAT_TITLES[beatId] ?? beatId;
}

function beatLead(beatId: string, state: any, ready: boolean): BeatLead {
  const title = beatTitle(beatId);
  const requirements: string[] = [];
  const lead = (summary: string, detail: string): BeatLead => ({
    beatId,
    title,
    ready,
    summary,
    detail,
    requirements,
  });

  if (state.beatActive === beatId) {
    return lead(
      'Pick one of the current story choices.',
      'The active beat advances only when you choose one of the buttons below.',
    );
  }
  if (ready) {
    return lead(
      `${title} is ready to open.`,
      'Take any available action and the narrator will move into this beat.',
    );
  }

  switch (beatId) {
    case 'lawyers-office':
      return lead('Begin the inheritance scene.', 'Start a new game to enter the opening beat.');
    case 'arrival':
      requirements.push('Finish the inheritance papers beat.');
      return lead('Finish the inheritance decision.', 'Arrival opens right after Kyle signs.');
    case 'accept-task':
      requirements.push('Meet the Mayor.');
      return lead("Hear the Mayor's Task offer.", 'Finish the arrival scene first.');
    case 'first-night':
      if (state.location !== 'kyle-cottage') requirements.push("Return to Kyle's Cottage.");
      return lead(
        state.location === 'kyle-cottage'
          ? 'Settle in at the cottage.'
          : "Return to Kyle's Cottage.",
        'The first-night beat opens in the cottage after Kyle accepts the Task.',
      );
    case 'morning-chores':
      requirements.push('Complete the first night.');
      return lead('Sleep until morning.', 'Harold arrives after the first-night beat resolves.');
    case 'rescue-elvira':
      if (state.location !== 'kyle-field') requirements.push("Go to Kyle's Field.");
      return lead(
        state.location === 'kyle-field' ? 'Work the field.' : "Go to Kyle's Field.",
        'The next story event is waiting in the brambles outside the cottage.',
      );
    case 'town-visit':
      if (state.location !== 'town-square') requirements.push('Walk to Town Square.');
      return lead(
        state.location === 'town-square' ? 'Look around Town Square.' : 'Walk to Town Square.',
        'The next town scene opens in the square after Elvira is rescued.',
      );
    case 'mushroom-mistake':
      if (state.location !== 'forest-edge') requirements.push('Head to the Forest Edge.');
      return lead(
        state.location === 'forest-edge'
          ? 'Forage at the Forest Edge.'
          : 'Head to the Forest Edge.',
        'The next beat opens once Kyle reaches the forest after visiting town.',
      );
    case 'evening-at-inn':
      if (state.timeOfDay === 'morning') requirements.push('Wait until midday or later.');
      if (state.location !== 'willow-branch-inn') requirements.push('Go to the Willow Branch Inn.');
      return lead(
        requirements.length === 0
          ? 'Spend time at the Willow Branch Inn.'
          : 'Visit the Willow Branch Inn after morning.',
        'This beat needs the inn and a time block later than morning.',
      );
    case 'first-harvest':
      if (state.day < 3) requirements.push('Reach Day 3.');
      if (state.location !== 'kyle-field') requirements.push("Go to Kyle's Field.");
      return lead(
        requirements.length === 0 ? 'Check the field for harvest.' : 'Reach Day 3 at the field.',
        "Kyle's first harvest opens in the field on Day 3 or later.",
      );
    case 'curse-hint':
      if (state.location !== 'town-square') requirements.push('Walk to Town Square.');
      return lead(
        state.location === 'town-square'
          ? 'Talk with Milo in Town Square.'
          : 'Walk to Town Square.',
        'Milo has the next clue after the first harvest.',
      );
    case 'cliffhanger':
      if (state.location !== 'mountain-monastery')
        requirements.push('Go to the Mountain Monastery.');
      return lead(
        state.location === 'mountain-monastery'
          ? 'Find Laurel at the monastery.'
          : 'Go to the Mountain Monastery.',
        'Laurel opens the next chapter after Kyle learns about the broken statue.',
      );
    default:
      return lead(`Advance ${title}.`, 'Follow the current room, time, and story requirements.');
  }
}

function inspectorStateSnapshot(state: any) {
  return {
    day: state.day,
    timeOfDay: state.timeOfDay,
    clockMinutes: state.clockMinutes,
    location: state.location,
    coins: state.coins,
    inventory: state.inventory,
    hearts: state.hearts,
    flags: state.flags,
    beatActive: state.beatActive,
    beatsCompleted: state.beatsCompleted,
    turn: state.turn,
  };
}

function stateDelta(before: Record<string, unknown>, after: Record<string, unknown>) {
  const delta: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      delta[key] = { before: before[key], after: after[key] };
    }
  }
  return delta;
}

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
    const progress = narrativeProgress(save as any);
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
      pendingChoices: displayPendingChoices(save as any),
      progress,
      turn: save.turn,
      narrating: save.narrating,
    };
  },
});

export const debugPanel = query({
  args: { slot: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const slot = args.slot ?? DEFAULT_SLOT;
    const limit = Math.max(1, Math.min(args.limit ?? 16, 50));
    const save = await ctx.db
      .query('narrativeState')
      .withIndex('slot', (q) => q.eq('slot', slot))
      .unique();
    if (!save) return null;

    const room = roomExists(save.location) ? getRoom(save.location as RoomId) : null;
    const progress = narrativeProgress(save as any);
    const operations = await ctx.db
      .query('narrativeOperations')
      .withIndex('saveId', (q) => q.eq('saveId', save._id))
      .order('desc')
      .take(limit);
    const operationSummaries = operations.map((op) => ({
      id: op._id,
      turn: op.turn,
      status: op.status,
      created: op.created,
      completed: op.completed ?? null,
      error: op.error ?? null,
      model: op.model ?? null,
      context: {
        reason: (op.context as any)?.reason ?? null,
        actionId: (op.context as any)?.actionId ?? null,
        freeText: (op.context as any)?.freeText ?? null,
        beatId: (op.context as any)?.beatId ?? null,
        briefing: (op.context as any)?.briefing ?? null,
        roomName: (op.context as any)?.roomName ?? null,
        location: (op.context as any)?.location ?? null,
        availableActions: (op.context as any)?.availableActions ?? [],
        stateDelta: (op.context as any)?.stateDelta ?? null,
      },
      toolCalls: op.toolCalls ?? [],
    }));

    return {
      slot: save.slot,
      model: operations.find((op) => typeof op.model === 'string')?.model ?? null,
      currentOperation:
        operationSummaries.find((op) => op.status === 'inProgress' || op.status === 'queued') ??
        null,
      operations: operationSummaries,
      progress,
      gameState: {
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
        beatsCompleted: save.beatsCompleted,
        pendingChoices: save.pendingChoices,
        availableActions: availableActions(save as any),
        turn: save.turn,
        narrating: save.narrating,
        createdAt: save.createdAt,
        updatedAt: save.updatedAt,
      },
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
      "Kyle Farmer has just arrived at his late grandfather's cottage in Willow Creek. Open the scene briefly.";
    if (beat) {
      initial.beatActive = beat.id;
      briefing = beat.openingBriefing(initial as any);
    }
    initial.pendingChoices = availableActions(initial);

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

    if (args.actionId !== 'free_text') {
      const legal = availableActions(save as any).some((choice) =>
        choiceMatchesAction(choice, args.actionId, args.payload),
      );
      if (!legal) {
        throw new Error(`Action is not currently available: ${args.actionId}`);
      }
    }

    const now = Date.now();
    const stateBefore = inspectorStateSnapshot(save as any);
    const activeBeat = save.beatActive ? getBeat(save.beatActive) : null;
    const softLockedAction = Boolean(activeBeat && args.actionId !== 'beat_choice');
    const action = softLockedAction ? null : getAction(args.actionId);
    if (!softLockedAction && !action) {
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
    const chosenLabel = choiceLabelForState(working, args.actionId, args.payload);
    const playerLine = args.freeText ? `> ${args.freeText}` : `> ${chosenLabel}`;
    working.transcript = [
      ...working.transcript,
      { role: 'player' as const, text: playerLine, turn: working.turn + 1, at: now },
    ];

    const payload = args.freeText ? { text: args.freeText, ...args.payload } : args.payload;
    const result = softLockedAction
      ? {
          narratorBriefing: args.freeText
            ? `The player typed during the active story beat: "${args.freeText}". Respond briefly as flavor, but do not change the world state. Then continue the active beat.`
            : `The player tried "${chosenLabel}" during the active story beat. Treat it as flavor only; do not change location, time, inventory, flags, coins, or relationships. Then continue the active beat.`,
          clockMinutes: 0,
        }
      : action!.run(working as any, payload, now);

    if (!softLockedAction) {
      advanceClock(working as any, result.clockMinutes ?? 15);
    }

    // Increment turn. Choices are engine-owned, so recompute them after action/trigger resolution.
    working.turn += 1;
    working.narrating = true;
    working.updatedAt = now;

    if (result.preNarratorTranscript) {
      working.transcript = [...working.transcript, ...result.preNarratorTranscript];
    }

    // ----- Trigger evaluation. Did a new beat open after this action? -----
    // The trigger selector returns one beat, so a single player action cannot cascade
    // through multiple beats in the same turn.
    let briefing = result.narratorBriefing;
    let activeBeatId: string | null = working.beatActive;
    if (working.beatActive) {
      activeBeatId = working.beatActive;
    } else {
      const next = selectBeat(working);
      if (next) {
        working.beatActive = next.id;
        activeBeatId = next.id;
        // The narrator paints the action result THEN the new beat opens. Stack briefings.
        briefing = `${briefing}\n\nA new beat opens: ${next.openingBriefing(working)}`;
      }
    }

    working.pendingChoices = availableActions(working);
    const stateAfter = inspectorStateSnapshot(working);

    await ctx.db.replace(save._id, working as any);

    // Enqueue the narrator op so the agent-runner can paint the result.
    await enqueueNarratorOp(ctx, save._id, working.turn, {
      reason: 'scripted_action',
      actionId: args.actionId,
      actionLabel: chosenLabel,
      actionPayload: args.payload ?? null,
      briefing,
      freeText: args.freeText ?? null,
      beatId: activeBeatId,
      stateBefore,
      stateAfter,
      stateDelta: stateDelta(stateBefore, stateAfter),
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
      beatId: context.beatId ?? save.beatActive,
      availableActions: availableActions(save),
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
    ...(typeof context.actionId === 'string' ? { actionId: context.actionId } : {}),
    ...(typeof context.actionLabel === 'string' ? { actionLabel: context.actionLabel } : {}),
    ...(context.actionPayload !== undefined ? { actionPayload: context.actionPayload } : {}),
    ...(typeof context.freeText === 'string' ? { freeText: context.freeText } : {}),
    ...(context.stateBefore !== undefined ? { stateBefore: context.stateBefore } : {}),
    ...(context.stateAfter !== undefined ? { stateAfter: context.stateAfter } : {}),
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

export const setNarratorModel = mutation({
  args: { operationId: v.id('narrativeOperations'), model: v.string() },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) return null;
    await ctx.db.patch(op._id, { model: args.model });
    return { ok: true };
  },
});

export const recordNarratorToolFailure = mutation({
  args: {
    operationId: v.id('narrativeOperations'),
    tool: v.string(),
    args: v.any(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) return null;
    await ctx.db.patch(op._id, {
      toolCalls: [
        ...(op.toolCalls ?? []),
        {
          tool: args.tool,
          args: args.args,
          output: {
            effect: 'tool_rejected',
            error: args.error,
          },
          at: Date.now(),
          ok: false,
          error: args.error,
        },
      ],
    });
    return { ok: true };
  },
});

export const narratorTool = mutation({
  args: {
    operationId: v.id('narrativeOperations'),
    tool: v.union(v.literal('narrate'), v.literal('npc_speak'), v.literal('end_turn')),
    text: v.optional(v.string()),
    speaker: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) throw new Error(`narratorTool: unknown operation ${args.operationId}`);
    if (op.status !== 'inProgress') {
      throw new Error(
        `narratorTool: operation ${args.operationId} is ${op.status}, not inProgress`,
      );
    }
    const save = await ctx.db.get(op.saveId);
    if (!save) throw new Error(`narratorTool: missing save for op`);

    // Per-turn cap. Includes presentation tools only; choices are engine-owned.
    const used = (save.flags['__toolCallsThisTurn'] as number | undefined) ?? 0;
    const budget = (op.context as any).toolBudget ?? NARRATOR_TOOL_BUDGET;
    if (args.tool !== 'end_turn' && used >= budget) {
      throw new Error('narratorTool: tool budget exhausted; call end_turn');
    }

    const now = Date.now();
    const transcript = save.transcript.slice();
    const pendingChoices = availableActions(save as any);
    const flags = { ...save.flags };

    let output: Record<string, unknown> = {};
    let operationPatch: Record<string, unknown> = {};

    switch (args.tool) {
      case 'narrate': {
        const text = (args.text ?? '').trim();
        if (!text) throw new Error('narrate: text is required');
        if (text.length > 500) throw new Error('narrate: text exceeds 500 chars');
        transcript.push({ role: 'narrator', text, turn: op.turn, at: now });
        flags['__toolCallsThisTurn'] = used + 1;
        output = {
          effect: 'transcript_appended',
          role: 'narrator',
          text,
          transcriptLength: transcript.length,
        };
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
        output = {
          effect: 'transcript_appended',
          role: 'npc',
          speaker,
          text,
          transcriptLength: transcript.length,
        };
        break;
      }
      case 'end_turn': {
        flags['__toolCallsThisTurn'] = 0;
        operationPatch = { ...operationPatch, status: 'done', completed: now };
        output = {
          effect: 'turn_completed',
          operationStatus: 'done',
          narrating: false,
          choicesSource: 'engine',
          pendingChoiceCount: pendingChoices.length,
        };
        break;
      }
    }

    operationPatch = {
      ...operationPatch,
      toolCalls: [
        ...(op.toolCalls ?? []),
        {
          tool: args.tool,
          args: narratorToolLogArgs(args),
          output,
          at: now,
          ok: true,
        },
      ],
    };

    await ctx.db.patch(op._id, operationPatch);
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

function narratorToolLogArgs(args: {
  tool: 'narrate' | 'npc_speak' | 'end_turn';
  text?: string;
  speaker?: string;
}) {
  if (args.tool === 'narrate') {
    return { text: args.text ?? '' };
  }
  if (args.tool === 'npc_speak') {
    return { speaker: args.speaker ?? '', text: args.text ?? '' };
  }
  return {};
}

export const failNarrateOp = mutation({
  args: { operationId: v.id('narrativeOperations'), error: v.string() },
  handler: async (ctx, args) => {
    const op = await ctx.db.get(args.operationId);
    if (!op) return null;
    await ctx.db.patch(op._id, { status: 'failed', error: args.error, completed: Date.now() });
    const save = await ctx.db.get(op.saveId);
    if (save) {
      // Make sure the player isn't stuck.
      const fallback = availableActions(save as any);
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
