import { ServerGame } from '../hooks/serverGame.ts';
import { GameId } from '../../convex/aiTown/ids.ts';

const MINIMAP_WIDTH_PX = 220;

const POI_KIND_COLOR: Record<string, string> = {
  home: 'bg-brown-500/60 border-brown-100/40',
  shop: 'bg-clay-500/60 border-brown-100/40',
  park: 'bg-emerald-700/40 border-brown-100/40',
  workplace: 'bg-clay-700/60 border-brown-100/40',
};

export function Minimap({
  game,
  humanPlayerId,
}: {
  game: ServerGame;
  humanPlayerId?: GameId<'players'>;
}) {
  const { width: mapW, height: mapH } = game.worldMap;
  const scale = MINIMAP_WIDTH_PX / mapW;
  const minimapHeightPx = mapH * scale;
  const players = [...game.world.players.values()];
  const pois = game.worldMap.pois ?? [];

  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-10 border-4 border-brown-900 bg-brown-800/90 p-1.5 shadow-2xl backdrop-blur-sm"
      style={{ width: MINIMAP_WIDTH_PX + 12 }}
    >
      <div
        className="relative bg-brown-700"
        style={{ width: MINIMAP_WIDTH_PX, height: minimapHeightPx }}
      >
        {pois.map((p) => (
          <div
            key={p.id}
            title={p.name}
            className={`absolute border ${POI_KIND_COLOR[p.kind] ?? POI_KIND_COLOR.home}`}
            style={{
              left: p.bbox.x * scale,
              top: p.bbox.y * scale,
              width: p.bbox.w * scale,
              height: p.bbox.h * scale,
            }}
          />
        ))}
        {players.map((p) => {
          const isHuman = p.id === humanPlayerId;
          const size = isHuman ? 7 : 5;
          return (
            <div
              key={p.id}
              className={`absolute rounded-full ${
                isHuman
                  ? 'bg-yellow-300 ring-1 ring-brown-100'
                  : 'bg-brown-300'
              }`}
              style={{
                width: size,
                height: size,
                left: p.position.x * scale - size / 2,
                top: p.position.y * scale - size / 2,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
