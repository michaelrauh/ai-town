import { Container, Graphics, Text } from '@pixi/react';
import { TextStyle } from 'pixi.js';
import { ServerGame } from '../hooks/serverGame.ts';
import { layoutPoiObjects, type LaidOutPoiObject } from '../lib/poiObjectLayout.ts';

type ObjectUserBadge = {
  playerName: string;
  affordanceName: string;
  description: string;
};

const poiNameStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 14,
  fill: 0xffffff,
  stroke: 0x000000,
  strokeThickness: 3,
  fontWeight: 'bold',
});

const objectNameStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 10,
  fill: 0xffffff,
  stroke: 0x000000,
  strokeThickness: 3,
  fontWeight: 'bold',
});

const affordanceStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 8,
  fill: 0xead4aa,
  stroke: 0x181425,
  strokeThickness: 2,
});

const badgeStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 9,
  fill: 0xffffff,
  stroke: 0x181425,
  strokeThickness: 2,
  fontWeight: 'bold',
});

export function PixiPois({ game, currentTime }: { game: ServerGame; currentTime: number }) {
  const tileDim = game.worldMap.tileDim;
  const pois = game.worldMap.pois ?? [];
  const objectUsers = objectUsersByRef(game, currentTime);

  return (
    <Container eventMode="none">
      {pois.map((p) => {
        const x = p.bbox.x * tileDim;
        const y = p.bbox.y * tileDim;
        const w = p.bbox.w * tileDim;
        const h = p.bbox.h * tileDim;
        const objects = layoutPoiObjects(p, tileDim);
        const objectByRef = new Map(objects.map((object) => [object.objectRef, object]));
        return (
          <Container key={p.id} eventMode="none">
            <Graphics
              eventMode="none"
              draw={(g) => {
                g.clear();
                const floorColor = floorColorForKind(p.kind);
                g.beginFill(floorColor, p.kind === 'park' ? 0.32 : 0.58);
                g.lineStyle(2, 0x181425, p.kind === 'park' ? 0.45 : 0.8);
                g.drawRect(x, y, w, h);
                g.endFill();
                if (p.kind !== 'park') {
                  g.lineStyle(1, 0xffffff, 0.14);
                  for (let tx = x + tileDim; tx < x + w; tx += tileDim) {
                    g.moveTo(tx, y);
                    g.lineTo(tx, y + h);
                  }
                  for (let ty = y + tileDim; ty < y + h; ty += tileDim) {
                    g.moveTo(x, ty);
                    g.lineTo(x + w, ty);
                  }
                }
                g.lineStyle(3, outlineColorForKind(p.kind), 0.9);
                g.drawRect(x, y, w, h);
              }}
            />
            <ObjectConnectors objects={objects} objectByRef={objectByRef} />
            {objects.map((object) => (
              <ObjectMarker
                key={object.objectRef}
                object={object}
                users={objectUsers.get(object.objectRef) ?? []}
              />
            ))}
            <Text text={p.name} x={x + w / 2} y={y - 16} anchor={0.5} style={poiNameStyle} />
          </Container>
        );
      })}
    </Container>
  );
}

function ObjectConnectors({
  objects,
  objectByRef,
}: {
  objects: LaidOutPoiObject[];
  objectByRef: Map<string, LaidOutPoiObject>;
}) {
  return (
    <Graphics
      eventMode="none"
      draw={(g) => {
        g.clear();
        g.lineStyle(2, 0xffffff, 0.3);
        for (const object of objects) {
          if (!object.parentObjectRef) {
            continue;
          }
          const parent = objectByRef.get(object.parentObjectRef);
          if (!parent) {
            continue;
          }
          g.moveTo(parent.xPx, parent.yPx);
          g.lineTo(object.xPx, object.yPx);
        }
      }}
    />
  );
}

function ObjectMarker({ object, users }: { object: LaidOutPoiObject; users: ObjectUserBadge[] }) {
  const affordanceText = object.affordances.map((affordance) => affordance.name).join(', ');
  const userText = users.map((user) => `${user.playerName}: ${user.affordanceName}`).join(' / ');
  return (
    <Container eventMode="none">
      <Graphics
        eventMode="none"
        draw={(g) => {
          g.clear();
          const markerW = Math.max(18, Math.min(54, object.objectName.length * 5 + 12));
          const markerH = 16;
          g.beginFill(markerColor(object.depth), 0.92);
          g.lineStyle(2, 0x181425, 0.95);
          g.drawRoundedRect(object.xPx - markerW / 2, object.yPx - markerH / 2, markerW, markerH, 4);
          g.endFill();
          g.beginFill(0xffffff, 0.85);
          g.drawCircle(object.xPx - markerW / 2 + 6, object.yPx, 2.5);
          g.endFill();
        }}
      />
      <Text
        text={object.objectName}
        x={object.xPx}
        y={object.yPx - 20}
        anchor={0.5}
        style={objectNameStyle}
      />
      {affordanceText && (
        <Text
          text={affordanceText}
          x={object.xPx}
          y={object.yPx + 14}
          anchor={0.5}
          style={affordanceStyle}
        />
      )}
      {userText && (
        <>
          <Graphics
            eventMode="none"
            draw={(g) => {
              g.clear();
              const width = Math.max(42, Math.min(180, userText.length * 5 + 12));
              g.beginFill(0x3a4466, 0.94);
              g.lineStyle(2, 0x181425, 0.95);
              g.drawRoundedRect(object.xPx - width / 2, object.yPx - 39, width, 15, 4);
              g.endFill();
            }}
          />
          <Text text={userText} x={object.xPx} y={object.yPx - 32} anchor={0.5} style={badgeStyle} />
        </>
      )}
    </Container>
  );
}

function objectUsersByRef(game: ServerGame, currentTime: number) {
  const result = new Map<string, ObjectUserBadge[]>();
  for (const player of game.world.players.values()) {
    if (!player.objectUse || player.objectUse.until <= currentTime) {
      continue;
    }
    const user: ObjectUserBadge = {
      playerName: game.playerDescriptions.get(player.id)?.name ?? player.id,
      affordanceName: player.objectUse.affordanceName,
      description: player.objectUse.description,
    };
    const existing = result.get(player.objectUse.objectRef) ?? [];
    existing.push(user);
    result.set(player.objectUse.objectRef, existing);
  }
  return result;
}

function floorColorForKind(kind: string) {
  switch (kind) {
    case 'shop':
      return 0x8b6f4d;
    case 'workplace':
      return 0x5a6988;
    case 'park':
      return 0x4f8f5f;
    case 'home':
    default:
      return 0x7a5a43;
  }
}

function outlineColorForKind(kind: string) {
  switch (kind) {
    case 'shop':
      return 0x5a2a1a;
    case 'workplace':
      return 0x262b44;
    case 'park':
      return 0x2d5a3a;
    case 'home':
    default:
      return 0x3a1f12;
  }
}

function markerColor(depth: number) {
  const colors = [0xb86f50, 0x5a6988, 0xe4a672, 0x8b9bb4];
  return colors[depth % colors.length];
}
