import { describe, expect, it } from 'vitest';
import { bboxToPixelRect, parseBoundingBox, parsePage } from './boundingBox';

describe('parseBoundingBox', () => {
  it('accepts a valid bbox', () => {
    expect(parseBoundingBox({ ymin: 100, xmin: 200, ymax: 300, xmax: 400 })).toEqual({
      ymin: 100,
      xmin: 200,
      ymax: 300,
      xmax: 400,
    });
  });

  it('accepts boundary values 0 and 1000', () => {
    expect(parseBoundingBox({ ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 })).toEqual({
      ymin: 0,
      xmin: 0,
      ymax: 1000,
      xmax: 1000,
    });
  });

  it('coerces numeric strings', () => {
    expect(parseBoundingBox({ ymin: '10', xmin: '20', ymax: '30', xmax: '40' })).toEqual({
      ymin: 10,
      xmin: 20,
      ymax: 30,
      xmax: 40,
    });
  });

  it('rejects swapped min/max', () => {
    expect(parseBoundingBox({ ymin: 300, xmin: 200, ymax: 100, xmax: 400 })).toBeUndefined();
    expect(parseBoundingBox({ ymin: 100, xmin: 400, ymax: 300, xmax: 200 })).toBeUndefined();
  });

  it('rejects equal values (zero-area box)', () => {
    expect(parseBoundingBox({ ymin: 100, xmin: 200, ymax: 100, xmax: 400 })).toBeUndefined();
  });

  it('rejects out-of-range values', () => {
    expect(parseBoundingBox({ ymin: -1, xmin: 200, ymax: 300, xmax: 400 })).toBeUndefined();
    expect(parseBoundingBox({ ymin: 100, xmin: 200, ymax: 300, xmax: 1001 })).toBeUndefined();
  });

  it('rejects NaN', () => {
    expect(parseBoundingBox({ ymin: NaN, xmin: 200, ymax: 300, xmax: 400 })).toBeUndefined();
  });

  it('rejects null/undefined/non-object', () => {
    expect(parseBoundingBox(null)).toBeUndefined();
    expect(parseBoundingBox(undefined)).toBeUndefined();
    expect(parseBoundingBox('not an object')).toBeUndefined();
    expect(parseBoundingBox(42)).toBeUndefined();
  });

  it('rejects missing fields', () => {
    expect(parseBoundingBox({ ymin: 100, xmin: 200, ymax: 300 })).toBeUndefined();
    expect(parseBoundingBox({})).toBeUndefined();
  });
});

describe('parsePage', () => {
  it('accepts positive integers', () => {
    expect(parsePage(1)).toBe(1);
    expect(parsePage(42)).toBe(42);
  });

  it('floors floats', () => {
    expect(parsePage(2.7)).toBe(2);
  });

  it('coerces numeric strings', () => {
    expect(parsePage('3')).toBe(3);
  });

  it('rejects 0 and negative', () => {
    expect(parsePage(0)).toBeUndefined();
    expect(parsePage(-1)).toBeUndefined();
  });

  it('rejects non-numeric', () => {
    expect(parsePage('abc')).toBeUndefined();
    expect(parsePage(null)).toBeUndefined();
    expect(parsePage(undefined)).toBeUndefined();
  });
});

describe('bboxToPixelRect', () => {
  it('converts normalized bbox to pixel rect', () => {
    const bbox = { ymin: 100, xmin: 200, ymax: 300, xmax: 400 };
    const rect = bboxToPixelRect(bbox, 1000, 1000);
    expect(rect).toEqual({ left: 200, top: 100, width: 200, height: 200 });
  });

  it('scales with container size', () => {
    const bbox = { ymin: 0, xmin: 0, ymax: 500, xmax: 500 };
    const rect = bboxToPixelRect(bbox, 800, 600);
    expect(rect).toEqual({ left: 0, top: 0, width: 400, height: 300 });
  });
});
