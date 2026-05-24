import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

const TIME_LABELS: Record<string, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function NarrativeGame() {
  const scene = useQuery(api.narrative.api.currentScene, {});
  const startGame = useMutation(api.narrative.api.startGame);
  const submitAction = useMutation(api.narrative.api.submitAction);

  const [freeText, setFreeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript when new entries land.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [scene?.transcript.length]);

  const onStart = async () => {
    setBusy(true);
    try {
      await startGame({});
    } finally {
      setBusy(false);
    }
  };

  const onChoice = async (actionId: string, payload?: unknown) => {
    setBusy(true);
    try {
      await submitAction({ actionId, payload });
    } finally {
      setBusy(false);
    }
  };

  const onFreeText = async () => {
    const text = freeText.trim();
    if (!text) return;
    setBusy(true);
    try {
      await submitAction({ actionId: 'free_text', freeText: text });
      setFreeText('');
    } finally {
      setBusy(false);
    }
  };

  const headerRight = useMemo(() => {
    if (!scene) return null;
    return (
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm text-zinc-400">
        <span>Day {scene.day}</span>
        <span>{TIME_LABELS[scene.timeOfDay] ?? scene.timeOfDay}</span>
        <span>{formatClock(scene.clockMinutes)}</span>
        <span>{scene.coins}G</span>
      </div>
    );
  }, [scene]);

  let content: ReactNode;
  if (scene === undefined) {
    content = (
      <div className="flex h-full items-center justify-center text-zinc-500">Loading...</div>
    );
  } else if (scene === null) {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-8">
        <h1 className="font-display text-3xl">New Dawn Pastures</h1>
        <p className="max-w-xl text-center text-zinc-400">
          A directionless twenty-something from Detroit inherits his late grandfather's farm in a
          place called Willow Creek.
        </p>
        <button
          className="rounded bg-emerald-700 px-6 py-2 text-white shadow hover:bg-emerald-600 disabled:opacity-50"
          onClick={onStart}
          disabled={busy}
        >
          {busy ? 'Starting…' : 'Begin a new game'}
        </button>
      </div>
    );
  } else {
    content = (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-3 pr-28">
          <div className="min-w-0 truncate font-display text-lg">{scene.roomName}</div>
          {headerRight}
        </header>
        {scene.npcsPresent.length > 0 && (
          <div className="border-b border-zinc-900 px-6 py-2 text-xs text-amber-400/80">
            Present: {scene.npcsPresent.join(', ')}
          </div>
        )}
        {scene.progress?.taskbook && <TaskbookObjective taskbook={scene.progress.taskbook} />}

        <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-4 text-zinc-200">
          {scene.transcript.map((entry, i) => (
            <div key={i}>
              {entry.role === 'player' && <p className="text-zinc-500 italic">{entry.text}</p>}
              {entry.role === 'narrator' && <p>{entry.text}</p>}
              {entry.role === 'npc' && (
                <p>
                  <span className="font-semibold text-amber-400">{entry.speaker}: </span>
                  <span>{entry.text}</span>
                </p>
              )}
              {entry.role === 'system' && <p className="text-zinc-500 italic">{entry.text}</p>}
            </div>
          ))}
          {scene.narrating && <p className="animate-pulse text-zinc-500 italic">...</p>}
        </div>

        <div className="space-y-3 border-t border-zinc-800 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            {scene.pendingChoices.map((c, i) => (
              <button
                key={`${c.actionId}-${i}`}
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => onChoice(c.actionId, c.payload)}
                disabled={busy || scene.narrating}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onFreeText();
              }}
              placeholder="Or type something..."
              className="flex-1 rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              disabled={busy || scene.narrating}
            />
            <button
              className="rounded bg-emerald-700 px-3 py-2 text-sm hover:bg-emerald-600 disabled:opacity-50"
              onClick={onFreeText}
              disabled={busy || scene.narrating || !freeText.trim()}
            >
              Send
            </button>
          </div>
          <div className="flex justify-end">
            <button
              className="text-xs text-zinc-500 hover:text-zinc-300"
              onClick={onStart}
              disabled={busy}
            >
              Restart from the beginning
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-black">
      <div className="relative min-w-0 flex-1 transition-[width] duration-200">
        {content}
        <button
          className={clsx(
            'absolute right-4 top-4 z-30 border border-zinc-700 bg-black px-3 py-2 text-xs uppercase tracking-[0.08em] text-zinc-300 shadow-lg transition-colors hover:border-emerald-500 hover:text-white',
            drawerOpen && 'border-emerald-600 text-white',
          )}
          onClick={() => setDrawerOpen((open) => !open)}
          title="Open narrator tools, model, history, and game state."
        >
          {drawerOpen ? 'Close' : 'Inspect'}
        </button>
      </div>
      <NarrativeDebugDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

type DebugTab = 'tools' | 'history' | 'state';

type ToolCallDebug = {
  tool: string;
  args: unknown;
  output?: unknown;
  at: number;
  ok: boolean;
  error?: string;
};

type OperationDebug = {
  id: string;
  turn: number;
  status: string;
  created: number;
  completed: number | null;
  error: string | null;
  model: string | null;
  context: {
    reason: string | null;
    actionId: string | null;
    freeText: string | null;
    beatId: string | null;
    briefing: string | null;
    roomName: string | null;
    location: string | null;
  };
  toolCalls: ToolCallDebug[];
};

type NarrativeProgress = {
  taskbook: {
    status: string;
    objective: string;
    detail: string;
  };
  currentBeat: {
    id: string;
    title: string;
    status: string;
    objective: string;
  } | null;
  nextLead: {
    beatId: string;
    title: string;
    ready: boolean;
    summary: string;
    detail: string;
    requirements: string[];
  } | null;
  invariants: Array<{
    level: 'warning' | 'error';
    message: string;
  }>;
};

function NarrativeDebugDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const debug = useQuery(api.narrative.api.debugPanel, { limit: 16 });
  const [activeTab, setActiveTab] = useState<DebugTab>('tools');
  const operations = (debug?.operations ?? []) as OperationDebug[];
  const currentOperation = (debug?.currentOperation as OperationDebug | null | undefined) ?? null;
  const latestOperation = currentOperation ?? operations[0] ?? null;
  const activeCalls = latestOperation?.toolCalls ?? [];
  const model = debug?.model ?? latestOperation?.model ?? 'Waiting for runner';
  const progress = (debug?.progress as NarrativeProgress | undefined) ?? null;

  return (
    <aside
      className={clsx(
        'relative z-20 h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-200',
        open ? 'w-[min(34rem,45vw)]' : 'w-0',
      )}
      aria-hidden={!open}
    >
      <div
        className={clsx(
          'flex h-full w-[min(34rem,45vw)] flex-col border-l border-emerald-900/70 bg-zinc-950/98 text-zinc-200 shadow-2xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="border-b border-zinc-800 px-5 py-4 pr-24">
          <div className="text-xs uppercase tracking-[0.08em] text-emerald-500">
            Narrator Inspector
          </div>
          <div className="mt-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-xs">
            <span className="text-zinc-500">Model</span>
            <span className="truncate text-zinc-100">{model}</span>
            <span className="text-zinc-500">Slot</span>
            <span className="text-zinc-300">{debug?.slot ?? 'default'}</span>
            <span className="text-zinc-500">Turn</span>
            <span className="text-zinc-300">{debug?.gameState?.turn ?? '-'}</span>
          </div>
          {progress && <BeatProgressPanel progress={progress} />}
        </div>

        <div className="grid grid-cols-3 border-b border-zinc-800 text-xs">
          {[
            ['tools', 'Tool Calls'],
            ['history', 'History'],
            ['state', 'Game State'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={clsx(
                'border-r border-zinc-800 px-3 py-3 text-zinc-500 last:border-r-0 hover:bg-zinc-900 hover:text-zinc-200',
                activeTab === id && 'bg-zinc-900 text-emerald-400',
              )}
              onClick={() => setActiveTab(id as DebugTab)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {debug === undefined && <EmptyInspector>Loading inspector...</EmptyInspector>}
          {debug === null && <EmptyInspector>No narrative save has been started.</EmptyInspector>}
          {debug && activeTab === 'tools' && (
            <ToolCallsTab operation={latestOperation} calls={activeCalls} />
          )}
          {debug && activeTab === 'history' && <HistoryTab operations={operations} />}
          {debug && activeTab === 'state' && <GameStateTab state={debug.gameState} />}
        </div>

        <button
          className="absolute right-4 top-4 border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </aside>
  );
}

function TaskbookObjective({ taskbook }: { taskbook: NarrativeProgress['taskbook'] }) {
  return (
    <div className="border-b border-zinc-900 bg-emerald-950/20 px-6 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="uppercase tracking-[0.08em] text-emerald-500">Taskbook</span>
        <span className="text-zinc-200">{taskbook.objective}</span>
      </div>
      {taskbook.detail && <div className="mt-1 text-zinc-500">{taskbook.detail}</div>}
    </div>
  );
}

function BeatProgressPanel({ progress }: { progress: NarrativeProgress }) {
  return (
    <div className="mt-4 space-y-3 border border-zinc-800 bg-black/35 p-3 text-xs">
      <div>
        <div className="uppercase tracking-[0.08em] text-zinc-600">Current Beat</div>
        {progress.currentBeat ? (
          <>
            <div className="mt-1 text-zinc-100">{progress.currentBeat.title}</div>
            <div className="mt-1 text-zinc-500">{progress.currentBeat.objective}</div>
          </>
        ) : (
          <div className="mt-1 text-zinc-500">No beat is active.</div>
        )}
      </div>
      <div>
        <div className="uppercase tracking-[0.08em] text-zinc-600">Next Lead</div>
        {progress.nextLead ? (
          <>
            <div className="mt-1 text-emerald-400">{progress.nextLead.summary}</div>
            <div className="mt-1 text-zinc-500">{progress.nextLead.detail}</div>
            {progress.nextLead.requirements.length > 0 && (
              <div className="mt-2 space-y-1">
                {progress.nextLead.requirements.map((requirement) => (
                  <div key={requirement} className="text-zinc-400">
                    {requirement}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-1 text-zinc-500">No next lead available.</div>
        )}
      </div>
      {progress.invariants.length > 0 && (
        <div>
          <div className="uppercase tracking-[0.08em] text-zinc-600">State Checks</div>
          <div className="mt-2 space-y-1">
            {progress.invariants.map((invariant) => (
              <div
                key={`${invariant.level}-${invariant.message}`}
                className={clsx(
                  'border px-2 py-1',
                  invariant.level === 'error'
                    ? 'border-red-900 text-red-300'
                    : 'border-amber-900 text-amber-300',
                )}
              >
                {invariant.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallsTab({
  operation,
  calls,
}: {
  operation: OperationDebug | null;
  calls: ToolCallDebug[];
}) {
  if (!operation) {
    return <EmptyInspector>No narrator operation has run yet.</EmptyInspector>;
  }
  return (
    <div className="space-y-4">
      <OperationHeader operation={operation} />
      {calls.length === 0 ? (
        <EmptyInspector>No tool calls recorded for this operation yet.</EmptyInspector>
      ) : (
        <div className="space-y-3">
          {calls.map((call, index) => (
            <ToolCallBlock key={`${call.tool}-${call.at}-${index}`} call={call} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ operations }: { operations: OperationDebug[] }) {
  if (operations.length === 0) {
    return <EmptyInspector>No narrator history yet.</EmptyInspector>;
  }
  return (
    <div className="space-y-3">
      {operations.map((operation) => (
        <div key={operation.id} className="border border-zinc-800 bg-black/50 p-3">
          <OperationHeader operation={operation} compact />
          {operation.context.briefing && (
            <p className="mt-2 line-clamp-3 text-xs text-zinc-500">{operation.context.briefing}</p>
          )}
          <div className="mt-3 space-y-2">
            {operation.toolCalls.length === 0 ? (
              <div className="text-xs text-zinc-600">No tool calls captured.</div>
            ) : (
              operation.toolCalls.map((call, index) => (
                <div
                  key={`${operation.id}-${call.at}-${index}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-6 text-zinc-600">#{index + 1}</span>
                  <span className="text-emerald-400">{call.tool}</span>
                  <span className="ml-auto text-zinc-600">{timeLabel(call.at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function GameStateTab({ state }: { state: unknown }) {
  const gameState = state as {
    day?: number;
    timeOfDay?: string;
    clockMinutes?: number;
    roomName?: string;
    location?: string;
    coins?: number;
    turn?: number;
    narrating?: boolean;
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <StateMetric label="Room" value={gameState.roomName ?? gameState.location ?? '-'} />
        <StateMetric label="Turn" value={gameState.turn ?? '-'} />
        <StateMetric label="Day" value={gameState.day ?? '-'} />
        <StateMetric label="Clock" value={formatClock(gameState.clockMinutes ?? 0)} />
        <StateMetric label="Time" value={gameState.timeOfDay ?? '-'} />
        <StateMetric label="Coins" value={`${gameState.coins ?? 0}G`} />
        <StateMetric label="Narrating" value={gameState.narrating ? 'yes' : 'no'} />
      </div>
      <pre className="max-h-[55vh] overflow-auto border border-zinc-800 bg-black/60 p-3 text-[11px] leading-relaxed text-zinc-400">
        {prettyJson(state)}
      </pre>
    </div>
  );
}

function OperationHeader({
  operation,
  compact = false,
}: {
  operation: OperationDebug;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx('flex items-start justify-between gap-3', compact ? 'text-xs' : 'text-sm')}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-100">Turn {operation.turn}</span>
          <StatusBadge status={operation.status} />
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">
          {operation.context.reason ?? 'operation'} /{' '}
          {operation.context.roomName ?? operation.context.location ?? 'unknown room'}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-zinc-600">
        <div>{timeLabel(operation.created)}</div>
        <div>{operation.toolCalls.length} calls</div>
      </div>
    </div>
  );
}

function ToolCallBlock({ call, index }: { call: ToolCallDebug; index: number }) {
  return (
    <div
      className={clsx('border bg-black/50 p-3', call.ok ? 'border-zinc-800' : 'border-red-900/80')}
    >
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-600">#{index + 1}</span>
        <span className={call.ok ? 'text-emerald-400' : 'text-red-300'}>{call.tool}</span>
        {!call.ok && (
          <span className="border border-red-900 px-1.5 py-0.5 text-[10px] text-red-300">
            failed
          </span>
        )}
        <span className="ml-auto text-zinc-600">{timeLabel(call.at)}</span>
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-[0.08em] text-zinc-600">Input</div>
      <pre className="mt-3 max-h-48 overflow-auto bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400">
        {prettyJson(call.args)}
      </pre>
      <div className="mt-3 text-[10px] uppercase tracking-[0.08em] text-zinc-600">Output</div>
      <pre className="mt-3 max-h-48 overflow-auto bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400">
        {call.output ? prettyJson(call.output) : 'Output was not recorded for this older call.'}
      </pre>
      {call.error && <div className="mt-2 text-xs text-red-400">Error: {call.error}</div>}
    </div>
  );
}

function StateMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-zinc-800 bg-black/50 p-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-600">{label}</div>
      <div className="mt-1 truncate text-zinc-200">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={clsx(
        'border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]',
        status === 'done' && 'border-emerald-900 text-emerald-500',
        status === 'inProgress' && 'border-amber-900 text-amber-400',
        status === 'queued' && 'border-sky-900 text-sky-400',
        status === 'failed' && 'border-red-900 text-red-400',
      )}
    >
      {status}
    </span>
  );
}

function EmptyInspector({ children }: { children: ReactNode }) {
  return (
    <div className="border border-zinc-800 bg-black/40 p-4 text-sm text-zinc-500">{children}</div>
  );
}

function timeLabel(value: number | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? 'null';
  } catch {
    return String(value);
  }
}
