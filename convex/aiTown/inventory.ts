import { Infer, v } from 'convex/values';
import { point } from '../util/types';
import { groundItemId, playerId } from './ids';

export const INVENTORY_SLOT_COUNT = 3;
export const STARTING_COINS = 20;
export const GROUND_ITEM_PICKUP_RADIUS = 1.5;

export const inventoryItem = v.object({
  itemId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  emoji: v.optional(v.string()),
  tags: v.array(v.string()),
  sellPrice: v.optional(v.number()),
  sourceObjectRef: v.optional(v.string()),
});
export type InventoryItem = Infer<typeof inventoryItem>;

export const inventorySlot = v.union(inventoryItem, v.null());
export type InventorySlot = InventoryItem | null;

export const groundItem = v.object({
  id: groundItemId,
  item: inventoryItem,
  position: point,
  droppedAt: v.number(),
  droppedBy: v.optional(playerId),
});
export type GroundItem = Infer<typeof groundItem>;

export function normalizeCoins(coins: number | undefined) {
  return Number.isFinite(coins) ? Math.max(0, Math.floor(coins as number)) : STARTING_COINS;
}

export function normalizeInventory(inventory: InventorySlot[] | undefined): InventorySlot[] {
  const slots = Array.isArray(inventory) ? inventory.slice(0, INVENTORY_SLOT_COUNT) : [];
  while (slots.length < INVENTORY_SLOT_COUNT) {
    slots.push(null);
  }
  return slots.map((slot) => (slot ? normalizeItem(slot) : null));
}

export function firstEmptySlot(inventory: InventorySlot[]) {
  return inventory.findIndex((slot) => slot === null);
}

export function normalizeItem(item: InventoryItem): InventoryItem {
  return {
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    emoji: item.emoji,
    tags: item.tags ?? [],
    sellPrice: item.sellPrice,
    sourceObjectRef: item.sourceObjectRef,
  };
}
