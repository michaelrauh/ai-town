import { useEffect, useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useMutation, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { Minimap } from './Minimap.tsx';
import PauseMenu from './PauseMenu.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { waitForInput } from '../hooks/sendInput.ts';
import { toast } from 'react-toastify';
import { DEFAULT_NAME } from '../../convex/constants.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

const autoJoinStartedWorlds = new Set<string>();
const autoJoinFailedWorlds = new Set<string>();

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const joinWorld = useMutation(api.world.joinWorld);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);
  const players = game ? [...game.world.players.values()] : [];
  const humanIdentifier = humanTokenIdentifier ?? DEFAULT_NAME;
  const humanPlayer =
    humanTokenIdentifier === undefined
      ? undefined
      : players.find((p) => p.human === humanIdentifier);
  const humanConversation = humanPlayer ? game?.world.playerConversation(humanPlayer) : undefined;
  const showDetails = !!selectedElement || !!humanConversation;

  useEffect(() => {
    if (
      !worldId ||
      !game ||
      humanTokenIdentifier === undefined ||
      humanPlayer ||
      autoJoinStartedWorlds.has(worldId) ||
      autoJoinFailedWorlds.has(worldId)
    ) {
      return;
    }

    autoJoinStartedWorlds.add(worldId);
    void (async () => {
      try {
        const inputId = await joinWorld({ worldId });
        await waitForInput(convex, inputId);
      } catch (error: any) {
        autoJoinFailedWorlds.add(worldId);
        toast.error(error instanceof Error ? error.message : String(error));
      }
    })();
  }, [convex, game, humanPlayer, humanTokenIdentifier, joinWorld, worldId]);

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black" ref={gameWrapperRef}>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
        {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
        <ConvexProvider client={convex}>
          <PixiGame
            game={game}
            worldId={worldId}
            engineId={engineId}
            width={width}
            height={height}
            historicalTime={historicalTime}
            setSelectedElement={setSelectedElement}
          />
        </ConvexProvider>
      </Stage>
      <Minimap game={game} humanPlayerId={humanPlayer?.id} />
      <div className="pointer-events-none absolute bottom-3 left-3 z-10">
        <PauseMenu />
      </div>
      {showDetails && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div
            className="pointer-events-auto absolute bottom-3 right-3 top-3 w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto border-8 border-brown-900 bg-brown-800/95 px-4 py-5 text-brown-100 shadow-2xl backdrop-blur-sm"
            ref={scrollViewRef}
          >
            <PlayerDetails
              worldId={worldId}
              engineId={engineId}
              game={game}
              playerId={selectedElement?.id}
              setSelectedElement={setSelectedElement}
              scrollViewRef={scrollViewRef}
            />
          </div>
        </div>
      )}
    </div>
  );
}
