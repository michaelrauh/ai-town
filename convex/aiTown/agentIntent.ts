import { ObjectType, v } from 'convex/values';
import { scheduleBlockEnd } from '../constants';
import { playerId } from './ids';

export { scheduleBlockEnd };

export const AGENT_INTENT_KINDS = [
  'followSchedule',
  'goToPoi',
  'stayAtPoi',
  'talkToPlayer',
  'avoidPlayer',
  'useObject',
  'buyItem',
  'sellItem',
  'pickUpItem',
  'putDownItem',
  'activity',
] as const;

export const AGENT_INTENT_SOURCES = [
  'schedule',
  'reflection',
  'conversation',
  'self',
  'system',
] as const;

export const agentIntentKind = v.union(
  v.literal('followSchedule'),
  v.literal('goToPoi'),
  v.literal('stayAtPoi'),
  v.literal('talkToPlayer'),
  v.literal('avoidPlayer'),
  v.literal('useObject'),
  v.literal('buyItem'),
  v.literal('sellItem'),
  v.literal('pickUpItem'),
  v.literal('putDownItem'),
  v.literal('activity'),
);

export const agentIntentSource = v.union(
  v.literal('schedule'),
  v.literal('reflection'),
  v.literal('conversation'),
  v.literal('self'),
  v.literal('system'),
);

export const agentIntentTarget = {
  playerId: v.optional(playerId),
  poiId: v.optional(v.string()),
  objectRef: v.optional(v.string()),
  affordanceId: v.optional(v.string()),
  itemId: v.optional(v.string()),
  slotIndex: v.optional(v.number()),
  activityDescription: v.optional(v.string()),
};

export const agentIntent = {
  kind: agentIntentKind,
  description: v.string(),
  rationale: v.string(),
  source: agentIntentSource,
  created: v.number(),
  expiresAt: v.number(),
  priority: v.number(),
  target: v.optional(v.object(agentIntentTarget)),
};

export type AgentIntent = ObjectType<typeof agentIntent>;

export type AgentGoalStatus = {
  hasExplicitIntent: boolean;
  expiredExplicitIntent: boolean;
  scheduleConflict: boolean;
  movementReason: string | null;
};

export function activeExplicitIntent(intent: AgentIntent | undefined, now: number) {
  return intent && intent.expiresAt > now ? intent : null;
}

export function makeFollowScheduleIntent({
  now,
  block,
  activity,
  poiId,
  poiName,
  atScheduledPoi,
}: {
  now: number;
  block: string;
  activity?: string | null;
  poiId?: string | null;
  poiName?: string | null;
  atScheduledPoi?: boolean;
}): AgentIntent {
  const place = poiName ?? poiId;
  const description =
    activity && place
      ? `Follow schedule: ${activity} at ${place}`
      : activity
        ? `Follow schedule: ${activity}`
        : place
          ? `Follow schedule at ${place}`
          : `Follow schedule for ${block}`;
  const target: AgentIntent['target'] = {};
  if (poiId) {
    target.poiId = poiId;
  }
  if (activity) {
    target.activityDescription = activity;
  }
  return {
    kind: 'followSchedule',
    description,
    rationale: atScheduledPoi
      ? `The current schedule block is ${block}, and this character is at the scheduled place.`
      : `The current schedule block is ${block}.`,
    source: 'schedule',
    created: now,
    expiresAt: scheduleBlockEnd(now),
    priority: 0,
    target: Object.keys(target).length > 0 ? target : undefined,
  };
}

export function goalStatusForIntent({
  explicitIntent,
  currentGoal,
  expiredExplicitIntent,
  scheduledPoiId,
  currentPoiId,
  pathfindingDestination,
}: {
  explicitIntent?: AgentIntent | null;
  currentGoal: AgentIntent;
  expiredExplicitIntent?: boolean;
  scheduledPoiId?: string | null;
  currentPoiId?: string | null;
  pathfindingDestination?: { x: number; y: number } | null;
}): AgentGoalStatus {
  const hasExplicitIntent = !!explicitIntent;
  const targetPoiId = explicitIntent?.target?.poiId ?? null;
  const scheduleConflict =
    !!explicitIntent &&
    !!scheduledPoiId &&
    (!!targetPoiId ? targetPoiId !== scheduledPoiId : currentPoiId !== scheduledPoiId);
  return {
    hasExplicitIntent,
    expiredExplicitIntent: !!expiredExplicitIntent,
    scheduleConflict,
    movementReason: pathfindingDestination ? currentGoal.description : null,
  };
}
