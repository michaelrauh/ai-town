
## Consistent starting place per character
Right now every player spawn picks a random unblocked tile in [Player.join](convex/aiTown/player.ts). Once homes exist (Phases 2 + 3), `Player.join` should look up the agent's `homeName`, resolve to the POI's center, and place the character there on creation. Pure code change, no new schema.

Single touch point: the `for (let attempt = 0; attempt < 10; attempt++)` random-position loop in `Player.join`.