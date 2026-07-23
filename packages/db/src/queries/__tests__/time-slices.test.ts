import { describe, test, expect } from 'bun:test';
import { buildTimeSlice, generateTimeSlices } from '../time-slices';

describe('buildTimeSlice', () => {
  test('generates correct key and label', () => {
    const slice = buildTimeSlice(1900, 1950);
    expect(slice.key).toBe('1900_1950');
    expect(slice.label).toBe('1900-1950');
  });

  test('computes duration', () => {
    const slice = buildTimeSlice(1900, 1950);
    expect(slice.durationYears).toBe(50);
  });

  test('sets correct time range', () => {
    const slice = buildTimeSlice(1900, 1950);
    expect(slice.timeRange.start).toBe('1900-01-01');
    expect(slice.timeRange.end).toBe('1950-12-31');
  });

  test('handles uneven durations', () => {
    const slice = buildTimeSlice(2000, 2025);
    expect(slice.durationYears).toBe(25);
    expect(slice.key).toBe('2000_2025');
  });
});

describe('generateTimeSlices', () => {
  test('anchors to round boundaries with 50-year bins', () => {
    const slices = generateTimeSlices(1542, 2019, 50);
    expect(slices[0].startYear).toBe(1500);
    expect(slices[slices.length - 1].endYear).toBe(2050);
  });

  test('anchors to round boundaries with 25-year bins', () => {
    const slices = generateTimeSlices(1542, 2019, 25);
    expect(slices[0].startYear).toBe(1525);
    expect(slices[slices.length - 1].endYear).toBe(2025);
  });

  test('anchors to round boundaries with 100-year bins', () => {
    const slices = generateTimeSlices(1542, 2019, 100);
    expect(slices[0].startYear).toBe(1500);
    expect(slices[slices.length - 1].endYear).toBe(2100);
  });

  test('covers exact boundaries', () => {
    const slices = generateTimeSlices(1500, 2000, 50);
    expect(slices[0].startYear).toBe(1500);
    expect(slices[slices.length - 1].endYear).toBe(2050);
  });

  test('generates correct number of bins', () => {
    const slices = generateTimeSlices(1900, 1999, 50);
    // 1900–1950, 1950–2000
    expect(slices.length).toBe(2);
  });

  test('single bin when range fits in one', () => {
    const slices = generateTimeSlices(1920, 1940, 50);
    expect(slices.length).toBe(1);
    expect(slices[0].key).toBe('1900_1950');
  });

  test('bins are contiguous (no gaps)', () => {
    const slices = generateTimeSlices(1500, 2000, 50);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startYear).toBe(slices[i - 1].endYear);
    }
  });

  test('all bins have same duration', () => {
    const slices = generateTimeSlices(1500, 2000, 50);
    for (const slice of slices) {
      expect(slice.durationYears).toBe(50);
    }
  });

  test('10-year bins for fine granularity', () => {
    const slices = generateTimeSlices(1895, 1920, 10);
    expect(slices[0].startYear).toBe(1890);
    expect(slices[slices.length - 1].endYear).toBe(1930);
    expect(slices.length).toBe(4);
  });
});
