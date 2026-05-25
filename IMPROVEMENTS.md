# Architecture Improvements

These are planned improvements to make the game a guided story with player agency that always reaches its ending.

---

## 1. Replace the priority queue with a story graph

The current `selectBeat` is a flat priority sort. It cannot express "beat B only matters if you chose option X in beat A" or "you can do beats C and D in either order, but both must happen before E."

Replace it with a DAG where each beat declares `prerequisites: string[]` (other beat IDs that must be complete) and optional `conflicts: string[]` (mutually exclusive). The path from current state to the `cliffhanger` end-beat becomes computable, which unlocks everything below.

**Files to change:** `convex/narrative/beats.ts`, `convex/narrative/beats/index.ts`, `convex/narrative/triggers.ts`

---

## 2. Give the narrator a steering hint

Right now the agent-runner's system prompt tells the narrator the current scene, NPCs, available actions, and transcript — but not where the story needs to go next. The narrator will often naturally react to the moment rather than advance the plot.

Add a `storyHint` field to the narrator op context, computed from the story graph: `"Player has not yet triggered [morning-chores]. Harold should feel present and relevant. The field is the next productive location."` The narrator uses this as a soft goal without it being visible to the player. This keeps agency while guaranteeing eventual progress.

**Files to change:** `convex/narrative/api.ts` (`enqueueNarratorOp`), `mcp/agent-runner.mjs` (`narratorSystemPrompt`)

---

## 3. Two tiers of beat: hard and soft

**Hard beats** (current behavior) fire immediately when the player enters the right room. **Soft beats** instead inject a narrative hook — a rumor, an NPC remark, a visual cue — that makes the player *want* to go somewhere, but do not force it. The soft trigger upgrades to hard after N turns of inaction.

This makes the world feel alive and suggestive rather than scripted, while still guaranteeing the player reaches the end.

Add a `triggerMode: 'hard' | 'soft'` field to the `Beat` type. For soft beats, `selectBeat` does not set `beatActive` immediately — instead it sets a `pendingSoftBeat` flag on state and passes the beat's `openingBriefing` to the narrator as a hint. A separate staleness counter promotes soft beats to hard after a configurable turn threshold.

**Files to change:** `convex/narrative/beats.ts`, `convex/narrative/beats/index.ts`, `convex/narrative/triggers.ts`, `convex/narrative/state.ts`, `convex/narrative/api.ts`

---

## 4. NPCs can come find the player

Several beats require the player to travel to a specific room (`curse-hint` requires `town-square`, `cliffhanger` requires `mountain-monastery`). If the player never goes there, the game stalls silently.

Instead: after a configurable number of turns pass without triggering a critical beat, the `NPC_PRESENCE` table shifts to put the relevant NPC in the player's current location, and the narrator is told that the NPC has "stopped by." The beat fires wherever the player is.

Add a `travelTimeoutTurns: number` field to the `Beat` type and a `visitsPlayer: boolean` flag. In `enqueueNarratorOp`, check whether any active soft beat has exceeded its timeout and, if so, inject the NPC into the current room's presence for that op context only.

**Files to change:** `convex/narrative/beats.ts`, `convex/narrative/beats/index.ts`, `convex/narrative/api.ts`, `convex/narrative/rooms.ts`

---

## 5. Free-text with real consequence

Currently `free_text` is a zero-state-change action — it passes the player's words to the narrator as flavor. The narrator cannot grant items, change hearts, or advance beats in response to natural language.

Route free-text through a lightweight intent-classification step in `agent-runner.mjs` before building the full system prompt. If the player's text maps to a known affordance, NPC interaction, or beat-relevant social action, translate it to that action and process its state effects before narration begins. Add a `resolvedFreeText` field to the narrator op context so the narrator knows what actually happened.

**Files to change:** `mcp/agent-runner.mjs`, `convex/narrative/api.ts` (`enqueueNarratorOp`), `convex/schema.ts`

---

## 6. Structured consequences sent to the narrator

After `beat.resolve()` runs, the current op context does not tell the narrator what changed — it gives the mutated state. The narrator has to infer that the player gained a watering can.

Pass an explicit `consequences: Array<{type: string, ...details}>` array in the narrator op context. Examples: `{type: 'item_gained', name: 'Watering Can'}`, `{type: 'heart_changed', npc: 'Laurel', delta: 1}`, `{type: 'flag_set', key: 'inheritanceSigned', value: true}`. The narrator system prompt instructs the narrator to acknowledge each consequence naturally within its prose.

**Files to change:** `convex/narrative/beats/index.ts` (each `resolve` returns consequences alongside the briefing string), `convex/narrative/beats.ts` (`Beat` type), `convex/narrative/api.ts` (`narratorTool` end_turn handling), `convex/schema.ts` (op context shape)

---

## 7. Multi-turn beat conversations

All 12 beats present 2–3 choices and resolve instantly. Richer beats could have a `dialogueStages` field: an initial choice leads to a follow-up that leads to resolution. The beat stays `beatActive` across multiple turns, each turn advancing the stage. The `pendingChoices` at each stage come from the beat's current dialogue stage, not the room's default actions.

This makes significant moments (the inheritance papers, accepting the Task) feel weightier without removing player agency.

Add `dialogueStages?: Array<{prompt: string, choices: (state) => PendingChoice[]}>` to the `Beat` type. Track the current stage index in `state.flags` (e.g., `beatStage_lawyers-office: 1`). The `beat_choice` action handler advances the stage rather than resolving the beat until the final stage is reached.

**Files to change:** `convex/narrative/beats.ts`, `convex/narrative/beats/index.ts`, `convex/narrative/actions.ts`, `convex/narrative/api.ts`

---

## 9. Narrator memory via summarization

The narrator only receives recent transcript entries. Over a 3-day story, it forgets that the player chose to hesitate on the inheritance papers or that they freed Elvira.

Add a background summarization step: after each in-game day completes (detectable when `advanceClock` rolls `state.day` forward), enqueue a lightweight LLM call in the agent-runner that compresses the day's transcript into a 2–3 sentence "story so far." Store the result in `state.flags` (e.g., `storySummary_day1`). Prepend all prior day summaries to every subsequent narrator system prompt so the narrator has a persistent sense of the player's specific story path.

**Files to change:** `mcp/agent-runner.mjs`, `convex/narrative/api.ts` (new `recordDaySummary` mutation), `convex/schema.ts`

---

## 10. Guaranteed ending mechanism

The `cliffhanger` beat has `priority: 100` but requires the player to be at `mountain-monastery`. Nothing in the current architecture forces or counts toward that.

Add a `hardDeadline` field to the `Beat` type: a `{day: number, timeOfDay: TimeOfDay}` after which the beat must fire regardless of location. In the `narratorTool` end_turn handler, after running `selectBeat`, also check whether any incomplete beat has passed its `hardDeadline`. If so, override `state.location` to the beat's target room (or inject the NPC into the current room) and fire the beat. Laurel arriving at the player's location on Day 3 evening is the concrete instance of this.

**Files to change:** `convex/narrative/beats.ts`, `convex/narrative/beats/index.ts`, `convex/narrative/api.ts` (`narratorTool` end_turn), `convex/narrative/triggers.ts`
