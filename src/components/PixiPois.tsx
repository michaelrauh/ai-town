import { Container, Graphics, Text } from '@pixi/react';
import { TextStyle } from 'pixi.js';
import { ServerGame } from '../hooks/serverGame.ts';

export function PixiPois({ game }: { game: ServerGame }) {
  const tileDim = game.worldMap.tileDim;
  const pois = game.worldMap.pois ?? [];

  return (
    <Container>
      {pois.map((p) => {
        const x = p.bbox.x * tileDim;
        const y = p.bbox.y * tileDim;
        const w = p.bbox.w * tileDim;
        const h = p.bbox.h * tileDim;
        const isOpen = p.kind === 'park';
        const wallColor = p.kind === 'shop' ? 0x8b4f3a : 0x6a4936;
        const roofColor = p.kind === 'shop' ? 0x5a2a1a : 0x3a1f12;
        const wallH = h * 0.65;
        const roofH = h * 0.35;
        return (
          <Container key={p.id}>
            <Graphics
              draw={(g) => {
                g.clear();
                if (isOpen) {
                  g.beginFill(0xb8a07a, 0.35);
                  g.lineStyle(2, 0x8b6f4d, 0.7);
                  g.drawRect(x, y, w, h);
                  g.endFill();
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  g.beginFill(0x4a6ea8, 0.7);
                  g.lineStyle(2, 0x2a4a78, 1);
                  g.drawCircle(cx, cy, Math.min(w, h) * 0.18);
                  g.endFill();
                } else {
                  g.beginFill(wallColor, 0.95);
                  g.lineStyle(2, 0x2a1209, 1);
                  g.drawRect(x, y + roofH, w, wallH);
                  g.endFill();
                  g.beginFill(roofColor, 0.95);
                  g.lineStyle(2, 0x2a1209, 1);
                  g.moveTo(x - 6, y + roofH);
                  g.lineTo(x + w / 2, y);
                  g.lineTo(x + w + 6, y + roofH);
                  g.closePath();
                  g.endFill();
                  const doorW = Math.min(26, w * 0.25);
                  const doorH = Math.min(36, wallH * 0.55);
                  g.beginFill(0x2a1209, 0.95);
                  g.drawRect(x + w / 2 - doorW / 2, y + h - doorH, doorW, doorH);
                  g.endFill();
                  const windowSize = 11;
                  g.beginFill(0xfff4c2, 0.9);
                  g.lineStyle(1, 0x2a1209, 1);
                  g.drawRect(x + w * 0.22 - windowSize / 2, y + roofH + wallH * 0.25, windowSize, windowSize);
                  g.drawRect(x + w * 0.78 - windowSize / 2, y + roofH + wallH * 0.25, windowSize, windowSize);
                  g.endFill();
                }
              }}
            />
            <Text
              text={p.name}
              x={x + w / 2}
              y={y - 16}
              anchor={0.5}
              style={
                new TextStyle({
                  fontFamily: 'monospace',
                  fontSize: 14,
                  fill: 0xffffff,
                  stroke: 0x000000,
                  strokeThickness: 3,
                  fontWeight: 'bold',
                })
              }
            />
          </Container>
        );
      })}
    </Container>
  );
}
