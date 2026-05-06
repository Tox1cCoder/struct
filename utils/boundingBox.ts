import { BoundingBox } from '../types';

const isFinite01000 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000;

export function parseBoundingBox(input: unknown): BoundingBox | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const ymin = Number(raw.ymin);
  const xmin = Number(raw.xmin);
  const ymax = Number(raw.ymax);
  const xmax = Number(raw.xmax);

  if (!isFinite01000(ymin) || !isFinite01000(xmin) || !isFinite01000(ymax) || !isFinite01000(xmax)) {
    return undefined;
  }
  if (xmin >= xmax || ymin >= ymax) {
    return undefined;
  }
  return { ymin, xmin, ymax, xmax };
}

export function parsePage(input: unknown): number | undefined {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function bboxToPixelRect(
  bbox: BoundingBox,
  containerWidth: number,
  containerHeight: number,
): PixelRect {
  const left = (bbox.xmin / 1000) * containerWidth;
  const top = (bbox.ymin / 1000) * containerHeight;
  const right = (bbox.xmax / 1000) * containerWidth;
  const bottom = (bbox.ymax / 1000) * containerHeight;
  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
