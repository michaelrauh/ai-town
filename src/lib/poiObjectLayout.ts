import type {
  CommerceMetadata,
  ObjectAffordance,
  Poi,
  PoiSubObject,
  PortableObjectMetadata,
} from '../../convex/aiTown/worldMap';

export type LaidOutPoiObject = {
  poiId: string;
  poiName: string;
  objectRef: string;
  objectPath: string[];
  objectName: string;
  description: string | null;
  affordances: ObjectAffordance[];
  portable: PortableObjectMetadata | null;
  commerce: CommerceMetadata | null;
  depth: number;
  parentObjectRef: string | null;
  x: number;
  y: number;
  xPx: number;
  yPx: number;
};

type ObjectNode = {
  object: PoiSubObject;
  objectPath: string[];
  depth: number;
  parentObjectRef: string | null;
  start: number;
  end: number;
};

export function layoutPoiObjects(poi: Poi, tileDim: number): LaidOutPoiObject[] {
  const nodes: ObjectNode[] = [];
  let row = 0;
  let maxDepth = 0;

  function visit(objects: PoiSubObject[] | undefined, path: string[], depth: number): void {
    for (const object of objects ?? []) {
      const objectPath = [...path, object.id];
      const objectRef = objectRefFor(poi.id, objectPath);
      const start = row;
      row++;
      const node: ObjectNode = {
        object,
        objectPath,
        depth,
        parentObjectRef: path.length ? objectRefFor(poi.id, path) : null,
        start,
        end: start + 1,
      };
      nodes.push(node);
      maxDepth = Math.max(maxDepth, depth);
      visit(object.subObjects, objectPath, depth + 1);
      node.end = row;
    }
  }

  visit(poi.subObjects, [], 0);
  const count = Math.max(1, row);
  const xInset = Math.min(0.75, Math.max(0.35, poi.bbox.w * 0.12));
  const yInset = Math.min(0.75, Math.max(0.35, poi.bbox.h * 0.12));
  const usableW = Math.max(0.1, poi.bbox.w - xInset * 2);
  const usableH = Math.max(0.1, poi.bbox.h - yInset * 2);
  const depthCount = maxDepth + 1;

  return nodes.map((node) => {
    const subtreeCenter = (node.start + node.end) / 2;
    const x = poi.bbox.x + xInset + ((node.depth + 0.5) * usableW) / depthCount;
    const y = poi.bbox.y + yInset + (subtreeCenter * usableH) / count;
    const objectRef = objectRefFor(poi.id, node.objectPath);
    return {
      poiId: poi.id,
      poiName: poi.name,
      objectRef,
      objectPath: node.objectPath,
      objectName: node.object.name,
      description: node.object.description ?? null,
      affordances: node.object.affordances,
      portable: node.object.portable ?? null,
      commerce: node.object.commerce ?? null,
      depth: node.depth,
      parentObjectRef: node.parentObjectRef,
      x,
      y,
      xPx: x * tileDim,
      yPx: y * tileDim,
    };
  });
}

export function layoutWorldPoiObjects(pois: Poi[], tileDim: number) {
  return pois.flatMap((poi) => layoutPoiObjects(poi, tileDim));
}

function objectRefFor(poiId: string, objectPath: string[]) {
  return [poiId, ...objectPath].join('/');
}
