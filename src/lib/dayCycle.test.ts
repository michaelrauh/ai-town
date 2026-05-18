import { GAME_DAY_MS } from '../../convex/constants';
import {
  DAY_SLICES,
  currentDaySlice,
  currentSliceProgress,
  dayProgress,
  lightingForTime,
} from './dayCycle';

describe('day cycle helpers', () => {
  test('maps timestamps to the five schedule blocks', () => {
    const sliceMs = GAME_DAY_MS / DAY_SLICES.length;

    expect(currentDaySlice(0).id).toBe('morning');
    expect(currentDaySlice(sliceMs).id).toBe('midday');
    expect(currentDaySlice(sliceMs * 2).id).toBe('afternoon');
    expect(currentDaySlice(sliceMs * 3).id).toBe('evening');
    expect(currentDaySlice(sliceMs * 4).id).toBe('night');
    expect(currentDaySlice(GAME_DAY_MS).id).toBe('morning');
  });

  test('reports day and slice progress at boundaries', () => {
    const sliceMs = GAME_DAY_MS / DAY_SLICES.length;

    expect(dayProgress(0)).toBe(0);
    expect(dayProgress(GAME_DAY_MS / 2)).toBe(0.5);
    expect(currentSliceProgress(sliceMs)).toBe(0);
    expect(currentSliceProgress(sliceMs + sliceMs / 2)).toBe(0.5);
  });

  test('returns hard-slice lighting config', () => {
    const sliceMs = GAME_DAY_MS / DAY_SLICES.length;

    expect(lightingForTime(0)).toEqual({ color: 0xffc19a, alpha: 0.1 });
    expect(lightingForTime(sliceMs)).toEqual({ color: 0xffffff, alpha: 0 });
    expect(lightingForTime(sliceMs * 4)).toEqual({ color: 0x071533, alpha: 0.46 });
  });
});
