import { Infer, ObjectType, v } from 'convex/values';
import { Point, Vector, path, point, vector } from '../util/types';
import { GameId, parseGameId } from './ids';
import { playerId } from './ids';
import {
  PATHFINDING_TIMEOUT,
  PATHFINDING_BACKOFF,
  HUMAN_IDLE_TOO_LONG,
  MAX_HUMAN_PLAYERS,
  MAX_PATHFINDS_PER_STEP,
} from '../constants';
import { distance, inBbox, pointsEqual, pathPosition } from '../util/geometry';
import { Game } from './game';
import { stopPlayer, findRoute, blocked, movePlayer } from './movement';
import { inputHandler } from './inputHandler';
import { characters } from '../../data/characters';
import { PlayerDescription } from './playerDescription';
import {
  commerceItemToInventoryItem,
  findAffordanceByRef,
  findCommerceByRef,
  findPortableByRef,
  poiCenter,
} from './worldMap';
import {
  GROUND_ITEM_PICKUP_RADIUS,
  InventoryItem,
  InventorySlot,
  firstEmptySlot,
  inventorySlot,
  normalizeCoins,
  normalizeInventory,
} from './inventory';
import { groundItemId } from './ids';

export const stepDirection = v.union(
  v.literal('north'),
  v.literal('south'),
  v.literal('east'),
  v.literal('west'),
);
export type StepDirection = Infer<typeof stepDirection>;

const pathfinding = v.object({
  destination: point,
  started: v.number(),
  state: v.union(
    v.object({
      kind: v.literal('needsPath'),
    }),
    v.object({
      kind: v.literal('waiting'),
      until: v.number(),
    }),
    v.object({
      kind: v.literal('moving'),
      path,
    }),
  ),
});
export type Pathfinding = Infer<typeof pathfinding>;

export const activity = v.object({
  description: v.string(),
  emoji: v.optional(v.string()),
  until: v.number(),
});
export type Activity = Infer<typeof activity>;

export const objectUse = v.object({
  objectRef: v.string(),
  objectName: v.string(),
  affordanceId: v.string(),
  affordanceName: v.string(),
  description: v.string(),
  emoji: v.optional(v.string()),
  until: v.number(),
});
export type ObjectUse = Infer<typeof objectUse>;

const useObjectRequestFields = {
  objectRef: v.string(),
  affordanceId: v.string(),
  durationMs: v.optional(v.number()),
};
export const useObjectRequest = v.object(useObjectRequestFields);
export type UseObjectRequest = Infer<typeof useObjectRequest>;

const itemSource = v.union(
  v.object({ kind: v.literal('poiObject'), objectRef: v.string() }),
  v.object({ kind: v.literal('groundItem'), groundItemId }),
);
const pickUpItemRequestFields = {
  source: itemSource,
};
export const pickUpItemRequest = v.object(pickUpItemRequestFields);
export type PickUpItemRequest = Infer<typeof pickUpItemRequest>;

const putDownItemRequestFields = {
  slotIndex: v.number(),
};
export const putDownItemRequest = v.object(putDownItemRequestFields);
export type PutDownItemRequest = Infer<typeof putDownItemRequest>;

const buyItemRequestFields = {
  objectRef: v.string(),
  itemId: v.string(),
};
export const buyItemRequest = v.object(buyItemRequestFields);
export type BuyItemRequest = Infer<typeof buyItemRequest>;

const sellItemRequestFields = {
  objectRef: v.string(),
  slotIndex: v.number(),
};
export const sellItemRequest = v.object(sellItemRequestFields);
export type SellItemRequest = Infer<typeof sellItemRequest>;

export const serializedPlayer = {
  id: playerId,
  human: v.optional(v.string()),
  pathfinding: v.optional(pathfinding),
  activity: v.optional(activity),
  objectUse: v.optional(objectUse),
  coins: v.optional(v.number()),
  inventory: v.optional(v.array(inventorySlot)),

  // The last time they did something.
  lastInput: v.number(),

  position: point,
  facing: vector,
  speed: v.number(),
};
export type SerializedPlayer = ObjectType<typeof serializedPlayer>;

export class Player {
  id: GameId<'players'>;
  human?: string;
  pathfinding?: Pathfinding;
  activity?: Activity;
  objectUse?: ObjectUse;
  coins: number;
  inventory: InventorySlot[];

  lastInput: number;

  position: Point;
  facing: Vector;
  speed: number;

  constructor(serialized: SerializedPlayer) {
    const {
      id,
      human,
      pathfinding,
      activity,
      objectUse,
      coins,
      inventory,
      lastInput,
      position,
      facing,
      speed,
    } = serialized;
    this.id = parseGameId('players', id);
    this.human = human;
    this.pathfinding = pathfinding;
    this.activity = activity;
    this.objectUse = objectUse;
    this.coins = normalizeCoins(coins);
    this.inventory = normalizeInventory(inventory);
    this.lastInput = lastInput;
    this.position = position;
    this.facing = facing;
    this.speed = speed;
  }

  tick(game: Game, now: number) {
    if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) {
      this.leave(game, now);
    }
  }

  tickPathfinding(game: Game, now: number) {
    // There's nothing to do if we're not moving.
    const { pathfinding, position } = this;
    if (!pathfinding) {
      return;
    }

    // Stop pathfinding if we've reached our destination.
    if (pathfinding.state.kind === 'moving' && pointsEqual(pathfinding.destination, position)) {
      stopPlayer(this);
    }

    // Stop pathfinding if we've timed out.
    if (pathfinding.started + PATHFINDING_TIMEOUT < now) {
      console.warn(`Timing out pathfinding for ${this.id}`);
      stopPlayer(this);
    }

    // Transition from "waiting" to "needsPath" if we're past the deadline.
    if (pathfinding.state.kind === 'waiting' && pathfinding.state.until < now) {
      pathfinding.state = { kind: 'needsPath' };
    }

    // Perform pathfinding if needed.
    if (pathfinding.state.kind === 'needsPath' && game.numPathfinds < MAX_PATHFINDS_PER_STEP) {
      game.numPathfinds++;
      if (game.numPathfinds === MAX_PATHFINDS_PER_STEP) {
        console.warn(`Reached max pathfinds for this step`);
      }
      const route = findRoute(game, now, this, pathfinding.destination);
      if (route === null) {
        console.log(`Failed to route to ${JSON.stringify(pathfinding.destination)}`);
        stopPlayer(this);
      } else {
        if (route.newDestination) {
          console.warn(
            `Updating destination from ${JSON.stringify(
              pathfinding.destination,
            )} to ${JSON.stringify(route.newDestination)}`,
          );
          pathfinding.destination = route.newDestination;
        }
        pathfinding.state = { kind: 'moving', path: route.path };
      }
    }
  }

  tickPosition(game: Game, now: number) {
    // There's nothing to do if we're not moving.
    if (!this.pathfinding || this.pathfinding.state.kind !== 'moving') {
      this.speed = 0;
      return;
    }

    // Compute a candidate new position and check if it collides
    // with anything.
    const candidate = pathPosition(this.pathfinding.state.path as any, now);
    if (!candidate) {
      console.warn(`Path out of range of ${now} for ${this.id}`);
      return;
    }
    const { position, facing, velocity } = candidate;
    const collisionReason = blocked(game, now, position, this.id);
    if (collisionReason !== null) {
      const backoff = Math.random() * PATHFINDING_BACKOFF;
      console.warn(`Stopping path for ${this.id}, waiting for ${backoff}ms: ${collisionReason}`);
      this.pathfinding.state = {
        kind: 'waiting',
        until: now + backoff,
      };
      return;
    }
    // Update the player's location.
    this.position = position;
    this.facing = facing;
    this.speed = velocity;
  }

  static join(
    game: Game,
    now: number,
    name: string,
    character: string,
    description: string,
    tokenIdentifier?: string,
    homeName?: string,
  ) {
    if (tokenIdentifier) {
      let numHumans = 0;
      for (const player of game.world.players.values()) {
        if (player.human) {
          numHumans++;
        }
        if (player.human === tokenIdentifier) {
          throw new Error(`You are already in this game!`);
        }
      }
      if (numHumans >= MAX_HUMAN_PLAYERS) {
        throw new Error(`Only ${MAX_HUMAN_PLAYERS} human players allowed at once.`);
      }
    }
    let position;
    const home = homeName ? game.worldMap.pois.find((p) => p.id === homeName) : undefined;
    if (home) {
      const candidate = poiCenter(home);
      if (blocked(game, now, candidate) === null) {
        position = candidate;
      }
    }
    if (!position) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = {
          x: Math.floor(Math.random() * game.worldMap.width),
          y: Math.floor(Math.random() * game.worldMap.height),
        };
        if (blocked(game, now, candidate)) {
          continue;
        }
        position = candidate;
        break;
      }
    }
    if (!position) {
      throw new Error(`Failed to find a free position!`);
    }
    const facingOptions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const facing = facingOptions[Math.floor(Math.random() * facingOptions.length)];
    if (!characters.find((c) => c.name === character)) {
      throw new Error(`Invalid character: ${character}`);
    }
    const playerId = game.allocId('players');
    game.world.players.set(
      playerId,
      new Player({
        id: playerId,
        human: tokenIdentifier,
        lastInput: now,
        position,
        facing,
        speed: 0,
      }),
    );
    game.playerDescriptions.set(
      playerId,
      new PlayerDescription({
        playerId,
        character,
        description,
        name,
      }),
    );
    game.descriptionsModified = true;
    return playerId;
  }

  leave(game: Game, now: number) {
    // Stop our conversation if we're leaving the game.
    const conversation = [...game.world.conversations.values()].find((c) =>
      c.participants.has(this.id),
    );
    if (conversation) {
      conversation.stop(game, now);
    }
    game.world.players.delete(this.id);
  }

  serialize(): SerializedPlayer {
    const {
      id,
      human,
      pathfinding,
      activity,
      objectUse,
      coins,
      inventory,
      lastInput,
      position,
      facing,
      speed,
    } = this;
    return {
      id,
      human,
      pathfinding,
      activity,
      objectUse,
      coins,
      inventory,
      lastInput,
      position,
      facing,
      speed,
    };
  }
}

function stepDestinationFrom(position: Point, direction: StepDirection): Point {
  const origin = {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
  };
  switch (direction) {
    case 'north':
      return { x: origin.x, y: origin.y - 1 };
    case 'south':
      return { x: origin.x, y: origin.y + 1 };
    case 'east':
      return { x: origin.x + 1, y: origin.y };
    case 'west':
      return { x: origin.x - 1, y: origin.y };
    default: {
      const exhaustive: never = direction;
      throw new Error(`Invalid step direction: ${exhaustive}`);
    }
  }
}

export function stepDestination(player: Player, direction: StepDirection): Point {
  return stepDestinationFrom(player.position, direction);
}

export function stepPlayer(game: Game, now: number, player: Player, direction: StepDirection) {
  const conversation = game.world.playerConversation(player);
  if (conversation?.participants.get(player.id)?.status.kind === 'participating') {
    throw new Error(`Can't move when in a conversation. Leave the conversation first!`);
  }
  const destination = stepDestinationFrom(
    player.pathfinding?.destination ?? player.position,
    direction,
  );
  const blockedReason = blocked(game, now, destination, player.id);
  if (blockedReason !== null) {
    throw new Error(`Can't step ${direction}: ${blockedReason}`);
  }
  movePlayer(game, now, player, destination);
  return destination;
}

const DEFAULT_OBJECT_USE_DURATION_MS = 60_000;
const MIN_OBJECT_USE_DURATION_MS = 5_000;
const MAX_OBJECT_USE_DURATION_MS = 600_000;

function objectUseDurationMs(requested?: number, fallback?: number) {
  const duration = requested ?? fallback ?? DEFAULT_OBJECT_USE_DURATION_MS;
  return Math.max(MIN_OBJECT_USE_DURATION_MS, Math.min(MAX_OBJECT_USE_DURATION_MS, duration));
}

export function startObjectUse(game: Game, now: number, player: Player, request: UseObjectRequest) {
  const conversation = game.world.playerConversation(player);
  if (conversation?.participants.get(player.id)?.status.kind === 'participating') {
    throw new Error(`Can't use an object when in a conversation. Leave the conversation first!`);
  }
  const match = findAffordanceByRef(game.worldMap.pois, request.objectRef, request.affordanceId);
  if (!match) {
    throw new Error(`Invalid object affordance ${request.objectRef}#${request.affordanceId}`);
  }
  if (!inBbox(player.position, match.poi.bbox)) {
    throw new Error(`Player ${player.id} is not near ${match.poi.name}`);
  }
  stopPlayer(player);
  const nextUse: ObjectUse = {
    objectRef: request.objectRef,
    objectName: match.object.name,
    affordanceId: request.affordanceId,
    affordanceName: match.affordance.name,
    description: match.affordance.description ?? match.affordance.name,
    until: now + objectUseDurationMs(request.durationMs, match.affordance.defaultDurationMs),
  };
  if (match.affordance.emoji) {
    nextUse.emoji = match.affordance.emoji;
  }
  delete player.activity;
  player.objectUse = nextUse;
  return nextUse;
}

function assertCanInventoryAction(game: Game, player: Player, action: string) {
  const conversation = game.world.playerConversation(player);
  if (conversation?.participants.get(player.id)?.status.kind === 'participating') {
    throw new Error(`Can't ${action} when in a conversation. Leave the conversation first!`);
  }
}

function stopTransientPlayerState(player: Player) {
  stopPlayer(player);
  delete player.activity;
  delete player.objectUse;
}

function addToFirstEmptySlot(player: Player, item: InventoryItem) {
  const slotIndex = firstEmptySlot(player.inventory);
  if (slotIndex < 0) {
    throw new Error(`Inventory is full.`);
  }
  player.inventory[slotIndex] = item;
  return slotIndex;
}

function itemAtSlot(player: Player, slotIndex: number) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= player.inventory.length) {
    throw new Error(`Invalid inventory slot ${slotIndex}.`);
  }
  const item = player.inventory[slotIndex];
  if (!item) {
    throw new Error(`Inventory slot ${slotIndex} is empty.`);
  }
  return item;
}

export function pickUpItem(
  game: Game,
  now: number,
  player: Player,
  request: PickUpItemRequest,
) {
  assertCanInventoryAction(game, player, 'pick up items');
  let item: InventoryItem;
  if (request.source.kind === 'poiObject') {
    const { objectRef } = request.source;
    if (game.world.takenPoiItemRefs.has(objectRef)) {
      throw new Error(`${objectRef} has already been picked up.`);
    }
    const match = findPortableByRef(game.worldMap.pois, objectRef);
    if (!match) {
      throw new Error(`${objectRef} is not a portable object.`);
    }
    if (!inBbox(player.position, match.poi.bbox)) {
      throw new Error(`Player ${player.id} is not near ${match.poi.name}`);
    }
    item = match.item;
    stopTransientPlayerState(player);
    const slotIndex = addToFirstEmptySlot(player, item);
    game.world.takenPoiItemRefs.add(objectRef);
    return { slotIndex, item };
  }

  const groundId = parseGameId('groundItems', request.source.groundItemId);
  const groundItem = game.world.groundItems.get(groundId);
  if (!groundItem) {
    throw new Error(`Invalid ground item ${groundId}.`);
  }
  if (distance(player.position, groundItem.position) > GROUND_ITEM_PICKUP_RADIUS) {
    throw new Error(`Player ${player.id} is not near ${groundItem.item.name}.`);
  }
  item = groundItem.item;
  stopTransientPlayerState(player);
  const slotIndex = addToFirstEmptySlot(player, item);
  game.world.groundItems.delete(groundId);
  return { slotIndex, item };
}

export function putDownItem(
  game: Game,
  now: number,
  player: Player,
  request: PutDownItemRequest,
) {
  assertCanInventoryAction(game, player, 'put down items');
  const item = itemAtSlot(player, request.slotIndex);
  const groundId = game.allocId('groundItems');
  const groundItem = {
    id: groundId,
    item,
    position: {
      x: Math.floor(player.position.x),
      y: Math.floor(player.position.y),
    },
    droppedAt: now,
    droppedBy: player.id,
  };
  stopTransientPlayerState(player);
  player.inventory[request.slotIndex] = null;
  game.world.groundItems.set(groundId, groundItem);
  return groundItem;
}

export function buyItem(game: Game, now: number, player: Player, request: BuyItemRequest) {
  assertCanInventoryAction(game, player, 'buy items');
  const match = findCommerceByRef(game.worldMap.pois, request.objectRef);
  if (!match) {
    throw new Error(`${request.objectRef} is not a shop counter.`);
  }
  if (!inBbox(player.position, match.poi.bbox)) {
    throw new Error(`Player ${player.id} is not in ${match.poi.name}.`);
  }
  const itemForSale = match.commerce.buy.find((item) => item.itemId === request.itemId);
  if (!itemForSale) {
    throw new Error(`${request.itemId} is not for sale at ${match.object.name}.`);
  }
  if (player.coins < itemForSale.price) {
    throw new Error(`Not enough coins to buy ${itemForSale.name}.`);
  }
  const item = commerceItemToInventoryItem(itemForSale);
  stopTransientPlayerState(player);
  const slotIndex = addToFirstEmptySlot(player, item);
  player.coins -= itemForSale.price;
  return { slotIndex, item, coins: player.coins };
}

export function sellItem(game: Game, now: number, player: Player, request: SellItemRequest) {
  assertCanInventoryAction(game, player, 'sell items');
  const match = findCommerceByRef(game.worldMap.pois, request.objectRef);
  if (!match) {
    throw new Error(`${request.objectRef} is not a shop counter.`);
  }
  if (!inBbox(player.position, match.poi.bbox)) {
    throw new Error(`Player ${player.id} is not in ${match.poi.name}.`);
  }
  const item = itemAtSlot(player, request.slotIndex);
  const accepted = item.tags.some((tag) => match.commerce.sellTags.includes(tag));
  if (!accepted) {
    throw new Error(`${item.name} cannot be sold at ${match.object.name}.`);
  }
  const sellPrice = item.sellPrice ?? 0;
  if (sellPrice <= 0) {
    throw new Error(`${item.name} has no sell price.`);
  }
  stopTransientPlayerState(player);
  player.inventory[request.slotIndex] = null;
  player.coins += sellPrice;
  return { item, coins: player.coins };
}

export const playerInputs = {
  join: inputHandler({
    args: {
      name: v.string(),
      character: v.string(),
      description: v.string(),
      tokenIdentifier: v.optional(v.string()),
    },
    handler: (game, now, args) => {
      Player.join(game, now, args.name, args.character, args.description, args.tokenIdentifier);
      return null;
    },
  }),
  leave: inputHandler({
    args: { playerId },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      player.leave(game, now);
      return null;
    },
  }),
  moveTo: inputHandler({
    args: {
      playerId,
      destination: v.union(point, v.null()),
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      if (args.destination) {
        movePlayer(game, now, player, args.destination);
      } else {
        stopPlayer(player);
      }
      return null;
    },
  }),
  useObject: inputHandler({
    args: {
      playerId,
      ...useObjectRequestFields,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return startObjectUse(game, now, player, args);
    },
  }),
  pickUpItem: inputHandler({
    args: {
      playerId,
      ...pickUpItemRequestFields,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return pickUpItem(game, now, player, args);
    },
  }),
  putDownItem: inputHandler({
    args: {
      playerId,
      ...putDownItemRequestFields,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return putDownItem(game, now, player, args);
    },
  }),
  buyItem: inputHandler({
    args: {
      playerId,
      ...buyItemRequestFields,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return buyItem(game, now, player, args);
    },
  }),
  sellItem: inputHandler({
    args: {
      playerId,
      ...sellItemRequestFields,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return sellItem(game, now, player, args);
    },
  }),
  stepPlayer: inputHandler({
    args: {
      playerId,
      direction: stepDirection,
    },
    handler: (game, now, args) => {
      const playerId = parseGameId('players', args.playerId);
      const player = game.world.players.get(playerId);
      if (!player) {
        throw new Error(`Invalid player ID ${playerId}`);
      }
      return stepPlayer(game, now, player, args.direction);
    },
  }),
};
