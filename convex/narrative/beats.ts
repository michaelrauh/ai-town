import type { NarrativeStateDoc } from './state';

/** A scripted story beat. */
export type Beat = {
  id: string;
  /** Higher = preferred when multiple beats match. */
  priority: number;
  /** Does this beat want to fire now? */
  preconditions: (state: NarrativeStateDoc) => boolean;
  /**
   * 1-3 sentence briefing the narrator paints when the beat OPENS. Tell the LLM
   * exactly what to describe; do not include the choice list (the engine attaches
   * the choices to the prompt separately).
   */
  openingBriefing: (state: NarrativeStateDoc) => string;
  /**
   * Choices the player MUST pick from. Each becomes an offer_choice with
   * actionId='beat_choice' and payload={beatId, choiceId}.
   * Return [] to auto-advance with a single implicit "continue".
   */
  choices: (state: NarrativeStateDoc) => Array<{ id: string; label: string }>;
  /**
   * Mutate state in response to the chosen choiceId. Return a 1-3 sentence
   * briefing the narrator paints to describe the result.
   */
  resolve: (state: NarrativeStateDoc, choiceId: string) => string;
};

// Per-beat-choice payload sent through the offer_choice tool.
export type BeatChoicePayload = { beatId: string; choiceId: string };

// Registry: assembled by beats/index.ts to keep beats discoverable.
import { allBeats } from './beats/index';

const REGISTRY: Map<string, Beat> = new Map(allBeats.map((b) => [b.id, b]));

export function getBeat(id: string): Beat | undefined {
  return REGISTRY.get(id);
}

export function listBeats(): Beat[] {
  return Array.from(REGISTRY.values());
}
