import { describe, expect, it } from 'vitest';
import type { PageSegment } from './pdfPageGeometry';
import {
  clusterLinePositions,
  createAxisMapper,
  registerGridAxis,
} from './priorityGridRegistration';

const vertical = (x: number, y0: number, y1: number): PageSegment =>
  ({ x0: x, y0, x1: x, y1, lineWidth: 0.1 });
const horizontal = (y: number, x0: number, x1: number): PageSegment =>
  ({ x0, y0: y, x1, y1: y, lineWidth: 0.1 });

const dashed = (x: number, from: number, to: number): PageSegment[] => {
  const segments: PageSegment[] = [];
  for (let y = from; y < to; y += 20) segments.push(vertical(x, y, y + 12));
  return segments;
};

describe('clusterLinePositions', () => {
  it('merges the dashes of one dash-dot grid line into one position', () => {
    expect(clusterLinePositions(dashed(100, 0, 500), 'vertical', 300)).toEqual([100]);
  });

  it('merges a CAD double line drawn 0.7 pt apart', () => {
    const [position] = clusterLinePositions(
      [...dashed(100, 0, 500), ...dashed(100.7, 0, 500)],
      'vertical',
      300,
    );
    expect(position).toBeCloseTo(100.35, 1);
  });

  it('drops lines shorter than the minimum extent and ignores other orientations', () => {
    const segments = [...dashed(100, 0, 500), vertical(200, 0, 40), horizontal(50, 0, 600)];
    expect(clusterLinePositions(segments, 'vertical', 300)).toEqual([100]);
    expect(clusterLinePositions(segments, 'horizontal', 300)).toEqual([50]);
  });

  it('keeps two grid lines that are close but distinct', () => {
    const positions = clusterLinePositions(
      [...dashed(519.5, 0, 500), ...dashed(537.7, 0, 500)],
      'vertical',
      300,
    );
    expect(positions).toEqual([519.5, 537.7]);
  });
});

describe('registerGridAxis', () => {
  it('fits plan lines onto certified candidates by order and spacing, skipping extra lines', () => {
    const plan = [0, 10, 30, 60];
    const truth = plan.map((value) => 100 + value * 2);
    const candidates = [50, ...truth, 140, 300].sort((a, b) => a - b);
    expect(registerGridAxis(plan, candidates)).toEqual({ positions: truth, scale: 2 });
  });

  it('tolerates small drafting offsets between the two drawings', () => {
    const plan = [209.4, 237.9, 288.2, 322.4, 348.3, 411.8, 497.9, 571.1, 641.9];
    const certified = [322.6, 361.8, 431.2, 477.8, 514.3, 602.4, 720.5, 821.2, 919.0];
    expect(registerGridAxis(plan, [287.3, 292, ...certified])?.positions).toEqual(certified);
  });

  it('returns null when a plan line has no candidate that fits the spacing', () => {
    expect(registerGridAxis([0, 10, 30, 60], [100, 120, 220])).toBeNull();
  });

  it('uses the expected scale to pick among fits an axis of two lines cannot tell apart', () => {
    expect(registerGridAxis([100, 200], [110, 310, 700])?.positions).toEqual([110, 310]);
    expect(registerGridAxis([100, 200], [110, 310, 700], 3.9)?.positions).toEqual([310, 700]);
    expect(registerGridAxis([100, 200], [110, 310, 700], 1)).toBeNull();
  });

  it('returns null when there are fewer than two plan lines', () => {
    expect(registerGridAxis([5], [1, 2, 3])).toBeNull();
  });
});

describe('createAxisMapper', () => {
  it('interpolates between knots and extrapolates past both ends', () => {
    const map = createAxisMapper([100, 200, 400], [10, 20, 30]);
    expect(map(150)).toBeCloseTo(15);
    expect(map(300)).toBeCloseTo(25);
    expect(map(50)).toBeCloseTo(5);
    expect(map(500)).toBeCloseTo(35);
  });
});
