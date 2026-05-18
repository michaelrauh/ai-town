import { Container, Graphics, Text } from '@pixi/react';
import { TextStyle } from 'pixi.js';
import { GROUND_ITEM_PICKUP_RADIUS } from '../../convex/aiTown/inventory';
import type { GameId } from '../../convex/aiTown/ids';
import type { ServerGame } from '../hooks/serverGame';

const itemStyle = new TextStyle({
  fontFamily: 'monospace',
  fontSize: 9,
  fill: 0xffffff,
  stroke: 0x181425,
  strokeThickness: 2,
  fontWeight: 'bold',
});

export function PixiGroundItems({
  game,
  humanPlayerId,
  onPickUp,
}: {
  game: ServerGame;
  humanPlayerId?: GameId<'players'>;
  onPickUp: (groundItemId: GameId<'groundItems'>) => void;
}) {
  const tileDim = game.worldMap.tileDim;
  const humanPlayer = humanPlayerId ? game.world.players.get(humanPlayerId) : undefined;
  const hasEmptySlot = !!humanPlayer && humanPlayer.inventory.some((slot) => slot === null);
  return (
    <Container eventMode="none">
      {[...game.world.groundItems.values()].map((groundItem) => {
        const x = groundItem.position.x * tileDim + tileDim / 2;
        const y = groundItem.position.y * tileDim + tileDim / 2;
        const canPickUp =
          hasEmptySlot &&
          !!humanPlayer &&
          Math.hypot(
            humanPlayer.position.x - groundItem.position.x,
            humanPlayer.position.y - groundItem.position.y,
          ) <= GROUND_ITEM_PICKUP_RADIUS;
        return (
          <Container
            key={groundItem.id}
            eventMode={canPickUp ? 'static' : 'none'}
            cursor={canPickUp ? 'pointer' : undefined}
            onpointertap={(event) => {
              event.stopPropagation();
              if (canPickUp) {
                onPickUp(groundItem.id as GameId<'groundItems'>);
              }
            }}
          >
            <Graphics
              draw={(g) => {
                g.clear();
                g.beginFill(0xd6b86f, 0.95);
                g.lineStyle(2, 0x181425, 0.95);
                g.drawCircle(x, y, 8);
                g.endFill();
                g.beginFill(0xffffff, 0.8);
                g.drawCircle(x - 3, y - 3, 2);
                g.endFill();
              }}
            />
            <Text text={groundItem.item.emoji ?? 'item'} x={x} y={y - 1} anchor={0.5} style={itemStyle} />
            <Text text={groundItem.item.name} x={x} y={y + 15} anchor={0.5} style={itemStyle} />
          </Container>
        );
      })}
    </Container>
  );
}
