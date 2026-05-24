import type { Beat } from './beats';
import { listBeats } from './beats';
import type { NarrativeStateDoc } from './state';

/**
 * Pick the highest-priority beat whose preconditions match.
 * Skips beats already in beatsCompleted (one-shot).
 * Returns null if nothing fires.
 */
export function selectBeat(state: NarrativeStateDoc): Beat | null {
  let chosen: Beat | null = null;
  for (const b of listBeats()) {
    if (state.beatsCompleted.includes(b.id)) continue;
    if (state.beatActive === b.id) continue; // Already running.
    let matched = false;
    try {
      matched = b.preconditions(state);
    } catch {
      matched = false;
    }
    if (!matched) continue;
    if (!chosen || b.priority > chosen.priority) {
      chosen = b;
    }
  }
  return chosen;
}
