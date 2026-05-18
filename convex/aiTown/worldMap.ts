import { Infer, ObjectType, v } from 'convex/values';
import type { InventoryItem } from './inventory';

// `layer[position.x][position.y]` is the tileIndex or -1 if empty.
const tileLayer = v.array(v.array(v.number()));
export type TileLayer = Infer<typeof tileLayer>;

const animatedSprite = {
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
  layer: v.number(),
  sheet: v.string(),
  animation: v.string(),
};
export type AnimatedSprite = ObjectType<typeof animatedSprite>;

const affordance = {
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  emoji: v.optional(v.string()),
  defaultDurationMs: v.optional(v.number()),
};
export const objectAffordance = v.object(affordance);

export const poi = v.object({
  id: v.string(),
  name: v.string(),
  kind: v.union(v.literal('home'), v.literal('shop'), v.literal('park'), v.literal('workplace')),
  bbox: v.object({ x: v.number(), y: v.number(), w: v.number(), h: v.number() }),
  description: v.string(),
  // Convex validators do not support recursive object definitions in this version.
  // Keep the storage validator permissive and validate the recursive shape at load time.
  subObjects: v.optional(v.array(v.any())),
});

export type ObjectAffordance = {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  defaultDurationMs?: number;
};

export type PortableObjectMetadata = {
  itemId: string;
  name?: string;
  description?: string;
  emoji?: string;
  tags?: string[];
  sellPrice?: number;
};

export type CommerceItem = {
  itemId: string;
  name: string;
  description?: string;
  emoji?: string;
  tags: string[];
  price: number;
  sellPrice?: number;
};

export type CommerceMetadata = {
  buy: CommerceItem[];
  sellTags: string[];
};

export type PoiSubObject = {
  id: string;
  name: string;
  description?: string;
  affordances: ObjectAffordance[];
  portable?: PortableObjectMetadata;
  commerce?: CommerceMetadata;
  subObjects?: PoiSubObject[];
};

export type Poi = {
  id: string;
  name: string;
  kind: 'home' | 'shop' | 'park' | 'workplace';
  bbox: { x: number; y: number; w: number; h: number };
  description: string;
  subObjects?: PoiSubObject[];
};

export type NearbyAffordance = {
  poiId: string;
  poiName: string;
  objectRef: string;
  objectPath: string[];
  objectName: string;
  affordanceId: string;
  affordanceName: string;
  description?: string;
  emoji?: string;
  defaultDurationMs?: number;
};

export type PortableObjectContext = {
  poiId: string;
  poiName: string;
  objectRef: string;
  objectPath: string[];
  objectName: string;
  item: InventoryItem;
};

export type CommerceObjectContext = {
  poiId: string;
  poiName: string;
  objectRef: string;
  objectPath: string[];
  objectName: string;
  buy: CommerceItem[];
  sellTags: string[];
};

export const serializedWorldMap = {
  width: v.number(),
  height: v.number(),

  tileSetUrl: v.string(),
  //  Width & height of tileset image, px.
  tileSetDimX: v.number(),
  tileSetDimY: v.number(),

  // Tile size in pixels (assume square)
  tileDim: v.number(),
  bgTiles: v.array(v.array(v.array(v.number()))),
  objectTiles: v.array(tileLayer),
  animatedSprites: v.array(v.object(animatedSprite)),
  pois: v.optional(v.array(poi)),
};
export type SerializedWorldMap = ObjectType<typeof serializedWorldMap>;

export class WorldMap {
  width: number;
  height: number;

  tileSetUrl: string;
  tileSetDimX: number;
  tileSetDimY: number;

  tileDim: number;

  bgTiles: TileLayer[];
  objectTiles: TileLayer[];
  animatedSprites: AnimatedSprite[];
  pois: Poi[];

  constructor(serialized: SerializedWorldMap) {
    this.width = serialized.width;
    this.height = serialized.height;
    this.tileSetUrl = serialized.tileSetUrl;
    this.tileSetDimX = serialized.tileSetDimX;
    this.tileSetDimY = serialized.tileSetDimY;
    this.tileDim = serialized.tileDim;
    this.bgTiles = serialized.bgTiles;
    this.objectTiles = serialized.objectTiles;
    this.animatedSprites = serialized.animatedSprites;
    this.pois = serialized.pois ?? [];
    for (const p of this.pois) {
      if (p.subObjects) {
        validatePoiSubObjects(p.subObjects, `POI ${p.id}`);
      }
    }
  }

  serialize(): SerializedWorldMap {
    return {
      width: this.width,
      height: this.height,
      tileSetUrl: this.tileSetUrl,
      tileSetDimX: this.tileSetDimX,
      tileSetDimY: this.tileSetDimY,
      tileDim: this.tileDim,
      bgTiles: this.bgTiles,
      objectTiles: this.objectTiles,
      animatedSprites: this.animatedSprites,
      pois: this.pois,
    };
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertOptionalString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`${label} must be a string when present`);
  }
}

function assertOptionalNumber(value: unknown, label: string): asserts value is number | undefined {
  if (value !== undefined && typeof value !== 'number') {
    throw new Error(`${label} must be a number when present`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function assertOptionalStringArray(
  value: unknown,
  label: string,
): asserts value is string[] | undefined {
  if (value !== undefined) {
    assertStringArray(value, label);
  }
}

function validateAffordance(value: unknown, context: string): asserts value is ObjectAffordance {
  if (!value || typeof value !== 'object') {
    throw new Error(`${context} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  assertString(candidate.id, `${context}.id`);
  assertString(candidate.name, `${context}.name`);
  assertOptionalString(candidate.description, `${context}.description`);
  assertOptionalString(candidate.emoji, `${context}.emoji`);
  assertOptionalNumber(candidate.defaultDurationMs, `${context}.defaultDurationMs`);
}

function validatePortable(
  value: unknown,
  context: string,
): asserts value is PortableObjectMetadata {
  if (!value || typeof value !== 'object') {
    throw new Error(`${context} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  assertString(candidate.itemId, `${context}.itemId`);
  assertOptionalString(candidate.name, `${context}.name`);
  assertOptionalString(candidate.description, `${context}.description`);
  assertOptionalString(candidate.emoji, `${context}.emoji`);
  assertOptionalStringArray(candidate.tags, `${context}.tags`);
  assertOptionalNumber(candidate.sellPrice, `${context}.sellPrice`);
}

function validateCommerceItem(value: unknown, context: string): asserts value is CommerceItem {
  if (!value || typeof value !== 'object') {
    throw new Error(`${context} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  assertString(candidate.itemId, `${context}.itemId`);
  assertString(candidate.name, `${context}.name`);
  assertOptionalString(candidate.description, `${context}.description`);
  assertOptionalString(candidate.emoji, `${context}.emoji`);
  assertStringArray(candidate.tags, `${context}.tags`);
  assertOptionalNumber(candidate.sellPrice, `${context}.sellPrice`);
  if (typeof candidate.price !== 'number' || candidate.price < 0) {
    throw new Error(`${context}.price must be a non-negative number`);
  }
}

function validateCommerce(value: unknown, context: string): asserts value is CommerceMetadata {
  if (!value || typeof value !== 'object') {
    throw new Error(`${context} must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.buy)) {
    throw new Error(`${context}.buy must be an array`);
  }
  candidate.buy.forEach((item, index) => validateCommerceItem(item, `${context}.buy[${index}]`));
  assertStringArray(candidate.sellTags, `${context}.sellTags`);
}

export function validatePoiSubObjects(
  value: unknown,
  context = 'POI subObjects',
): asserts value is PoiSubObject[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
  value.forEach((item, index) => {
    const objectContext = `${context}[${index}]`;
    if (!item || typeof item !== 'object') {
      throw new Error(`${objectContext} must be an object`);
    }
    const candidate = item as Record<string, unknown>;
    assertString(candidate.id, `${objectContext}.id`);
    assertString(candidate.name, `${objectContext}.name`);
    assertOptionalString(candidate.description, `${objectContext}.description`);
    if (!Array.isArray(candidate.affordances)) {
      throw new Error(`${objectContext}.affordances must be an array`);
    }
    candidate.affordances.forEach((a, affordanceIndex) =>
      validateAffordance(a, `${objectContext}.affordances[${affordanceIndex}]`),
    );
    if (candidate.portable !== undefined) {
      validatePortable(candidate.portable, `${objectContext}.portable`);
    }
    if (candidate.commerce !== undefined) {
      validateCommerce(candidate.commerce, `${objectContext}.commerce`);
    }
    if (candidate.subObjects !== undefined) {
      validatePoiSubObjects(candidate.subObjects, `${objectContext}.subObjects`);
    }
  });
}

export function poiCenter(p: Pick<Poi, 'bbox'>) {
  return {
    x: Math.floor(p.bbox.x + p.bbox.w / 2),
    y: Math.floor(p.bbox.y + p.bbox.h / 2),
  };
}

export function poiObjectRef(poiId: string, objectPath: string[]) {
  return [poiId, ...objectPath].join('/');
}

function pointInBbox(position: { x: number; y: number }, bbox: Poi['bbox']) {
  return (
    position.x >= bbox.x &&
    position.y >= bbox.y &&
    position.x < bbox.x + bbox.w &&
    position.y < bbox.y + bbox.h
  );
}

function collectObjectAffordances(
  poi: Poi,
  objects: PoiSubObject[] | undefined,
  path: string[] = [],
): NearbyAffordance[] {
  const result: NearbyAffordance[] = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = poiObjectRef(poi.id, objectPath);
    for (const item of object.affordances) {
      result.push({
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        affordanceId: item.id,
        affordanceName: item.name,
        description: item.description,
        emoji: item.emoji,
        defaultDurationMs: item.defaultDurationMs,
      });
    }
    result.push(...collectObjectAffordances(poi, object.subObjects, objectPath));
  }
  return result;
}

export function nearbyAffordancesForPosition(pois: Poi[], position: { x: number; y: number }) {
  return pois
    .filter((p) => pointInBbox(position, p.bbox))
    .flatMap((p) => collectObjectAffordances(p, p.subObjects));
}

function itemFromPortable(object: PoiSubObject, objectRef: string): InventoryItem | null {
  if (!object.portable) {
    return null;
  }
  return {
    itemId: object.portable.itemId,
    name: object.portable.name ?? object.name,
    description: object.portable.description ?? object.description,
    emoji: object.portable.emoji,
    tags: object.portable.tags ?? [],
    sellPrice: object.portable.sellPrice,
    sourceObjectRef: objectRef,
  };
}

function collectPortableObjects(
  poi: Poi,
  takenRefs: Set<string>,
  objects: PoiSubObject[] | undefined,
  path: string[] = [],
): PortableObjectContext[] {
  const result: PortableObjectContext[] = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = poiObjectRef(poi.id, objectPath);
    const item = itemFromPortable(object, objectRef);
    if (item && !takenRefs.has(objectRef)) {
      result.push({
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        item,
      });
    }
    result.push(...collectPortableObjects(poi, takenRefs, object.subObjects, objectPath));
  }
  return result;
}

function collectCommerceObjects(
  poi: Poi,
  objects: PoiSubObject[] | undefined,
  path: string[] = [],
): CommerceObjectContext[] {
  const result: CommerceObjectContext[] = [];
  for (const object of objects ?? []) {
    const objectPath = [...path, object.id];
    const objectRef = poiObjectRef(poi.id, objectPath);
    if (object.commerce) {
      result.push({
        poiId: poi.id,
        poiName: poi.name,
        objectRef,
        objectPath,
        objectName: object.name,
        buy: object.commerce.buy,
        sellTags: object.commerce.sellTags,
      });
    }
    result.push(...collectCommerceObjects(poi, object.subObjects, objectPath));
  }
  return result;
}

export function portableObjectsForPosition(
  pois: Poi[],
  takenRefs: Set<string>,
  position: { x: number; y: number },
) {
  return pois
    .filter((p) => pointInBbox(position, p.bbox))
    .flatMap((p) => collectPortableObjects(p, takenRefs, p.subObjects));
}

export function commerceOptionsForPosition(pois: Poi[], position: { x: number; y: number }) {
  return pois
    .filter((p) => pointInBbox(position, p.bbox) && p.kind === 'shop')
    .flatMap((p) => collectCommerceObjects(p, p.subObjects));
}

function findObjectByPath(
  objects: PoiSubObject[] | undefined,
  path: string[],
): PoiSubObject | null {
  if (!objects || path.length === 0) {
    return null;
  }
  const [head, ...tail] = path;
  const object = objects.find((candidate) => candidate.id === head);
  if (!object) {
    return null;
  }
  return tail.length === 0 ? object : findObjectByPath(object.subObjects, tail);
}

export function findPoiObjectByRef(pois: Poi[], objectRef: string) {
  const [poiId, ...objectPath] = objectRef.split('/').filter(Boolean);
  if (!poiId || objectPath.length === 0) {
    return null;
  }
  const poi = pois.find((p) => p.id === poiId);
  if (!poi) {
    return null;
  }
  const object = findObjectByPath(poi.subObjects, objectPath);
  if (!object) {
    return null;
  }
  return { poi, object, objectPath };
}

export function findPortableByRef(pois: Poi[], objectRef: string) {
  const match = findPoiObjectByRef(pois, objectRef);
  if (!match) {
    return null;
  }
  const item = itemFromPortable(match.object, objectRef);
  if (!item) {
    return null;
  }
  return { ...match, item };
}

export function findCommerceByRef(pois: Poi[], objectRef: string) {
  const match = findPoiObjectByRef(pois, objectRef);
  if (!match || !match.object.commerce || match.poi.kind !== 'shop') {
    return null;
  }
  return { ...match, commerce: match.object.commerce };
}

export function commerceItemToInventoryItem(item: CommerceItem): InventoryItem {
  return {
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    emoji: item.emoji,
    tags: item.tags,
    sellPrice: item.sellPrice,
  };
}

export function findAffordanceByRef(pois: Poi[], objectRef: string, affordanceId: string) {
  const match = findPoiObjectByRef(pois, objectRef);
  const object = match?.object;
  const affordance = object?.affordances.find((a) => a.id === affordanceId);
  if (!match || !object || !affordance) {
    return null;
  }
  return { ...match, affordance };
}
