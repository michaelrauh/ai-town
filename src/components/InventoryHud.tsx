import { Id } from '../../convex/_generated/dataModel';
import type { ReactNode } from 'react';
import type { Player } from '../../convex/aiTown/player';
import { useSendInput } from '../hooks/sendInput';
import { ServerGame } from '../hooks/serverGame';
import { toastOnError } from '../toasts';
import { buildInspectorContext } from '../lib/inspectorContext';

export function InventoryHud({
  engineId,
  game,
  humanPlayer,
  currentTime,
}: {
  engineId: Id<'engines'>;
  game: ServerGame;
  humanPlayer: Player | undefined;
  currentTime: number;
}) {
  const pickUpItem = useSendInput(engineId, 'pickUpItem');
  const putDownItem = useSendInput(engineId, 'putDownItem');
  const buyItem = useSendInput(engineId, 'buyItem');
  const sellItem = useSendInput(engineId, 'sellItem');

  if (!humanPlayer) {
    return null;
  }
  const context = buildInspectorContext(game, humanPlayer.id, currentTime);
  if (!context) {
    return null;
  }
  const hasEmptySlot = context.inventory.some((slot) => slot === null);
  const sellOptions = context.surroundings.commerceOptions.flatMap((commerce) =>
    context.inventory
      .map((item, slotIndex) => ({ item, slotIndex }))
      .filter(({ item }) => {
        const sellPrice = item?.sellPrice ?? 0;
        return !!item && sellPrice > 0 && item.tags.some((tag) => commerce.sellTags.includes(tag));
      })
      .map(({ item, slotIndex }) => ({
        commerce,
        item: item!,
        slotIndex,
      })),
  );

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 w-[min(22rem,calc(100vw-1.5rem))] border-4 border-brown-900 bg-brown-800/95 p-3 text-brown-100 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="font-display text-2xl leading-none text-white shadow-solid">Inventory</div>
        <div className="text-sm text-brown-100">{context.coins} coins</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {context.inventory.map((item, index) => (
          <div key={index} className="min-h-16 border-2 border-brown-900 bg-brown-900/40 p-2">
            <div className="text-xs uppercase text-brown-200">Slot {index + 1}</div>
            <div className="mt-1 min-h-6 text-sm leading-tight text-white">
              {item ? `${item.emoji ? `${item.emoji} ` : ''}${item.name}` : 'Empty'}
            </div>
            {item && (
              <HudButton
                onClick={() =>
                  void toastOnError(putDownItem({ playerId: humanPlayer.id, slotIndex: index }))
                }
              >
                Drop
              </HudButton>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
        {hasEmptySlot &&
          context.surroundings.portableObjects.slice(0, 4).map((portable) => (
            <HudButton
              key={portable.objectRef}
              onClick={() =>
                void toastOnError(
                  pickUpItem({
                    playerId: humanPlayer.id,
                    source: { kind: 'poiObject', objectRef: portable.objectRef },
                  }),
                )
              }
            >
              Pick up {portable.item.name}
            </HudButton>
          ))}
        {hasEmptySlot &&
          context.surroundings.nearbyGroundItems.slice(0, 4).map((groundItem) => (
            <HudButton
              key={groundItem.id}
              onClick={() =>
                void toastOnError(
                  pickUpItem({
                    playerId: humanPlayer.id,
                    source: { kind: 'groundItem', groundItemId: groundItem.id },
                  }),
                )
              }
            >
              Pick up {groundItem.item.name}
            </HudButton>
          ))}
        {hasEmptySlot &&
          context.surroundings.commerceOptions.flatMap((commerce) =>
            commerce.buy.map((item) => (
              <HudButton
                key={`${commerce.objectRef}-${item.itemId}`}
                disabled={item.price > context.coins}
                onClick={() =>
                  void toastOnError(
                    buyItem({
                      playerId: humanPlayer.id,
                      objectRef: commerce.objectRef,
                      itemId: item.itemId,
                    }),
                  )
                }
              >
                Buy {item.name} ({item.price})
              </HudButton>
            )),
          )}
        {sellOptions.map(({ commerce, item, slotIndex }) => (
          <HudButton
            key={`${commerce.objectRef}-${slotIndex}`}
            onClick={() =>
              void toastOnError(
                sellItem({
                  playerId: humanPlayer.id,
                  objectRef: commerce.objectRef,
                  slotIndex,
                }),
              )
            }
          >
            Sell {item.name} ({item.sellPrice})
          </HudButton>
        ))}
      </div>
    </div>
  );
}

function HudButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="mt-2 block w-full border-2 border-brown-900 bg-clay-700 px-2 py-1 text-left text-xs text-white shadow-solid disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
