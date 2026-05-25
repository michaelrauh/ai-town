import { Infer, v } from 'convex/values';

// ---------- Inventory item ----------
// (Inlined from convex/aiTown/inventory.ts; that module was deleted in the dead-code prune.)

export const inventoryItem = v.object({
  itemId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  emoji: v.optional(v.string()),
  tags: v.array(v.string()),
  sellPrice: v.optional(v.number()),
  sourceObjectRef: v.optional(v.string()),
});
export type InventoryItem = Infer<typeof inventoryItem>;

// ---------- Constants ----------

export const TIMES_OF_DAY = ['morning', 'midday', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export const TIME_ORDER: TimeOfDay[] = [...TIMES_OF_DAY];

// How many in-game minutes pass between time-of-day blocks.
export const BLOCK_MINUTES = 180;
// How many in-game minutes a turn costs by default if the action doesn't specify.
export const DEFAULT_ACTION_MINUTES = 15;
// Per-turn cap on tool calls the narrator can make.
export const NARRATOR_TOOL_BUDGET = 8;

// ---------- Transcript ----------

export const transcriptEntry = v.object({
  role: v.union(v.literal('narrator'), v.literal('player'), v.literal('npc'), v.literal('system')),
  speaker: v.optional(v.string()), // NPC id for npc lines
  text: v.string(),
  turn: v.number(),
  at: v.number(), // wallclock ms (for ordering only)
});
export type TranscriptEntry = Infer<typeof transcriptEntry>;

// ---------- Choices offered to the player ----------

export const pendingChoice = v.object({
  label: v.string(),
  actionId: v.string(),
  // Optional opaque payload the action handler will receive (e.g. beatChoiceId).
  payload: v.optional(v.any()),
});
export type PendingChoice = Infer<typeof pendingChoice>;

// ---------- Game state ----------

export const timeOfDay = v.union(
  v.literal('morning'),
  v.literal('midday'),
  v.literal('afternoon'),
  v.literal('evening'),
  v.literal('night'),
);

export const narrativeStateFields = {
  slot: v.string(),
  day: v.number(),
  timeOfDay,
  // In-game clock minute-of-day, 0..1439. Provides finer granularity than blocks.
  clockMinutes: v.number(),
  location: v.string(), // roomId
  coins: v.number(),
  inventory: v.array(inventoryItem),
  // Heart counts keyed by NPC name (e.g. 'Harold').
  hearts: v.record(v.string(), v.number()),
  beatsCompleted: v.array(v.string()),
  beatActive: v.union(v.string(), v.null()),
  flags: v.record(v.string(), v.union(v.boolean(), v.string(), v.number())),
  transcript: v.array(transcriptEntry),
  // Choices the player can pick next turn. Replaced fully each turn.
  pendingChoices: v.array(pendingChoice),
  turn: v.number(),
  // True while a narrator operation is in flight; UI shows "..."
  narrating: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const narrativeStateValidator = v.object(narrativeStateFields);
export type NarrativeStateDoc = Infer<typeof narrativeStateValidator>;

// ---------- Helpers (pure functions; safe to import on server or in shared logic) ----------

export function advanceClock(
  state: { clockMinutes: number; timeOfDay: TimeOfDay; day: number },
  minutes: number,
): void {
  const total = state.clockMinutes + Math.max(0, Math.floor(minutes));
  state.clockMinutes = total % 1440;
  const daysPassed = Math.floor(total / 1440);
  state.day += daysPassed;
  state.timeOfDay = timeOfDayFromMinutes(state.clockMinutes);
}

// Time-of-day blocks (in minutes-of-day). Independent of the deleted real-time
// day cycle; this is purely turn-based. Hours 0-5 fall under "morning" too —
// fine for a cozy farming game that starts at 8 AM.
const BLOCK_BOUNDARIES_MINUTES: Array<[TimeOfDay, number]> = [
  ['morning', 11 * 60], // up to 11:00 AM
  ['midday', 14 * 60], // 11 AM – 2 PM
  ['afternoon', 18 * 60], // 2 PM – 6 PM
  ['evening', 21 * 60], // 6 PM – 9 PM
  ['night', 24 * 60], // 9 PM – midnight (wraps to morning at 0:00)
];

export function timeOfDayFromMinutes(minutes: number): TimeOfDay {
  const m = ((minutes % 1440) + 1440) % 1440;
  for (const [block, end] of BLOCK_BOUNDARIES_MINUTES) {
    if (m < end) return block;
  }
  return 'night';
}

// Initial state factory.
export function makeInitialState(now: number, slot: string): Omit<NarrativeStateDoc, never> {
  return {
    slot,
    day: 1,
    timeOfDay: 'morning',
    clockMinutes: 8 * 60, // 8:00 AM
    location: 'lawyers-office',
    coins: 200,
    inventory: [],
    hearts: {},
    beatsCompleted: [],
    beatActive: null,
    flags: {},
    transcript: [
      {
        role: 'system',
        text: "Kyle Farmer's story begins in a Detroit lawyer's office, with his late grandfather's inheritance papers waiting on the table.",
        turn: 0,
        at: now,
      },
    ],
    pendingChoices: [],
    turn: 0,
    narrating: false,
    createdAt: now,
    updatedAt: now,
  };
}
