import {
  GAME_DAY_MS,
  SCHEDULE_BLOCKS,
  gameTimeOfDay,
  type ScheduleBlock,
} from '../../convex/constants';

export type DayLighting = {
  color: number;
  alpha: number;
};

export type DaySlice = {
  id: ScheduleBlock;
  label: string;
  index: number;
  startMs: number;
  endMs: number;
  lighting: DayLighting;
};

const labels: Record<ScheduleBlock, string> = {
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const lighting: Record<ScheduleBlock, DayLighting> = {
  morning: { color: 0xffc19a, alpha: 0.1 },
  midday: { color: 0xffffff, alpha: 0 },
  afternoon: { color: 0xf2b84b, alpha: 0.12 },
  evening: { color: 0x6b4b7a, alpha: 0.28 },
  night: { color: 0x071533, alpha: 0.46 },
};

export const DAY_SLICES: DaySlice[] = SCHEDULE_BLOCKS.map((block, index) => {
  const sliceMs = GAME_DAY_MS / SCHEDULE_BLOCKS.length;
  return {
    id: block,
    label: labels[block],
    index,
    startMs: index * sliceMs,
    endMs: (index + 1) * sliceMs,
    lighting: lighting[block],
  };
});

export function dayOffset(now: number) {
  return ((now % GAME_DAY_MS) + GAME_DAY_MS) % GAME_DAY_MS;
}

export function dayProgress(now: number) {
  return dayOffset(now) / GAME_DAY_MS;
}

export function currentDaySlice(now: number) {
  const block = gameTimeOfDay(now);
  return DAY_SLICES.find((slice) => slice.id === block)!;
}

export function currentSliceProgress(now: number) {
  const offset = dayOffset(now);
  const slice = currentDaySlice(now);
  return (offset - slice.startMs) / (slice.endMs - slice.startMs);
}

export function lightingForTime(now: number): DayLighting {
  return currentDaySlice(now).lighting;
}
