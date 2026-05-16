export type PoiKind = 'home' | 'shop' | 'park' | 'workplace';

export type Poi = {
  id: string;
  name: string;
  kind: PoiKind;
  bbox: { x: number; y: number; w: number; h: number };
  description: string;
};

// Bbox coordinates are tile-space. The map is 64 tiles wide × 48 tiles tall.
export const pois: Poi[] = [
  {
    id: 'lucky-cottage',
    name: "Lucky's Cottage",
    kind: 'home',
    bbox: { x: 4, y: 6, w: 6, h: 5 },
    description: "A cluttered cottage smelling of aged cheese and old books. Lucky lives here.",
  },
  {
    id: 'bob-hut',
    name: "Bob's Hut",
    kind: 'home',
    bbox: { x: 28, y: 4, w: 5, h: 4 },
    description: "A small hut surrounded by a vegetable garden. Bob lives here.",
  },
  {
    id: 'stella-loft',
    name: "Stella's Loft",
    kind: 'home',
    bbox: { x: 52, y: 6, w: 5, h: 5 },
    description: "A second-floor loft over an empty storefront. Stella lives here.",
  },
  {
    id: 'coffee-shop',
    name: 'The Coffee Shop',
    kind: 'shop',
    bbox: { x: 10, y: 22, w: 8, h: 6 },
    description: "The town's only coffee shop. Where everyone ends up sooner or later.",
  },
  {
    id: 'town-square',
    name: 'Town Square',
    kind: 'park',
    bbox: { x: 28, y: 22, w: 12, h: 10 },
    description: "An open paved square in the middle of town with a fountain.",
  },
  {
    id: 'pete-rectory',
    name: "Pete's Rectory",
    kind: 'home',
    bbox: { x: 50, y: 22, w: 5, h: 5 },
    description: "A small wooden rectory beside the chapel. Pete lives here.",
  },
  {
    id: 'alice-tower',
    name: "Alice's Tower",
    kind: 'home',
    bbox: { x: 10, y: 38, w: 5, h: 7 },
    description: "A narrow tower stuffed with telescopes and chalkboards. Alice lives here.",
  },
];

export function poiCenter(p: Poi) {
  return {
    x: Math.floor(p.bbox.x + p.bbox.w / 2),
    y: Math.floor(p.bbox.y + p.bbox.h / 2),
  };
}
