import clsx from 'clsx';
import { DAY_SLICES, currentDaySlice, currentSliceProgress } from '../lib/dayCycle';

export default function TimeOfDayBar({ currentTime }: { currentTime: number }) {
  const current = currentDaySlice(currentTime);
  const sliceProgress = Math.max(0, Math.min(1, currentSliceProgress(currentTime)));

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-[min(30rem,calc(100vw-1.5rem))] -translate-x-1/2 border-4 border-brown-900 bg-brown-800/90 px-3 py-2 text-brown-100 shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="font-display text-2xl leading-none text-white shadow-solid">
          {current.label}
        </div>
        <div className="text-xs uppercase text-brown-200">
          {Math.floor(sliceProgress * 100)}%
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {DAY_SLICES.map((slice) => {
          const active = slice.id === current.id;
          return (
            <div key={slice.id} className="min-w-0">
              <div
                className={clsx(
                  'h-2 border border-brown-900 bg-brown-900/70',
                  active && 'bg-clay-700',
                )}
              >
                {active && (
                  <div
                    className="h-full bg-brown-200"
                    style={{ width: `${sliceProgress * 100}%` }}
                  />
                )}
              </div>
              <div
                className={clsx(
                  'mt-1 truncate text-center text-[10px] uppercase',
                  active ? 'text-white' : 'text-brown-200',
                )}
              >
                {slice.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
