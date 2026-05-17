Make a plan to implement these two things:

## Tree-of-objects world model
Recursive POI hierarchy (Café > kitchen > stove > burner) with affordances ("sit", "make coffee"). The most complex piece of the Smallville simulation; punted until the first six phases prove out.

When picked up, hooks would land in:
- `convex/aiTown/worldMap.ts` — recursive tree on each POI (`subObjects: { id, name, affordances }`).
- `data/pois.ts` — extend each POI with `subObjects`.
- `mcp/agent-runner.mjs` — surface nearby affordances in the prompt; new MCP tool `do_use_object`.
- Engine input `useObject` and an `Agent.tick` branch for currently-using-an-affordance state.

## Consistent starting place per character
Right now every player spawn picks a random unblocked tile in [Player.join](convex/aiTown/player.ts). Once homes exist (Phases 2 + 3), `Player.join` should look up the agent's `homeName`, resolve to the POI's center, and place the character there on creation. Pure code change, no new schema.

Single touch point: the `for (let attempt = 0; attempt < 10; attempt++)` random-position loop in `Player.join`.