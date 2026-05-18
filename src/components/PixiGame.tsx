import { useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import { PixiPois } from './PixiPois.tsx';
import { PixiGroundItems } from './PixiGroundItems.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import type { StepDirection } from '../../convex/aiTown/player.ts';
import { locationFields, playerLocation, type Location } from '../../convex/aiTown/location.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { lightingForTime } from '../lib/dayCycle.ts';
import { PixiLightingOverlay } from './PixiLightingOverlay.tsx';

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

function directionFromKey(key: string): StepDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'north';
    case 'ArrowDown':
      return 'south';
    case 'ArrowRight':
      return 'east';
    case 'ArrowLeft':
      return 'west';
    default:
      return null;
  }
}

const HELD_KEY_RETRY_MS = 50;
const HELD_KEY_SUCCESS_DELAY_MS = 120;
const HELD_STEP_PREFETCH_DISTANCE = 0.35;
const CAMERA_FOLLOW_LERP = 0.18;

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  setSelectedElement: SelectElement;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayer = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  );
  const humanPlayerId = humanPlayer?.id;
  const humanLocation = useHistoricalValue<Location>(
    locationFields,
    props.historicalTime,
    humanPlayer ? playerLocation(humanPlayer) : undefined,
    humanPlayer ? props.game.world.historicalLocations?.get(humanPlayer.id) : undefined,
  );

  const moveTo = useSendInput(props.engineId, 'moveTo');
  const stepPlayer = useSendInput(props.engineId, 'stepPlayer');
  const pickUpItem = useSendInput(props.engineId, 'pickUpItem');
  const latestGameRef = useRef(props.game);
  const latestHumanPlayerIdRef = useRef(humanPlayerId);
  const latestHumanLocationRef = useRef(humanLocation);
  const stepPlayerRef = useRef(stepPlayer);
  const heldDirectionsRef = useRef<StepDirection[]>([]);
  const stepInFlightRef = useRef(false);
  const heldStepTimerRef = useRef<number | undefined>();
  const heldErrorSuppressedRef = useRef(false);
  const cameraTargetRef = useRef<{ x: number; y: number }>();
  const cameraInitializedRef = useRef(false);

  latestGameRef.current = props.game;
  latestHumanPlayerIdRef.current = humanPlayerId;
  latestHumanLocationRef.current = humanLocation;
  stepPlayerRef.current = stepPlayer;
  if (humanLocation) {
    cameraTargetRef.current = {
      x: humanLocation.x * props.game.worldMap.tileDim + props.game.worldMap.tileDim / 2,
      y: humanLocation.y * props.game.worldMap.tileDim + props.game.worldMap.tileDim / 2,
    };
  }

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (!humanPlayerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const onPickUpGroundItem = async (groundItemId: GameId<'groundItems'>) => {
    if (!humanPlayerId) {
      return;
    }
    await toastOnError(
      pickUpItem({
        playerId: humanPlayerId,
        source: { kind: 'groundItem', groundItemId },
      }),
    );
  };
  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];
  const currentTime = props.historicalTime ?? Date.now();
  const lighting = lightingForTime(currentTime);

  useEffect(() => {
    function clearHeldStepTimer() {
      if (heldStepTimerRef.current !== undefined) {
        window.clearTimeout(heldStepTimerRef.current);
        heldStepTimerRef.current = undefined;
      }
    }

    function scheduleHeldStep(delay = 0) {
      if (heldStepTimerRef.current !== undefined || heldDirectionsRef.current.length === 0) {
        return;
      }
      heldStepTimerRef.current = window.setTimeout(runHeldStep, delay);
    }

    async function runHeldStep() {
      heldStepTimerRef.current = undefined;
      const directions = heldDirectionsRef.current;
      const direction = directions[directions.length - 1];
      const playerId = latestHumanPlayerIdRef.current;
      if (!direction || !playerId || heldErrorSuppressedRef.current) {
        return;
      }

      const humanPlayer = latestGameRef.current.world.players.get(playerId);
      if (!humanPlayer) {
        return;
      }
      if (stepInFlightRef.current) {
        scheduleHeldStep(HELD_KEY_RETRY_MS);
        return;
      }

      const location = latestHumanLocationRef.current;
      if (humanPlayer.pathfinding) {
        if (!location) {
          scheduleHeldStep(HELD_KEY_RETRY_MS);
          return;
        }
        const { destination } = humanPlayer.pathfinding;
        const remaining = Math.hypot(destination.x - location.x, destination.y - location.y);
        if (remaining > HELD_STEP_PREFETCH_DISTANCE) {
          scheduleHeldStep(HELD_KEY_RETRY_MS);
          return;
        }
      }

      if (!humanPlayer.pathfinding && !location) {
        scheduleHeldStep(HELD_KEY_RETRY_MS);
        return;
      }

      stepInFlightRef.current = true;
      try {
        await stepPlayerRef.current({ playerId, direction });
        scheduleHeldStep(HELD_KEY_SUCCESS_DELAY_MS);
      } catch (error: any) {
        if (error?.message?.includes('already moving')) {
          scheduleHeldStep(HELD_KEY_RETRY_MS);
        } else if (!heldErrorSuppressedRef.current) {
          heldErrorSuppressedRef.current = true;
          void toastOnError(Promise.reject(error)).catch(() => null);
        }
      } finally {
        stepInFlightRef.current = false;
        if (heldDirectionsRef.current.length > 0 && heldStepTimerRef.current === undefined) {
          scheduleHeldStep(HELD_KEY_RETRY_MS);
        }
      }
    }

    function removeHeldDirection(direction: StepDirection) {
      heldDirectionsRef.current = heldDirectionsRef.current.filter((d) => d !== direction);
      heldErrorSuppressedRef.current = false;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const direction = directionFromKey(e.key);
      if (!direction || e.defaultPrevented || isEditableKeyboardTarget(e.target)) {
        return;
      }
      if (!latestHumanPlayerIdRef.current) {
        return;
      }
      e.preventDefault();
      if (!heldDirectionsRef.current.includes(direction)) {
        removeHeldDirection(direction);
        heldDirectionsRef.current = [...heldDirectionsRef.current, direction];
      }
      scheduleHeldStep();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const direction = directionFromKey(e.key);
      if (!direction) {
        return;
      }
      e.preventDefault();
      removeHeldDirection(direction);
      if (heldDirectionsRef.current.length === 0) {
        clearHeldStepTimer();
      } else {
        scheduleHeldStep();
      }
    };

    const onBlur = () => {
      heldDirectionsRef.current = [];
      heldErrorSuppressedRef.current = false;
      clearHeldStepTimer();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      clearHeldStepTimer();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    cameraInitializedRef.current = false;
  }, [humanPlayerId]);

  // Keep the camera centered on the playable character without changing zoom.
  useEffect(() => {
    let frame: number;
    const followCamera = () => {
      const viewport = viewportRef.current;
      const target = cameraTargetRef.current;
      if (viewport && target && props.width > 0 && props.height > 0) {
        if (!cameraInitializedRef.current) {
          viewport.moveCenter(target.x, target.y);
          cameraInitializedRef.current = true;
        } else {
          const center = viewport.center;
          viewport.moveCenter(
            center.x + (target.x - center.x) * CAMERA_FOLLOW_LERP,
            center.y + (target.y - center.y) * CAMERA_FOLLOW_LERP,
          );
        }
      }
      frame = requestAnimationFrame(followCamera);
    };
    frame = requestAnimationFrame(followCamera);
    return () => cancelAnimationFrame(frame);
  }, [props.height, props.width]);

  useEffect(() => {
    if (!humanLocation) {
      return;
    }
    cameraTargetRef.current = {
      x: humanLocation.x * tileDim + tileDim / 2,
      y: humanLocation.y * tileDim + tileDim / 2,
    };
  }, [humanLocation?.x, humanLocation?.y, tileDim]);

  return (
    <PixiViewport
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      viewportRef={viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      <PixiPois game={props.game} currentTime={currentTime} />
      <PixiGroundItems
        game={props.game}
        humanPlayerId={humanPlayerId}
        onPickUp={onPickUpGroundItem}
      />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
        />
      ))}
      <PixiLightingOverlay
        widthPx={width * tileDim}
        heightPx={height * tileDim}
        lighting={lighting}
      />
    </PixiViewport>
  );
};
export default PixiGame;
