import { GAME_DAY_MS } from '../../convex/constants';
import {
  DAY_SLICES,
  currentDaySlice,
  currentSliceProgress,
  dayProgress,
  lightingForTime,
  applyCurseTint,
} from './dayCycle';

function sliceByBlock(id: (typeof DAY_SLICES)[number]['id']) {
  const slice = DAY_SLICES.find((s) => s.id === id);
  if (!slice) throw new Error(`No slice for block ${id}`);
  return slice;
}

describe('day cycle helpers', () => {
  test('maps timestamps to the five schedule blocks', () => {
    expect(currentDaySlice(0).id).toBe('morning');
    for (const block of ['morning', 'midday', 'afternoon', 'evening', 'night'] as const) {
      const slice = sliceByBlock(block);
      const middle = slice.startMs + (slice.endMs - slice.startMs) / 2;
      expect(currentDaySlice(middle).id).toBe(block);
    }
    expect(currentDaySlice(GAME_DAY_MS).id).toBe('morning');
  });

  test('reports day and slice progress at boundaries', () => {
    expect(dayProgress(0)).toBe(0);
    expect(dayProgress(GAME_DAY_MS / 2)).toBe(0.5);

    const midday = sliceByBlock('midday');
    expect(currentSliceProgress(midday.startMs + 1)).toBeCloseTo(
      1 / (midday.endMs - midday.startMs),
      5,
    );
    const half = midday.startMs + (midday.endMs - midday.startMs) / 2;
    expect(currentSliceProgress(half)).toBeCloseTo(0.5, 5);
  });

  test('returns hard-slice lighting config', () => {
    expect(lightingForTime(sliceByBlock('morning').startMs)).toEqual({
      color: 0xffc19a,
      alpha: 0.1,
    });
    expect(lightingForTime(sliceByBlock('midday').startMs)).toEqual({
      color: 0xffffff,
      alpha: 0,
    });
    expect(lightingForTime(sliceByBlock('night').startMs)).toEqual({
      color: 0x071533,
      alpha: 0.46,
    });
  });

  test('evening block is shorter than midday block (fast sunset)', () => {
    const midday = sliceByBlock('midday');
    const evening = sliceByBlock('evening');
    const middayMs = midday.endMs - midday.startMs;
    const eveningMs = evening.endMs - evening.startMs;
    expect(eveningMs).toBeLessThan(middayMs);
  });

  test('applyCurseTint raises alpha when curse is active', () => {
    const base = lightingForTime(sliceByBlock('midday').startMs);
    const tinted = applyCurseTint(base, { active: true, intensity: 0.5 });
    expect(tinted.alpha).toBeGreaterThan(base.alpha);
  });

  test('applyCurseTint is a no-op when curse is inactive', () => {
    const base = lightingForTime(sliceByBlock('midday').startMs);
    expect(applyCurseTint(base, { active: false })).toEqual(base);
    expect(applyCurseTint(base, null)).toEqual(base);
  });
});
