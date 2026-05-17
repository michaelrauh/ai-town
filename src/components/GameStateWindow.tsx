import clsx from 'clsx';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { GameId } from '../../convex/aiTown/ids';
import type { PoiSubObject } from '../../convex/aiTown/worldMap';
import closeImg from '../../assets/close.svg';
import type { ServerGame } from '../hooks/serverGame';
import {
  buildInspectorContext,
  type InspectorAffordance,
  type InspectorContext,
} from '../lib/inspectorContext';

type Tab = 'characters' | 'perception' | 'memories' | 'world' | 'raw';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'characters', label: 'Characters' },
  { id: 'perception', label: 'Perception' },
  { id: 'memories', label: 'Memories' },
  { id: 'world', label: 'World' },
  { id: 'raw', label: 'Raw' },
];

export default function GameStateWindow({
  worldId,
  engineId,
  game,
  currentTime,
  initialPlayerId,
  onClose,
}: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  currentTime: number;
  initialPlayerId?: GameId<'players'>;
  onClose: () => void;
}) {
  const players = useMemo(() => [...game.world.players.values()], [game.world.players]);
  const firstPlayerId = players[0]?.id;
  const [selectedPlayerId, setSelectedPlayerId] = useState<GameId<'players'> | undefined>(
    initialPlayerId ?? firstPlayerId,
  );
  const [activeTab, setActiveTab] = useState<Tab>('characters');

  useEffect(() => {
    if (selectedPlayerId && game.world.players.has(selectedPlayerId)) {
      return;
    }
    setSelectedPlayerId(initialPlayerId ?? firstPlayerId);
  }, [firstPlayerId, game.world.players, initialPlayerId, selectedPlayerId]);

  const selectedContext = useMemo(() => {
    return selectedPlayerId
      ? buildInspectorContext(game, selectedPlayerId, currentTime)
      : null;
  }, [currentTime, game, selectedPlayerId]);

  const activeConversationId = selectedContext?.state.conversation?.id;
  const conversationMessages = useQuery(
    api.messages.listMessages,
    activeConversationId ? { worldId, conversationId: activeConversationId } : 'skip',
  );
  const memories = useQuery(
    api.agent.memory.inspectorMemories,
    selectedPlayerId ? { worldId, playerId: selectedPlayerId, limit: 50 } : 'skip',
  );

  const rawContext = useMemo(() => {
    if (!selectedContext) {
      return null;
    }
    return {
      ...selectedContext,
      recentConversationMessages:
        conversationMessages?.map((message) => ({
          authorName: message.authorName,
          text: message.text,
          createdAt: message._creationTime,
        })) ?? [],
    };
  }, [conversationMessages, selectedContext]);

  return (
    <div className="flex h-full min-h-0 flex-col text-brown-100">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl leading-none text-white shadow-solid">
            State
          </h2>
          <div className="mt-1 text-xs text-brown-200">
            World {shortId(worldId)} / Engine {shortId(engineId)}
          </div>
        </div>
        <button
          className="button pointer-events-auto text-white shadow-solid"
          onClick={onClose}
          title="Close state window"
        >
          <span>
            <div className="bg-clay-700 p-1">
              <img className="h-4 w-4 sm:h-5 sm:w-5" src={closeImg} />
            </div>
          </span>
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={clsx(
              'border-2 border-brown-900 px-3 py-1 text-sm shadow-solid',
              activeTab === tab.id
                ? 'bg-clay-700 text-white'
                : 'bg-brown-700 text-brown-100 hover:bg-brown-500',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[16rem_1fr]">
        <div className="min-h-0 overflow-y-auto border-4 border-brown-900 bg-brown-900/30">
          <div className="bg-brown-700 px-3 py-2 font-display text-2xl text-white">Characters</div>
          <div className="divide-y divide-brown-900">
            {players.map((player) => {
              const description = game.playerDescriptions.get(player.id);
              const agent = [...game.world.agents.values()].find((a) => a.playerId === player.id);
              return (
                <button
                  key={player.id}
                  className={clsx(
                    'block w-full px-3 py-2 text-left hover:bg-brown-700/70',
                    selectedPlayerId === player.id && 'bg-brown-700 text-white',
                  )}
                  onClick={() => setSelectedPlayerId(player.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-base">{description?.name ?? player.id}</span>
                    <span className="text-xs text-brown-200">
                      {player.human ? 'Human' : agent ? 'NPC' : 'Player'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-brown-200">
                    {positionLabel(player.position)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto pr-1">
          {!selectedContext && <EmptyState>No character selected.</EmptyState>}
          {selectedContext && activeTab === 'characters' && (
            <CharactersTab context={selectedContext} />
          )}
          {selectedContext && activeTab === 'perception' && (
            <PerceptionTab context={selectedContext} messages={conversationMessages ?? []} />
          )}
          {selectedContext && activeTab === 'memories' && (
            <MemoriesTab memories={memories} />
          )}
          {selectedContext && activeTab === 'world' && (
            <WorldTab game={game} currentTime={currentTime} />
          )}
          {selectedContext && activeTab === 'raw' && <RawTab context={rawContext} />}
        </div>
      </div>
    </div>
  );
}

function CharactersTab({ context }: { context: InspectorContext }) {
  return (
    <div className="space-y-4">
      <Section title={context.self.name}>
        <Field label="Kind" value={context.self.kind} />
        <Field label="Character" value={context.self.character} />
        <Field label="Human" value={context.self.human} />
        <Field label="Agent" value={context.self.agentId} />
        <Field label="Profession" value={context.self.profession} />
        <Field label="Home" value={context.self.homeName} />
        <Field label="Position" value={positionLabel(context.position)} />
        <Field label="Current POI" value={context.currentPoi?.name ?? null} />
      </Section>

      <Section title="Schedule">
        <Field label="Block" value={context.schedule.currentBlock} />
        <Field label="Activity" value={context.schedule.scheduledActivity} />
        <Field label="Scheduled POI" value={context.schedule.scheduledPoi?.name ?? null} />
        <Field label="At scheduled POI" value={context.schedule.atScheduledPoi ? 'yes' : 'no'} />
      </Section>

      <Section title="State">
        <Field label="Activity" value={context.state.activity?.description ?? null} />
        <Field label="Object use" value={context.state.objectUse?.description ?? null} />
        <Field label="Pathfinding" value={pathfindingLabel(context.state.pathfinding)} />
        <Field label="Conversation" value={conversationLabel(context)} />
        <Field label="Agent operation" value={context.state.agentOperation?.name ?? null} />
      </Section>

      {(context.self.identity || context.self.plan) && (
        <Section title="Profile">
          <LongText label="Identity" value={context.self.identity} />
          <LongText label="Plan" value={context.self.plan} />
          <Field label="Friends" value={context.self.friends.join(', ') || null} />
          <Field
            label="Family"
            value={
              context.self.family.map((member) => `${member.name} (${member.kind})`).join(', ') ||
              null
            }
          />
        </Section>
      )}
    </div>
  );
}

function PerceptionTab({
  context,
  messages,
}: {
  context: InspectorContext;
  messages: Array<{ authorName: string; text: string; _creationTime: number }>;
}) {
  return (
    <div className="space-y-4">
      <Section title="Place">
        <Field label="Current POI" value={context.currentPoi?.name ?? null} />
        <LongText label="Description" value={context.currentPoi?.description ?? null} />
        <Field
          label="Map bounds"
          value={`${context.surroundings.mapBounds.width} x ${context.surroundings.mapBounds.height}`}
        />
      </Section>

      <Section title="Nearby Objects">
        {context.surroundings.nearbyAffordances.length === 0 ? (
          <EmptyState>No nearby object affordances in the current POI.</EmptyState>
        ) : (
          <div className="divide-y divide-brown-900">
            {context.surroundings.nearbyAffordances.map((affordance) => (
              <AffordanceRow key={affordance.id} affordance={affordance} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Nearby Characters">
        {context.surroundings.nearbyPlayers.length === 0 ? (
          <EmptyState>No nearby characters.</EmptyState>
        ) : (
          <div className="divide-y divide-brown-900">
            {context.surroundings.nearbyPlayers.map((player) => (
              <div key={player.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-white">{player.name}</span>
                  <span className="text-xs text-brown-200">
                    {player.distance.toFixed(1)} tiles
                  </span>
                </div>
                <div className="mt-1 text-xs text-brown-200">
                  {positionLabel(player.position)}
                  {player.currentPoi ? `, ${player.currentPoi.name}` : ''}
                </div>
                {(player.conversation || player.activity || player.objectUse) && (
                  <div className="mt-1 text-xs text-brown-100">
                    {[player.conversation?.status, player.activity, player.objectUse]
                      .filter(Boolean)
                      .join(' / ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent Conversation">
        {!context.state.conversation ? (
          <EmptyState>Not in a conversation.</EmptyState>
        ) : messages.length === 0 ? (
          <EmptyState>No messages loaded for this active conversation.</EmptyState>
        ) : (
          <div className="space-y-3">
            {messages.slice(-8).map((message) => (
              <div key={`${message._creationTime}-${message.authorName}`} className="text-sm">
                <div className="text-brown-200">
                  {message.authorName} at {timeLabel(message._creationTime)}
                </div>
                <div className="text-white">{message.text}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function MemoriesTab({
  memories,
}: {
  memories:
    | {
        name: string | null;
        memories: Array<{
          id: Id<'memories'>;
          description: string;
          importance: number;
          type: string;
          data: unknown;
          createdAt: number;
          lastAccess: number;
        }>;
      }
    | undefined;
}) {
  if (!memories) {
    return <EmptyState>Loading memories...</EmptyState>;
  }
  return (
    <Section title={`Memories${memories.name ? `: ${memories.name}` : ''}`}>
      {memories.memories.length === 0 ? (
        <EmptyState>No memories recorded for this character.</EmptyState>
      ) : (
        <div className="divide-y divide-brown-900">
          {memories.memories.map((memory) => (
            <div key={memory.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brown-200">
                <span>{memory.type}</span>
                <span>
                  importance {memory.importance} / {timeLabel(memory.createdAt)}
                </span>
              </div>
              <div className="mt-1 text-sm leading-snug text-white">{memory.description}</div>
              <details className="mt-2 text-xs text-brown-100">
                <summary className="cursor-pointer text-brown-200">Data</summary>
                <pre className="mt-2 max-h-40 overflow-auto bg-brown-900/70 p-2 font-mono text-[11px] leading-snug">
                  {JSON.stringify(memory.data, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function WorldTab({ game, currentTime }: { game: ServerGame; currentTime: number }) {
  const conversations = [...game.world.conversations.values()];
  return (
    <div className="space-y-4">
      <Section title="World">
        <Field label="Current time" value={`${Math.floor(currentTime)}`} />
        <Field label="Players" value={`${game.world.players.size}`} />
        <Field label="Agents" value={`${game.world.agents.size}`} />
        <Field label="Conversations" value={`${game.world.conversations.size}`} />
        <Field label="Map" value={`${game.worldMap.width} x ${game.worldMap.height}`} />
      </Section>

      <Section title="Active Conversations">
        {conversations.length === 0 ? (
          <EmptyState>No active conversations.</EmptyState>
        ) : (
          <div className="divide-y divide-brown-900">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="py-2">
                <div className="text-white">{conversation.id}</div>
                <div className="text-xs text-brown-200">
                  {[...conversation.participants.values()]
                    .map((member) => {
                      const name = game.playerDescriptions.get(member.playerId)?.name ?? member.playerId;
                      return `${name}: ${member.status.kind}`;
                    })
                    .join(' / ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="POI Object Tree">
        <div className="space-y-3">
          {game.worldMap.pois.map((poi) => (
            <div key={poi.id}>
              <div className="text-white">
                {poi.name} <span className="text-xs text-brown-200">({poi.kind})</span>
              </div>
              <ObjectTree objects={poi.subObjects ?? []} />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function RawTab({ context }: { context: InspectorContext | null }) {
  return (
    <Section title="Selected Context JSON">
      <pre className="max-h-[calc(100vh-15rem)] overflow-auto bg-brown-900/70 p-3 font-mono text-[11px] leading-snug text-brown-100">
        {JSON.stringify(context, null, 2)}
      </pre>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-4 border-brown-900 bg-brown-900/30">
      <div className="bg-brown-700 px-3 py-2 font-display text-2xl leading-none text-white">
        {title}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-brown-900 py-2 last:border-b-0">
      <div className="text-xs uppercase text-brown-200">{label}</div>
      <div className="min-w-0 break-words text-sm text-white">{value ?? 'None'}</div>
    </div>
  );
}

function LongText({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="border-b border-brown-900 py-2 last:border-b-0">
      <div className="text-xs uppercase text-brown-200">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-snug text-white">
        {value ?? 'None'}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-3 text-sm text-brown-200">{children}</div>;
}

function AffordanceRow({ affordance }: { affordance: InspectorAffordance }) {
  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-white">
          {affordance.objectName}: {affordance.affordanceName}
        </span>
        <span className="font-mono text-[11px] text-brown-200">{affordance.id}</span>
      </div>
      <div className="mt-1 text-xs text-brown-200">
        {affordance.objectPath.join(' / ')}
      </div>
      {affordance.description && (
        <div className="mt-1 text-sm leading-snug text-brown-100">{affordance.description}</div>
      )}
    </div>
  );
}

function ObjectTree({ objects, depth = 0 }: { objects: PoiSubObject[]; depth?: number }) {
  if (objects.length === 0) {
    return <div className="mt-1 text-xs text-brown-200">No objects.</div>;
  }
  return (
    <div className="mt-1 space-y-1">
      {objects.map((object) => (
        <div key={`${depth}-${object.id}`} style={{ marginLeft: depth * 12 }}>
          <div className="text-sm text-brown-100">
            {object.name}
            {object.affordances.length > 0 && (
              <span className="text-xs text-brown-200">
                {' '}
                ({object.affordances.map((a) => a.name).join(', ')})
              </span>
            )}
          </div>
          {object.subObjects && <ObjectTree objects={object.subObjects} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function pathfindingLabel(pathfinding: InspectorContext['state']['pathfinding']) {
  if (!pathfinding) {
    return null;
  }
  return `${pathfinding.state.kind} to ${positionLabel(pathfinding.destination)}`;
}

function conversationLabel(context: InspectorContext) {
  if (!context.state.conversation) {
    return null;
  }
  return `${context.state.conversation.id}, ${context.state.conversation.participants
    .map((p) => `${p.name}: ${p.status}`)
    .join(' / ')}`;
}

function positionLabel(position: { x: number; y: number }) {
  return `(${round(position.x)}, ${round(position.y)})`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function shortId(id: string) {
  return id.length > 10 ? id.slice(0, 10) : id;
}
