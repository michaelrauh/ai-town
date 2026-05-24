import { useEffect, useMemo, useRef, useState } from 'react';
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
      <div className="text-sm text-zinc-400 flex gap-4">
        <span>Day {scene.day}</span>
        <span>{TIME_LABELS[scene.timeOfDay] ?? scene.timeOfDay}</span>
        <span>{formatClock(scene.clockMinutes)}</span>
        <span>{scene.coins}G</span>
      </div>
    );
  }, [scene]);

  if (scene === undefined) {
    return <div className="flex h-full items-center justify-center text-zinc-500">Loading…</div>;
  }

  if (scene === null) {
    return (
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
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="font-display text-lg">{scene.roomName}</div>
        {headerRight}
      </header>
      {scene.npcsPresent.length > 0 && (
        <div className="px-6 py-2 text-xs text-amber-400/80 border-b border-zinc-900">
          Present: {scene.npcsPresent.join(', ')}
        </div>
      )}

      <div
        ref={logRef}
        className="flex-1 space-y-3 overflow-y-auto px-6 py-4 text-zinc-200"
      >
        {scene.transcript.map((entry, i) => (
          <div key={i}>
            {entry.role === 'player' && (
              <p className="text-zinc-500 italic">{entry.text}</p>
            )}
            {entry.role === 'narrator' && <p>{entry.text}</p>}
            {entry.role === 'npc' && (
              <p>
                <span className="text-amber-400 font-semibold">{entry.speaker}: </span>
                <span>{entry.text}</span>
              </p>
            )}
            {entry.role === 'system' && (
              <p className="text-zinc-500 italic">{entry.text}</p>
            )}
          </div>
        ))}
        {scene.narrating && (
          <p className="text-zinc-500 italic animate-pulse">…</p>
        )}
      </div>

      <div className="border-t border-zinc-800 px-6 py-4 space-y-3">
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
            placeholder="Or type something…"
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
