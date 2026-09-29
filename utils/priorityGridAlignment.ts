import type {
  CertifiedPlacementMap,
  FoundationPlanGeometry,
  PageRect,
  PlanGridLine,
} from '../types';
import { createAxisMapper, fitGridAxis, type AxisFit } from './priorityGridRegistration';

/** How the plan grid lands on the certified sheet, and maps from certified to plan points. */
export interface GridAlignment {
  certX: number[];
  certY: number[];
  toPlanX: (value: number) => number;
  toPlanY: (value: number) => number;
}

/** Both sheets are drawn at one scale, so the axes must agree on it. */
const SCALE_AGREEMENT = 0.03;
/** The grid must cover most of the markers; ruled tables and title blocks cover none. */
const MIN_MARKER_COVERAGE = 0.5;
/** A rival within this factor of the best error is too close to call. */
const AMBIGUITY_RATIO = 2;
/** Plan points of error any real fit may carry, so two near-perfect fits still tie. */
const ERROR_SLACK = 0.05;
/** Certified points two fits may differ by and still be the same alignment. */
const SAME_ALIGNMENT = 3;
const LABEL_TOLERANCE = 3;

interface Candidate {
  x: AxisFit;
  y: AxisFit;
  names: number;
  rms: number;
}

const planPositions = (lines: PlanGridLine[]) => lines.map((line) => line.position);

const axisFailure = (axis: 'X' | 'Y', lines: PlanGridLine[]) =>
  `${axis} grid lines of the 基礎伏図 (${lines.map((line) => line.name).join(', ')}) ` +
  'could not be matched to the 認定柱脚資料 grid; only FC codes are shown.';

const NO_JOINT_FIT =
  'The 基礎伏図 and 認定柱脚資料 grids do not line up at one scale over the certified ' +
  'markers; only FC codes are shown.';

const AMBIGUOUS =
  'The 基礎伏図 grid fits the 認定柱脚資料 grid in more than one way (for example equal bays ' +
  'with an end grid label missing), so no certified codes are shown rather than a guess. ' +
  'Only FC codes are shown.';

const covers = (positions: number[], value: number) => {
  const first = positions[0];
  const last = positions[positions.length - 1];
  const halfSpacing = (last - first) / (positions.length - 1) / 2;
  return value >= first - halfSpacing && value <= last + halfSpacing;
};

const markerCoverage = (markers: { rect: PageRect }[], x: AxisFit, y: AxisFit) => {
  if (markers.length === 0) return 1;
  const inside = markers.filter(({ rect }) =>
    covers(x.positions, (rect.x0 + rect.x1) / 2) && covers(y.positions, (rect.y0 + rect.y1) / 2));
  return inside.length / markers.length;
};

/** Plan lines whose certified position carries a certified label of the same name. */
const nameMatches = (fit: AxisFit, lines: PlanGridLine[], labels: PlanGridLine[]) =>
  fit.positions.filter((position, index) =>
    labels.some((label) =>
      label.name === lines[index].name &&
      Math.abs(label.position - position) <= LABEL_TOLERANCE)).length;

const combinedRms = (x: AxisFit, y: AxisFit) => {
  const count = x.positions.length + y.positions.length;
  const squares = x.rms ** 2 * x.positions.length + y.rms ** 2 * y.positions.length;
  return Math.sqrt(squares / count);
};

const sameFit = (left: AxisFit, right: AxisFit) =>
  left.positions.every((value, index) =>
    Math.abs(value - right.positions[index]) <= SAME_ALIGNMENT);

const candidates = (
  plan: FoundationPlanGeometry,
  map: CertifiedPlacementMap,
  xs: AxisFit[],
  ys: AxisFit[],
) =>
  xs
    .flatMap((x) => ys.map((y) => ({ x, y })))
    .filter(({ x, y }) => Math.abs(x.scale / y.scale - 1) <= SCALE_AGREEMENT)
    .filter(({ x, y }) => markerCoverage(map.markers, x, y) >= MIN_MARKER_COVERAGE)
    .map(({ x, y }): Candidate => ({
      x,
      y,
      names:
        nameMatches(x, plan.gridX, map.gridLabels.x) + nameMatches(y, plan.gridY, map.gridLabels.y),
      rms: combinedRms(x, y),
    }))
    .sort((left, right) => right.names - left.names || left.rms - right.rms);

/**
 * Choose how the plan grid lands on the certified grid. Each axis may fit several
 * ways; a choice must agree on scale across axes and cover the markers. Certified
 * grid labels that match plan names break ties. When a materially different
 * alignment fits about as well, the result is refused (a message) rather than
 * guessed, since a one-bay shift would move every code to its neighbour silently.
 */
export const alignGrids = (
  plan: FoundationPlanGeometry,
  map: CertifiedPlacementMap,
): GridAlignment | string => {
  const xs = fitGridAxis(planPositions(plan.gridX), map.gridCandidates.x);
  if (xs.length === 0) return axisFailure('X', plan.gridX);
  const ys = fitGridAxis(planPositions(plan.gridY), map.gridCandidates.y);
  if (ys.length === 0) return axisFailure('Y', plan.gridY);

  const [best, ...others] = candidates(plan, map, xs, ys);
  if (!best) return NO_JOINT_FIT;
  const rival = others.find((other) => !sameFit(best.x, other.x) || !sameFit(best.y, other.y));
  const tied = rival && rival.names === best.names &&
    rival.rms <= AMBIGUITY_RATIO * best.rms + ERROR_SLACK;
  if (tied) return AMBIGUOUS;

  return {
    certX: best.x.positions,
    certY: best.y.positions,
    toPlanX: createAxisMapper(best.x.positions, planPositions(plan.gridX)),
    toPlanY: createAxisMapper(best.y.positions, planPositions(plan.gridY)),
  };
};
