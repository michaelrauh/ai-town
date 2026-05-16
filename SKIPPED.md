# Deferred / Skipped features

Things the Smallville-style rebuild deliberately did not implement. Pick up later.

## Phase 7 — Tree-of-objects world model
Recursive POI hierarchy (Café > kitchen > stove > burner) with affordances ("sit", "make coffee"). The most complex piece of the Smallville simulation; punted until the first six phases prove out.

When picked up, hooks would land in:
- `convex/aiTown/worldMap.ts` — recursive tree on each POI (`subObjects: { id, name, affordances }`).
- `data/pois.ts` — extend each POI with `subObjects`.
- `mcp/agent-runner.mjs` — surface nearby affordances in the prompt; new MCP tool `do_use_object`.
- Engine input `useObject` and an `Agent.tick` branch for currently-using-an-affordance state.

## Consistent starting place per character
Right now every player spawn picks a random unblocked tile in [Player.join](convex/aiTown/player.ts). Once homes exist (Phases 2 + 3), `Player.join` should look up the agent's `homeName`, resolve to the POI's center, and place the character there on creation. Pure code change, no new schema.

Single touch point: the `for (let attempt = 0; attempt < 10; attempt++)` random-position loop in `Player.join`.

## Pause menu
Larger UI feature. Hooks needed:

**UI**
- New button next to **Restart**: **Pause**. Opens a modal panel.
- Modal contains: **Resume**, **Restart** (existing flow), **Save**, **Load**.

**Engine pause that also blocks API calls**
- Reuse the existing `runnerControl.paused` flag (added with the restart fix). When the pause menu opens, set `paused = true`. The MCP runner's main loop already checks this and sleeps without claiming ops, so no Ollama/OpenAI calls go out.
- Engine itself: call `testing.stop` so the simulation also stops ticking. Resume calls `testing.resume` + clears `paused`.

**Save / Load — single slot, one file at a time**
- Convex action `saveGame` snapshots: `worlds`, `worldStatus`, `engines`, `inputs` head-state, `conversations` (already nested in worlds), `memories`, `memoryEmbeddings`, `playerDescriptions`, `agentDescriptions`, `messages`, `participatedTogether`. Skip `mcpAgentOperations` (transient).
- Write the snapshot to a fixed Convex file storage slot (or a fixed local path if self-hosted). Overwrite on each save — no slot picker.
- Convex action `loadGame`: must do `setRunnerPaused(true)` → wipe live tables → replay the snapshot rows → `setRunnerPaused(false)`. Reuse the wipe pattern from `testing.restart`.

**Scope estimate**
- UI panel + buttons: ~100 LOC across `src/components/PauseMenu.tsx` + a Game.tsx mount.
- Save/Load actions: ~150 LOC in `convex/testing.ts` (or a new `convex/saves.ts`).
- Total: ~250 LOC. Independent of the Smallville rebuild.
