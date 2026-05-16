import { ObjectType, v } from 'convex/values';
import { GameId, agentId, parseGameId } from './ids';

export const scheduleBlock = v.union(
  v.literal('morning'),
  v.literal('midday'),
  v.literal('afternoon'),
  v.literal('evening'),
  v.literal('night'),
);
export type ScheduleBlock =
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night';

export const familyMember = v.object({
  kind: v.union(
    v.literal('spouse'),
    v.literal('parent'),
    v.literal('sibling'),
    v.literal('child'),
  ),
  name: v.string(),
});
export type FamilyMember = {
  kind: 'spouse' | 'parent' | 'sibling' | 'child';
  name: string;
};

export const scheduleEntry = v.object({
  block: scheduleBlock,
  activity: v.string(),
  poi: v.string(),
});
export type ScheduleEntry = {
  block: ScheduleBlock;
  activity: string;
  poi: string;
};

export class AgentDescription {
  agentId: GameId<'agents'>;
  identity: string;
  plan: string;
  homeName: string;
  profession: string;
  family: FamilyMember[];
  friends: string[];
  schedule: ScheduleEntry[];

  constructor(serialized: SerializedAgentDescription) {
    const { agentId, identity, plan, homeName, profession, family, friends, schedule } =
      serialized;
    this.agentId = parseGameId('agents', agentId);
    this.identity = identity;
    this.plan = plan;
    this.homeName = homeName ?? '';
    this.profession = profession ?? '';
    this.family = family ?? [];
    this.friends = friends ?? [];
    this.schedule = schedule ?? [];
  }

  serialize(): SerializedAgentDescription {
    const { agentId, identity, plan, homeName, profession, family, friends, schedule } = this;
    return { agentId, identity, plan, homeName, profession, family, friends, schedule };
  }
}

export const serializedAgentDescription = {
  agentId,
  identity: v.string(),
  plan: v.string(),
  homeName: v.optional(v.string()),
  profession: v.optional(v.string()),
  family: v.optional(v.array(familyMember)),
  friends: v.optional(v.array(v.string())),
  schedule: v.optional(v.array(scheduleEntry)),
};
export type SerializedAgentDescription = ObjectType<typeof serializedAgentDescription>;
