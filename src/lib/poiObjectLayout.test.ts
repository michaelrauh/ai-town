import type { Poi } from '../../convex/aiTown/worldMap';
import { layoutPoiObjects } from './poiObjectLayout';

function testPoi(): Poi {
  return {
    id: 'cafe',
    name: 'Cafe',
    kind: 'shop',
    bbox: { x: 10, y: 20, w: 8, h: 6 },
    description: 'A cafe.',
    subObjects: [
      {
        id: 'counter',
        name: 'Counter',
        affordances: [{ id: 'order', name: 'Order coffee' }],
        commerce: {
          buy: [{ itemId: 'coffee-cup', name: 'Coffee cup', tags: ['drink'], price: 4 }],
          sellTags: ['food'],
        },
        subObjects: [
          {
            id: 'espresso-machine',
            name: 'Espresso machine',
            affordances: [{ id: 'steam-milk', name: 'Steam milk' }],
          },
        ],
      },
      {
        id: 'bookshelf',
        name: 'Bookshelf',
        affordances: [{ id: 'read', name: 'Read' }],
        portable: {
          itemId: 'small-book',
          name: 'Small book',
          tags: ['book'],
          sellPrice: 2,
        },
      },
    ],
  };
}

describe('poi object layout', () => {
  test('recursively flattens object tree with stable refs', () => {
    const objects = layoutPoiObjects(testPoi(), 32);

    expect(objects.map((object) => object.objectRef)).toEqual([
      'cafe/counter',
      'cafe/counter/espresso-machine',
      'cafe/bookshelf',
    ]);
    expect(objects[1]).toMatchObject({
      objectName: 'Espresso machine',
      parentObjectRef: 'cafe/counter',
      depth: 1,
      affordances: [{ id: 'steam-milk', name: 'Steam milk' }],
    });
    expect(objects[0].commerce).toMatchObject({
      buy: [{ itemId: 'coffee-cup', name: 'Coffee cup', tags: ['drink'], price: 4 }],
    });
    expect(objects[2].portable).toMatchObject({ itemId: 'small-book', name: 'Small book' });
  });

  test('keeps positions inside the POI bbox', () => {
    const poi = testPoi();
    const objects = layoutPoiObjects(poi, 32);

    for (const object of objects) {
      expect(object.x).toBeGreaterThan(poi.bbox.x);
      expect(object.x).toBeLessThan(poi.bbox.x + poi.bbox.w);
      expect(object.y).toBeGreaterThan(poi.bbox.y);
      expect(object.y).toBeLessThan(poi.bbox.y + poi.bbox.h);
      expect(object.xPx).toBe(object.x * 32);
      expect(object.yPx).toBe(object.y * 32);
    }
  });

  test('keeps nested objects visually grouped under parent objects', () => {
    const objects = layoutPoiObjects(testPoi(), 32);
    const counter = objects.find((object) => object.objectRef === 'cafe/counter')!;
    const machine = objects.find((object) => object.objectRef === 'cafe/counter/espresso-machine')!;
    const bookshelf = objects.find((object) => object.objectRef === 'cafe/bookshelf')!;

    expect(machine.depth).toBeGreaterThan(counter.depth);
    expect(machine.x).toBeGreaterThan(counter.x);
    expect(Math.abs(machine.y - counter.y)).toBeLessThan(Math.abs(bookshelf.y - counter.y));
  });
});
