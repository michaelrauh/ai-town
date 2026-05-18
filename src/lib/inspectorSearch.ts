import type { GameId } from '../../convex/aiTown/ids';
import type { PoiSubObject } from '../../convex/aiTown/worldMap';
import type { ServerGame } from '../hooks/serverGame';
import type { InspectorContext } from './inspectorContext';

export type InspectorTab = 'characters' | 'perception' | 'memories' | 'world' | 'raw';

export type InspectorMemory = {
  id: string;
  description: string;
  importance: number;
  type: string;
  data: unknown;
  createdAt: number;
  lastAccess: number;
};

export type InspectorMemoryGroups = {
  players: Array<{
    playerId: string;
    name: string | null;
    memories: InspectorMemory[];
  }>;
};

export type InspectorConversationMessageGroups = {
  conversations: Array<{
    conversationId: string;
    messages: Array<{
      id: string;
      createdAt: number;
      author: string;
      authorName: string;
      text: string;
    }>;
  }>;
};

export type InspectorSearchRecord = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  targetTab: InspectorTab;
  playerId?: GameId<'players'>;
  haystack: string;
};

export type InspectorSearchResult = Omit<InspectorSearchRecord, 'haystack'>;

export function buildInspectorSearchRecords({
  game,
  contexts,
  memories,
  conversationMessages,
}: {
  game: ServerGame;
  contexts: InspectorContext[];
  memories?: InspectorMemoryGroups;
  conversationMessages?: InspectorConversationMessageGroups;
}): InspectorSearchRecord[] {
  const records: InspectorSearchRecord[] = [];
  for (const context of contexts) {
    const name = context.self.name;
    records.push(
      record({
        id: `character:${context.self.id}`,
        category: 'Characters',
        title: name,
        excerpt: compact([
          context.self.description,
          context.self.identity,
          context.self.profession,
          context.self.homeName,
        ]),
        targetTab: 'characters',
        playerId: context.self.id,
        values: [context],
      }),
    );
    records.push(
      record({
        id: `schedule:${context.self.id}`,
        category: 'Schedules',
        title: `${name} schedule`,
        excerpt: compact([
          context.schedule.currentBlock,
          context.schedule.scheduledActivity,
          context.schedule.scheduledPoi?.name,
        ]),
        targetTab: 'characters',
        playerId: context.self.id,
        values: [context.schedule, context.self.plan],
      }),
    );
    records.push(
      record({
        id: `state:${context.self.id}`,
        category: 'State',
        title: `${name} current state`,
        excerpt: compact([
          context.currentPoi?.name,
          `${context.coins} coins`,
          context.state.activity?.description,
          context.state.objectUse?.description,
          context.state.conversation?.id,
          context.state.agentOperation?.name,
        ]),
        targetTab: 'characters',
        playerId: context.self.id,
        values: [context.state, context.position, context.inventory, context.coins],
      }),
    );
    for (const [slotIndex, item] of context.inventory.entries()) {
      if (!item) {
        continue;
      }
      records.push(
        record({
          id: `inventory:${context.self.id}:${slotIndex}`,
          category: 'Inventory',
          title: `${name} slot ${slotIndex + 1}: ${item.name}`,
          excerpt: compact([item.description, item.tags.join(', '), item.sellPrice]),
          targetTab: 'characters',
          playerId: context.self.id,
          values: [item],
        }),
      );
    }
    for (const affordance of context.surroundings.nearbyAffordances) {
      records.push(
        record({
          id: `affordance:${context.self.id}:${affordance.id}`,
          category: 'Objects',
          title: `${affordance.objectName}: ${affordance.affordanceName}`,
          excerpt: compact([affordance.poiName, affordance.objectPath.join(' / '), affordance.description]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [affordance],
        }),
      );
    }
    for (const nearby of context.surroundings.nearbyPlayers) {
      records.push(
        record({
          id: `nearby:${context.self.id}:${nearby.id}`,
          category: 'Nearby Characters',
          title: `${nearby.name} near ${name}`,
          excerpt: compact([
            nearby.currentPoi?.name,
            nearby.conversation?.status,
            nearby.activity,
            nearby.objectUse,
          ]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [nearby],
        }),
      );
    }
    for (const user of context.surroundings.objectUsers) {
      records.push(
        record({
          id: `object-use:${context.self.id}:${user.playerId}:${user.objectRef}:${user.affordanceId}`,
          category: 'Object Use',
          title: `${user.playerName}: ${user.affordanceName}`,
          excerpt: compact([user.objectName, user.objectRef, user.description]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [user],
        }),
      );
    }
    for (const item of context.surroundings.nearbyGroundItems) {
      records.push(
        record({
          id: `ground-item:${context.self.id}:${item.id}`,
          category: 'Ground Items',
          title: `${item.item.name} nearby`,
          excerpt: compact([item.item.description, item.item.tags.join(', '), item.item.sellPrice]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [item],
        }),
      );
    }
    for (const portable of context.surroundings.portableObjects) {
      records.push(
        record({
          id: `portable:${context.self.id}:${portable.objectRef}`,
          category: 'Portable Objects',
          title: `${portable.item.name} at ${portable.objectName}`,
          excerpt: compact([
            portable.poiName,
            portable.item.description,
            portable.item.tags.join(', '),
            portable.item.sellPrice,
          ]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [portable],
        }),
      );
    }
    for (const commerce of context.surroundings.commerceOptions) {
      records.push(
        record({
          id: `commerce:${context.self.id}:${commerce.objectRef}`,
          category: 'Commerce',
          title: `${commerce.objectName} commerce`,
          excerpt: compact([
            commerce.poiName,
            commerce.buy.map((item) => `${item.name} ${item.price} coins`).join(', '),
            commerce.sellTags.join(', '),
          ]),
          targetTab: 'perception',
          playerId: context.self.id,
          values: [commerce],
        }),
      );
    }
    records.push(
      record({
        id: `raw:${context.self.id}`,
        category: 'Raw',
        title: `${name} raw context`,
        excerpt: context.self.id,
        targetTab: 'raw',
        playerId: context.self.id,
        values: [context],
      }),
    );
  }

  for (const poi of game.worldMap.pois) {
    records.push(
      record({
        id: `poi:${poi.id}`,
        category: 'Places',
        title: poi.name,
        excerpt: compact([poi.kind, poi.description]),
        targetTab: 'world',
        values: [poi, collectObjectText(poi.subObjects ?? [])],
      }),
    );
  }

  for (const conversation of game.world.conversations.values()) {
    const participants = [...conversation.participants.values()].map((member) => {
      const name = game.playerDescriptions.get(member.playerId)?.name ?? member.playerId;
      return `${name}: ${member.status.kind}`;
    });
    records.push(
      record({
        id: `conversation:${conversation.id}`,
        category: 'Conversations',
        title: conversation.id,
        excerpt: participants.join(' / '),
        targetTab: 'world',
        values: [conversation, participants],
      }),
    );
  }

  for (const group of memories?.players ?? []) {
    for (const memory of group.memories) {
      records.push(
        record({
          id: `memory:${group.playerId}:${memory.id}`,
          category: 'Memories',
          title: `${group.name ?? group.playerId}: ${memory.type}`,
          excerpt: memory.description,
          targetTab: 'memories',
          playerId: group.playerId as GameId<'players'>,
          values: [memory],
        }),
      );
    }
  }

  for (const group of conversationMessages?.conversations ?? []) {
    const conversation = game.world.conversations.get(group.conversationId as GameId<'conversations'>);
    const fallbackPlayerId = conversation ? [...conversation.participants.keys()][0] : undefined;
    for (const message of group.messages) {
      records.push(
        record({
          id: `message:${group.conversationId}:${message.id}`,
          category: 'Messages',
          title: `${message.authorName} in ${group.conversationId}`,
          excerpt: message.text,
          targetTab: 'perception',
          playerId: (message.author as GameId<'players'>) ?? fallbackPlayerId,
          values: [message, group.conversationId],
        }),
      );
    }
  }

  return records;
}

export function searchInspectorRecords(records: InspectorSearchRecord[], query: string) {
  const normalized = normalize(query);
  if (!normalized) {
    return [];
  }
  return records
    .filter((item) => item.haystack.includes(normalized))
    .map(({ haystack: _, ...result }) => result);
}

function record({
  id,
  category,
  title,
  excerpt,
  targetTab,
  playerId,
  values,
}: {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  targetTab: InspectorTab;
  playerId?: GameId<'players'>;
  values: unknown[];
}): InspectorSearchRecord {
  return {
    id,
    category,
    title,
    excerpt,
    targetTab,
    playerId,
    haystack: normalize([title, excerpt, ...values.map(stringifySearchValue)].join('\n')),
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function compact(values: Array<string | number | null | undefined>) {
  return values
    .filter((value): value is string | number => value !== null && value !== undefined && value !== '')
    .map(String)
    .join(' / ');
}

function stringifySearchValue(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectObjectText(objects: PoiSubObject[]): string {
  return objects
    .map((object) =>
      compact([
        object.id,
        object.name,
        object.description,
        object.affordances.map((affordance) => compact([
          affordance.id,
          affordance.name,
          affordance.description,
        ])).join(' '),
        collectObjectText(object.subObjects ?? []),
      ]),
    )
    .join(' ');
}
