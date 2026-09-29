import type { PageSegment } from './pdfPageGeometry';

const AXIS_TOLERANCE = 0.05;
const CLUSTER_WIDTH = 1.5;
/** Drawn length a line needs, as a share of the minimum extent (dash-dot lines leave gaps). */
const MIN_DRAWN_SHARE = 0.5;

interface LinePiece {
  position: number;
  from: number;
  to: number;
}

const toPiece = (
  segment: PageSegment,
  orientation: 'vertical' | 'horizontal',
): LinePiece | null => {
  const vertical = orientation === 'vertical';
  const across = vertical ? segment.x1 - segment.x0 : segment.y1 - segment.y0;
  const along = vertical ? [segment.y0, segment.y1] : [segment.x0, segment.x1];
  if (Math.abs(across) >= AXIS_TOLERANCE || along[0] === along[1]) return null;
  return {
    position: vertical ? segment.x0 : segment.y0,
    from: Math.min(...along),
    to: Math.max(...along),
  };
};

const summarize = (cluster: LinePiece[]) => {
  const length = cluster.reduce((sum, piece) => sum + piece.to - piece.from, 0);
  const weighted = cluster.reduce(
    (sum, piece) => sum + piece.position * (piece.to - piece.from),
    0,
  );
  const extent =
    Math.max(...cluster.map((piece) => piece.to)) - Math.min(...cluster.map((piece) => piece.from));
  return { position: weighted / length, extent, length };
};

interface LineSummary {
  position: number;
  length: number;
}

/** Surviving lines closer than one cluster width are halves of one CAD double line. */
const mergeNearby = (lines: LineSummary[]): LineSummary[] =>
  lines.reduce<LineSummary[]>((merged, line) => {
    const previous = merged[merged.length - 1];
    if (!previous || line.position - previous.position > CLUSTER_WIDTH) return [...merged, line];
    const length = previous.length + line.length;
    const position = (previous.position * previous.length + line.position * line.length) / length;
    return [...merged.slice(0, -1), { position, length }];
  }, []);

/**
 * Positions of long straight lines in one orientation. Dashes of one line and CAD
 * double lines collapse into a single position. A line must span `minExtent` and be
 * drawn for at least half of it; short strokes that only happen to line up down the
 * page (marker box edges, glyphs) would otherwise pass as lines and crowd the
 * candidates until any grid fit finds a match.
 */
export const clusterLinePositions = (
  segments: PageSegment[],
  orientation: 'vertical' | 'horizontal',
  minExtent: number,
): number[] => {
  const pieces = segments
    .map((segment) => toPiece(segment, orientation))
    .filter((piece): piece is LinePiece => piece !== null)
    .sort((left, right) => left.position - right.position);

  const clusters: LinePiece[][] = [];
  for (const piece of pieces) {
    const current = clusters[clusters.length - 1];
    if (current && piece.position - current[0].position <= CLUSTER_WIDTH) current.push(piece);
    else clusters.push([piece]);
  }

  const lines = clusters
    .map(summarize)
    .filter((cluster) =>
      cluster.extent >= minExtent && cluster.length >= minExtent * MIN_DRAWN_SHARE);
  return mergeNearby(lines).map((line) => Math.round(line.position * 100) / 100);
};

const nearestIndex = (sorted: number[], value: number) => {
  let best = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    if (Math.abs(sorted[index] - value) < Math.abs(sorted[best] - value)) best = index;
  }
  return best;
};

export interface AxisFit {
  /** Certified position of each plan grid line, in plan order. */
  positions: number[];
  /** Certified points per plan point. */
  scale: number;
  /** Root-mean-square residual in plan points, so fits at different scales compare fairly. */
  rms: number;
}

/** Match every plan line under one linear fit, or null when any line has no candidate. */
const fitAll = (
  plan: number[],
  candidates: number[],
  scale: number,
  offset: number,
): AxisFit | null => {
  const span = scale * (plan[plan.length - 1] - plan[0]);
  const tolerance = Math.max(1.5, span * 0.006);
  const positions: number[] = [];
  let squares = 0;
  for (const value of plan) {
    const predicted = scale * value + offset;
    const candidate = candidates[nearestIndex(candidates, predicted)];
    const residual = Math.abs(candidate - predicted);
    if (residual > tolerance || positions.includes(candidate)) return null;
    positions.push(candidate);
    squares += (residual / scale) ** 2;
  }
  return { positions, scale, rms: Math.sqrt(squares / plan.length) };
};

const samePositions = (left: number[], right: number[]) =>
  left.every((value, index) => value === right[index]);

/**
 * Every way the plan grid lines can land on certified candidates, best first. The
 * two drawings share one grid at different scale and offset, so a fit is kept only
 * when every plan line lands on a candidate; extra candidates (dimension lines,
 * borders, ruled tables) are skipped. Labels are never compared. Choosing between
 * fits needs both axes and the markers, so that is left to the caller.
 */
/** Keep one fit per set of positions: the one with the smaller error. */
const keepBest = (fits: AxisFit[], fit: AxisFit) => {
  const known = fits.findIndex((other) => samePositions(other.positions, fit.positions));
  if (known === -1) fits.push(fit);
  else if (fit.rms < fits[known].rms) fits[known] = fit;
};

export const fitGridAxis = (planPositions: number[], candidates: number[]): AxisFit[] => {
  const plan = [...planPositions].sort((left, right) => left - right);
  const sorted = [...candidates].sort((left, right) => left - right);
  const planSpan = plan[plan.length - 1] - plan[0];
  if (plan.length < 2 || planSpan <= 0 || sorted.length < plan.length) return [];

  const fits: AxisFit[] = [];
  sorted.forEach((start, first) => {
    for (const end of sorted.slice(first + 1)) {
      const scale = (end - start) / planSpan;
      const fit = fitAll(plan, sorted, scale, start - scale * plan[0]);
      if (fit) keepBest(fits, fit);
    }
  });
  return fits.sort((left, right) => left.rms - right.rms);
};

/** Piecewise-linear map through matching knots, extrapolated past both ends. */
export const createAxisMapper = (from: number[], to: number[]) => {
  const knots = from
    .map((value, index) => ({ from: value, to: to[index] }))
    .sort((left, right) => left.from - right.from);
  return (value: number) => {
    let upper = knots.findIndex((knot) => knot.from >= value);
    if (upper <= 0) upper = upper === 0 ? 1 : knots.length - 1;
    const lower = knots[upper - 1];
    const next = knots[upper];
    const ratio = (value - lower.from) / (next.from - lower.from);
    return lower.to + ratio * (next.to - lower.to);
  };
};
