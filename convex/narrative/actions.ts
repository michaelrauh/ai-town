import { advanceClock, NarrativeStateDoc, TranscriptEntry } from './state';
import { getRoom, roomExists, RoomId } from './rooms';
import { getBeat } from './beats';

export type ActionResult = {
  // What the narrator will be told just happened (used in the system prompt as briefing).
  narratorBriefing: string;
  // Optional: minutes the clock should advance after the action. Default: 15.
  clockMinutes?: number;
  // Optional: a deterministic free-text message to append before the narrator paints.
  preNarratorTranscript?: TranscriptEntry[];
};

export type ScriptedAction = {
  id: string;
  description: string; // for documentation / debugging
  run: (state: NarrativeStateDoc, payload: unknown, now: number) => ActionResult;
};

// Built-in scripted actions. Beat-specific choices use a generic `beat_choice` action
// dispatched in api.ts (Phase 3).
const builtins: Record<string, ScriptedAction> = {
  move_to_room: {
    id: 'move_to_room',
    description: 'Move the player from the current room to a connected room.',
    run: (state, payload) => {
      const target = (payload as { roomId?: string } | undefined)?.roomId;
      if (!target || !roomExists(target)) {
        throw new Error(`move_to_room: invalid roomId ${String(target)}`);
      }
      const current = getRoom(state.location as RoomId);
      if (!current.exits.includes(target)) {
        throw new Error(`move_to_room: ${target} is not reachable from ${state.location}`);
      }
      state.location = target;
      const dest = getRoom(target);
      return {
        narratorBriefing: `Kyle has just walked from ${current.name} to ${dest.name}. Describe arrival in 1-2 short sentences. ${dest.description}`,
        clockMinutes: 15,
      };
    },
  },

  look_at: {
    id: 'look_at',
    description: 'Examine an affordance in the current room.',
    run: (state, payload) => {
      const id = (payload as { affordanceId?: string } | undefined)?.affordanceId;
      const room = getRoom(state.location as RoomId);
      const aff = room.affordances?.find((a) => a.id === id);
      if (!aff) {
        throw new Error(`look_at: unknown affordance "${String(id)}" in ${state.location}`);
      }
      return {
        narratorBriefing: `Kyle looks at: ${aff.label}. ${aff.briefing} Describe what Kyle observes in 1-2 sentences.`,
        clockMinutes: 5,
      };
    },
  },

  look_around: {
    id: 'look_around',
    description: 'Take in the current room.',
    run: (state) => {
      const room = getRoom(state.location as RoomId);
      return {
        narratorBriefing: `Kyle takes in the room. ${room.description} Describe in 1-2 sentences with fresh sensory detail.`,
        clockMinutes: 1,
      };
    },
  },

  wait: {
    id: 'wait',
    description: 'Wait in place. Advances the clock by 30 minutes.',
    run: () => ({
      narratorBriefing: 'Kyle waits, watching the light shift. Describe the passing time briefly.',
      clockMinutes: 30,
    }),
  },

  free_text: {
    id: 'free_text',
    description: 'Player typed free-form text. Painted by the narrator with no state change.',
    run: (_state, _payload, _now) => ({
      narratorBriefing:
        'The player has spoken or acted freely. Respond in-character through the NPCs present and through narration. Do not invent items or change the world; this action has no mechanical effect.',
      clockMinutes: 0,
    }),
  },

  beat_choice: {
    id: 'beat_choice',
    description: 'Resolve the active story beat with the chosen choiceId.',
    run: (state, payload) => {
      const p = (payload ?? {}) as { beatId?: string; choiceId?: string };
      if (!p.beatId || !p.choiceId) {
        throw new Error('beat_choice: payload requires beatId and choiceId');
      }
      if (state.beatActive !== p.beatId) {
        throw new Error(
          `beat_choice: active beat is ${state.beatActive ?? 'none'}, not ${p.beatId}`,
        );
      }
      const beat = getBeat(p.beatId);
      if (!beat) {
        throw new Error(`beat_choice: unknown beat ${p.beatId}`);
      }
      const valid = beat.choices(state).some((c) => c.id === p.choiceId);
      if (!valid) {
        throw new Error(`beat_choice: ${p.choiceId} is not a valid choice for ${p.beatId}`);
      }
      const briefing = beat.resolve(state, p.choiceId);
      // Mark complete + clear.
      if (!state.beatsCompleted.includes(p.beatId)) {
        state.beatsCompleted.push(p.beatId);
      }
      state.beatActive = null;
      return {
        narratorBriefing: briefing,
        clockMinutes: 5,
      };
    },
  },
};

export function getAction(id: string): ScriptedAction | undefined {
  return builtins[id];
}

export function allActionIds(): string[] {
  return Object.keys(builtins);
}
