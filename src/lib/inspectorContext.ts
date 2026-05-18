import { gameTimeOfDay } from '../../convex/constants';
import { GROUND_ITEM_PICKUP_RADIUS } from '../../convex/aiTown/inventory';
import type { GroundItem, InventorySlot } from '../../convex/aiTown/inventory';
import type { GameId } from '../../convex/aiTown/ids';
import type { Player } from '../../convex/aiTown/player';
import type {
  CommerceObjectContext,
  ObjectAffordance,
  Poi,
  PoiSubObject,
  PortableObjectContext,
} from '../../convex/aiTown/worldMap';
import {
  commerceOptionsForPosition,
  portableObjectsForPosition,
} from '../../convex/aiTown/worldMap';
import type { ServerGame } from '../hooks/serverGame';

export const INSPECTOR_NEARBY_RADIUS = 6;

export type InspectorAffordance = {
  id: string;
  poiId: string;
  poiName: string;
  objectRef: string;
  objectPath: string[];
  objectName: string;
  affordanceId: string;
  affordanceName: string;
  description: string | null;
  emoji: string | null;
  defaultDurationMs: number | null;
};

export type InspectorObjectUser = {
  playerId: GameId<'players'>;
  playerName: string;
  objectRef: string;
  objectName: string;
  affordanceId: string;
  affordanceName: string;
  description: string;
  until: number;
};

export type InspectorContext = {
  self: {
    id: GameId<'players'>;
    name: string;
    kind: 'agent' | 'human' | 'player';
    human: string | null;
    character: string | null;
    description: string | null;
    agentId: GameId<'agents'> | null;
    identity: string | null;
    plan: string | null;
    homeName: string | null;
    profession: string | null;
    family: Array<{ kind: string; name: string }>;
    friends: string[];
  };
  currentTime: number;
  coins: number;
  inventory: InventorySlot[];
  position: {
    x: number;
    y: number;
    facing: { dx: number; dy: number };
    speed: number;
  };
  currentPoi: {
    id: string;
    name: string;
    kind: string;
    description: string;
    bbox: Poi['bbox'];
  } | null;
  schedule: {
    currentBlock: string;
    scheduledActivity: string | null;
    scheduledPoi: { id: string; name: string } | null;
    atScheduledPoi: boolean;
  };
  surroundings: {
    nearbyAffordances: InspectorAffordance[];
    nearbyPlayers: Array<{
      id: GameId<'players'>;
      name: string;
      position: { x: number; y: number };
      distance: number;
      currentPoi: { id: string; name: string } | null;
      conversation: { id: GameId<'conversations'>; status: string } | null;
      activity: string | null;
      objectUse: string | null;
    }>;
    objectUsers: InspectorObjectUser[];
    nearbyGroundItems: GroundItem[];
    portableObjects: PortableObjectContext[];
    commerceOptions: CommerceObjectContext[];
    mapBounds: { width: number; height: number };
  };
  state: {
    activity: Player['activity'] | null;
    objectUse: Player['objectUse'] | null;
    pathfinding: Player['pathfinding'] | null;
    conversation: {
      id: GameId<'conversations'>;
      participants: Array<{
        id: GameId<'players'>;
        name: string;
        status: string;
      }>;
      isTyping: {
        playerId: GameId<'players'>;
        playerName: string;
        since: number;
      } | null;
      lastMessage: {
        author: GameId<'players'>;
        authorName: string;
        timestamp: number;
      } | null;
      numMessages: number;
    } | null;
    agentOperation: {
      name: string;
      operationId: string;
      started: number;
    } | null;
  };
  recentConversationMessages: Array<{
    authorName: string;
    text: string;
    createdAt: number;
  }>;
};

export function currentPoiForPosition(pois: Poi[], position: { x: number; y: number }) {
  return pois.find((poi) => pointInBbox(position, poi.bbox)) ?? null;
}

export function flattenPoiAffordances(poi: Poi): InspectorAffordance[] {
  return collectAffordances(poi, poi.subObjects);
}

export function buildInspectorContext(
  game: ServerGame,
  playerId: GameId<'players'>,
  currentTime: number,
): InspectorContext | null {
  const player = game.world.players.get(playerId);
  if (!player) {
    return null;
  }

  const playerDescription = game.playerDescriptions.get(player.id);
  const agent = [...game.world.agents.values()].find((candidate) => candidate.playerId === player.id);
  const agentDescription = agent ? game.agentDescriptions.get(agent.id) : undefined;
  const currentPoi = currentPoiForPosition(game.worldMap.pois, player.position);
  const currentBlock = gameTimeOfDay(currentTime);
  const scheduled = agentDescription?.schedule.find((entry) => entry.block === currentBlock);
  const scheduledPoi = scheduled
    ? game.worldMap.pois.find((poi) => poi.id === scheduled.poi)
    : undefined;
  const conversation = game.world.playerConversation(player);

  return {
    self: {
      id: player.id,
      name: playerDescription?.name ?? player.id,
      kind: player.human ? 'human' : agent ? 'agent' : 'player',
      human: player.human ?? null,
      character: playerDescription?.character ?? null,
      description: playerDescription?.description ?? null,
      agentId: agent?.id ?? null,
      identity: agentDescription?.identity ?? null,
      plan: agentDescription?.plan ?? null,
      homeName: agentDescription?.homeName ?? null,
      profession: agentDescription?.profession ?? null,
      family: agentDescription?.family ?? [],
      friends: agentDescription?.friends ?? [],
    },
    currentTime,
    coins: player.coins,
    inventory: player.inventory,
    position: {
      x: player.position.x,
      y: player.position.y,
      facing: player.facing,
      speed: player.speed,
    },
    currentPoi: currentPoi
      ? {
          id: currentPoi.id,
          name: currentPoi.name,
          kind: currentPoi.kind,
          description: currentPoi.description,
          bbox: currentPoi.bbox,
        }
      : null,
    schedule: {
      currentBlock,
      scheduledActivity: scheduled?.activity ?? null,
      scheduledPoi: scheduled
        ? {
            id: scheduled.poi,
            name: scheduledPoi?.name ?? scheduled.poi,
          }
        : null,
      atScheduledPoi: !!scheduledPoi && currentPoi?.id === scheduledPoi.id,
    },
    surroundings: {
      nearbyAffordances: currentPoi ? flattenPoiAffordances(currentPoi) : [],
      nearbyPlayers: nearbyPlayers(game, player, currentPoi, currentTime),
      objectUsers: objectUsers(game, player, currentPoi, currentTime),
      nearbyGroundItems: nearbyGroundItems(game, player),
      portableObjects: portableObjectsForPosition(
        game.worldMap.pois,
        game.world.takenPoiItemRefs,
        player.position,
      ),
      commerceOptions: commerceOptionsForPosition(game.worldMap.pois, player.position),
      mapBounds: { width: game.worldMap.width, height: game.worldMap.height },
    },
    state: {
      activity: isActive(player.activity, currentTime) ? player.activity! : null,
      objectUse: isActive(player.objectUse, currentTime) ? player.objectUse! : null,
      pathfinding: player.pathfinding ?? null,
      conversation: conversation
        ? {
            id: conversation.id,
            participants: [...conversation.participants.values()].map((member) => ({
              id: member.playerId,
              name: game.playerDescriptions.get(member.playerId)?.name ?? member.playerId,
              status: member.status.kind,
            })),
            isTyping: conversation.isTyping
              ? {
                  playerId: conversation.isTyping.playerId,
                  playerName:
                    game.playerDescriptions.get(conversation.isTyping.playerId)?.name ??
                    conversation.isTyping.playerId,
                  since: conversation.isTyping.since,
                }
              : null,
            lastMessage: conversation.lastMessage
              ? {
                  author: conversation.lastMessage.author,
                  authorName:
                    game.playerDescriptions.get(conversation.lastMessage.author)?.name ??
                    conversation.lastMessage.author,
                  timestamp: conversation.lastMessage.timestamp,
                }
              : null,
            numMessages: conversation.numMessages,
          }
        : null,
      agentOperation: agent?.inProgressOperation ?? null,
    },
    recentConversationMessages: [],
  };
}

function collectAffordances(
  poi: Poi,
  objects: PoiSubObject[] | undefined,
  path: string[] = [],
): InspectorAffordance[] {
  const result: InspectorAffordance[] = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = [poi.id, ...objectPath].join('/');
    for (const affordance of object.affordances ?? []) {
      result.push(affordanceContext(poi, object, objectRef, objectPath, affordance));
    }
    result.push(...collectAffordances(poi, object.subObjects, objectPath));
  }
  return result;
}

function affordanceContext(
  poi: Poi,
  object: PoiSubObject,
  objectRef: string,
  objectPath: string[],
  affordance: ObjectAffordance,
): InspectorAffordance {
  return {
    id: `${objectRef}#${affordance.id}`,
    poiId: poi.id,
    poiName: poi.name,
    objectRef,
    objectPath,
    objectName: object.name,
    affordanceId: affordance.id,
    affordanceName: affordance.name,
    description: affordance.description ?? null,
    emoji: affordance.emoji ?? null,
    defaultDurationMs: affordance.defaultDurationMs ?? null,
  };
}

function nearbyPlayers(
  game: ServerGame,
  player: Player,
  currentPoi: Poi | null,
  currentTime: number,
) {
  return [...game.world.players.values()]
    .filter((candidate) => candidate.id !== player.id)
    .map((candidate) => {
      const candidatePoi = currentPoiForPosition(game.worldMap.pois, candidate.position);
      return {
        player: candidate,
        candidatePoi,
        distance: pointDistance(player.position, candidate.position),
      };
    })
    .filter(({ candidatePoi, distance }) => {
      return (
        distance <= INSPECTOR_NEARBY_RADIUS || (!!currentPoi && candidatePoi?.id === currentPoi.id)
      );
    })
    .map(({ player: candidate, candidatePoi, distance }) => {
      const conversation = game.world.playerConversation(candidate);
      const member = conversation?.participants.get(candidate.id);
      const activeActivity = isActive(candidate.activity, currentTime) ? candidate.activity : null;
      const activeObjectUse = isActive(candidate.objectUse, currentTime) ? candidate.objectUse : null;
      return {
        id: candidate.id,
        name: game.playerDescriptions.get(candidate.id)?.name ?? candidate.id,
        position: { x: candidate.position.x, y: candidate.position.y },
        distance,
        currentPoi: candidatePoi ? { id: candidatePoi.id, name: candidatePoi.name } : null,
        conversation:
          conversation && member ? { id: conversation.id, status: member.status.kind } : null,
        activity: activeActivity?.description ?? null,
        objectUse: activeObjectUse?.description ?? null,
      };
    });
}

function objectUsers(
  game: ServerGame,
  player: Player,
  currentPoi: Poi | null,
  currentTime: number,
): InspectorObjectUser[] {
  return [...game.world.players.values()]
    .filter((candidate) => isActive(candidate.objectUse, currentTime))
    .map((candidate) => ({
      player: candidate,
      candidatePoi: currentPoiForPosition(game.worldMap.pois, candidate.position),
      distance: pointDistance(player.position, candidate.position),
      objectUse: candidate.objectUse!,
    }))
    .filter(({ candidatePoi, distance }) => {
      return (
        distance <= INSPECTOR_NEARBY_RADIUS || (!!currentPoi && candidatePoi?.id === currentPoi.id)
      );
    })
    .map(({ player: candidate, objectUse }) => ({
      playerId: candidate.id,
      playerName: game.playerDescriptions.get(candidate.id)?.name ?? candidate.id,
      objectRef: objectUse.objectRef,
      objectName: objectUse.objectName,
      affordanceId: objectUse.affordanceId,
      affordanceName: objectUse.affordanceName,
      description: objectUse.description,
      until: objectUse.until,
    }));
}

function nearbyGroundItems(game: ServerGame, player: Player): GroundItem[] {
  return [...game.world.groundItems.values()].filter(
    (item) => pointDistance(player.position, item.position) <= GROUND_ITEM_PICKUP_RADIUS,
  );
}

function isActive<T extends { until: number }>(item: T | undefined, currentTime: number): item is T {
  return !!item && item.until > currentTime;
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInBbox(position: { x: number; y: number }, bbox: Poi['bbox']) {
  return (
    position.x >= bbox.x &&
    position.y >= bbox.y &&
    position.x < bbox.x + bbox.w &&
    position.y < bbox.y + bbox.h
  );
}
