import type {
  BoundingBox,
  CertifiedCoordinateData,
  CertifiedMarker,
  CertifiedPlacementMap,
  FoundationPlanCoordinateData,
  FoundationPlanGeometry,
  PageRect,
  PlanFooting,
  PlanGridLine,
} from '../types';
import { createAxisMapper, registerGridAxis } from './priorityGridRegistration';

export interface PriorityGeometryJoinResult {
  certifiedRows: CertifiedCoordinateData[];
  planRows: FoundationPlanCoordinateData[];
  warnings: string[];
}

const ON_LINE_TOLERANCE = 1;
const CONTAIN_TOLERANCE = 0.5;

const clampPermille = (value: number) => Math.max(0, Math.min(1000, Math.round(value)));

const toBoundingBox = (rect: PageRect, width: number, height: number): BoundingBox => ({
  ymin: clampPermille((rect.y0 / height) * 1000),
  xmin: clampPermille((rect.x0 / width) * 1000),
  ymax: clampPermille((rect.y1 / height) * 1000),
  xmax: clampPermille((rect.x1 / width) * 1000),
});

/** Grid name when on a line, `Xa-Xb` between two lines, nearest name outside the grid. */
const axisToken = (position: number, lines: PlanGridLine[]): string => {
  const nearest = lines.reduce((best, line) =>
    Math.abs(line.position - position) < Math.abs(best.position - position) ? line : best);
  if (Math.abs(nearest.position - position) <= ON_LINE_TOLERANCE) return nearest.name;
  const upper = lines.findIndex((line) => line.position > position);
  return upper <= 0 ? nearest.name : `${lines[upper - 1].name}-${lines[upper].name}`;
};

const namesAcross = (lines: PlanGridLine[], from: number, to: number) =>
  lines
    .filter(({ position }) =>
      position >= from - ON_LINE_TOLERANCE && position <= to + ON_LINE_TOLERANCE)
    .map((line) => line.name);

const locatorRowsFor = (plan: FoundationPlanGeometry, footing: PlanFooting) => {
  const { rect } = footing;
  const acrossX = namesAcross(plan.gridX, rect.x0, rect.x1);
  const acrossY = namesAcross(plan.gridY, rect.y0, rect.y1);
  const xs = acrossX.length ? acrossX : [axisToken((rect.x0 + rect.x1) / 2, plan.gridX)];
  const ys = acrossY.length ? acrossY : [axisToken((rect.y0 + rect.y1) / 2, plan.gridY)];
  const bbox = toBoundingBox(rect, plan.pageWidth, plan.pageHeight);
  return xs.flatMap((xAxis) => ys.map((yAxis): FoundationPlanCoordinateData => ({
    foundation: footing.label,
    xAxis,
    yAxis,
    planColumnType: footing.fcCode ?? '',
    page: plan.page,
    bbox,
  })));
};

/**
 * Plan rows keyed by grid-label tokens, one per grid intersection a footing covers.
 * Used when the certified side has no placement map and only label-based rows.
 */
export const planLocatorRows = (plan: FoundationPlanGeometry): FoundationPlanCoordinateData[] =>
  plan.gridX.length && plan.gridY.length
    ? plan.footings.flatMap((footing) => locatorRowsFor(plan, footing))
    : [];

interface Registration {
  certX: number[];
  certY: number[];
  toPlanX: (value: number) => number;
  toPlanY: (value: number) => number;
}

const registrationFailure = (axis: 'X' | 'Y', lines: PlanGridLine[]) =>
  `${axis} grid lines of the 基礎伏図 (${lines.map((line) => line.name).join(', ')}) ` +
  'could not be matched to the 認定柱脚資料 grid; only FC codes are shown.';

/** Register the axis with more lines first, then hold the other axis to its scale. */
const registerGrids = (
  plan: FoundationPlanGeometry,
  certified: CertifiedPlacementMap,
): Registration | string => {
  const axes = [
    { axis: 'X' as const, lines: plan.gridX, candidates: certified.gridCandidates.x },
    { axis: 'Y' as const, lines: plan.gridY, candidates: certified.gridCandidates.y },
  ];
  if (plan.gridY.length > plan.gridX.length) axes.reverse();
  const first = registerGridAxis(axes[0].lines.map((line) => line.position), axes[0].candidates);
  if (!first) return registrationFailure(axes[0].axis, axes[0].lines);
  const second = registerGridAxis(
    axes[1].lines.map((line) => line.position),
    axes[1].candidates,
    first.scale,
  );
  if (!second) return registrationFailure(axes[1].axis, axes[1].lines);
  const [certX, certY] = axes[0].axis === 'X'
    ? [first.positions, second.positions]
    : [second.positions, first.positions];
  return {
    certX,
    certY,
    toPlanX: createAxisMapper(certX, plan.gridX.map((line) => line.position)),
    toPlanY: createAxisMapper(certY, plan.gridY.map((line) => line.position)),
  };
};

/**
 * A marker box surrounds its column symbol and label. Columns sit on grid lines,
 * so snap to a line crossing the box (the one nearest the box centre when several
 * do); a post between lines keeps the box centre.
 */
const snapAxis = (from: number, to: number, lines: number[]) => {
  const centre = (from + to) / 2;
  const crossing = lines.filter((line) => line >= from && line <= to);
  return crossing.reduce<number>(
    (best, line) => (Math.abs(line - centre) < Math.abs(best - centre) ? line : best),
    crossing[0] ?? centre,
  );
};

const insideGrid = (value: number, lines: number[]) => {
  const halfSpacing = (lines[lines.length - 1] - lines[0]) / (lines.length - 1) / 2;
  return value >= lines[0] - halfSpacing && value <= lines[lines.length - 1] + halfSpacing;
};

const containingFooting = (footings: PlanFooting[], x: number, y: number) =>
  footings
    .filter(({ rect }) =>
      x >= rect.x0 - CONTAIN_TOLERANCE && x <= rect.x1 + CONTAIN_TOLERANCE &&
      y >= rect.y0 - CONTAIN_TOLERANCE && y <= rect.y1 + CONTAIN_TOLERANCE)
    .sort((left, right) => area(left.rect) - area(right.rect))[0];

const area = (rect: PageRect) => (rect.x1 - rect.x0) * (rect.y1 - rect.y0);

interface Placement {
  marker: CertifiedMarker;
  footing: PlanFooting;
  xAxis: string;
  yAxis: string;
}

const placeMarkers = (
  plan: FoundationPlanGeometry,
  certified: CertifiedPlacementMap,
  registration: Registration,
): Placement[] =>
  certified.markers.flatMap((marker) => {
    const certX = snapAxis(marker.rect.x0, marker.rect.x1, registration.certX);
    const certY = snapAxis(marker.rect.y0, marker.rect.y1, registration.certY);
    if (!insideGrid(certX, registration.certX) || !insideGrid(certY, registration.certY)) return [];
    const x = registration.toPlanX(certX);
    const y = registration.toPlanY(certY);
    const footing = containingFooting(plan.footings, x, y);
    if (!footing) return [];
    return [{ marker, footing, xAxis: axisToken(x, plan.gridX), yAxis: axisToken(y, plan.gridY) }];
  });

const emptyFootingWarning = (plan: FoundationPlanGeometry, placements: Placement[]) => {
  const placed = new Set(placements.map((placement) => placement.footing.id));
  const totals = new Map<string, { empty: number; total: number }>();
  for (const footing of plan.footings) {
    const entry = totals.get(footing.label) ?? { empty: 0, total: 0 };
    entry.total += 1;
    if (!placed.has(footing.id) && !footing.fcCode) entry.empty += 1;
    totals.set(footing.label, entry);
  }
  const empty = [...totals.entries()]
    .filter(([, entry]) => entry.empty > 0)
    .map(([label, entry]) => `${label} (${entry.empty} of ${entry.total} footings)`);
  return empty.length ? [`No certified column marker inside: ${empty.join(', ')}.`] : [];
};

const unreadWarning = (placements: Placement[]) => {
  const unread = placements.filter((placement) => !placement.marker.code);
  if (unread.length === 0) return [];
  const labels = [...new Set(unread.map((placement) => placement.footing.label))];
  return [`Could not read ${unread.length} certified marker label(s) in: ${labels.join(', ')}.`];
};

/**
 * Join a 基礎伏図 and a 認定柱脚資料 placement page by geometry: register both grids
 * by line order and spacing, map every certified marker into plan space, and give
 * it to the plan footing that contains it. Rows for one placement share a
 * `locationKey`, so the merge pairs them without comparing grid labels.
 */
export const joinFoundationPriorityGeometry = (
  plan: FoundationPlanGeometry,
  certified: CertifiedPlacementMap,
  keyPrefix: string,
): PriorityGeometryJoinResult => {
  const registration = registerGrids(plan, certified);
  if (typeof registration === 'string') {
    return { certifiedRows: [], planRows: planLocatorRows(plan), warnings: [registration] };
  }

  const placements = placeMarkers(plan, certified, registration);
  const keyOf = (placement: Placement) => `${keyPrefix}:${placement.marker.id}`;
  const certifiedRows = placements.map((placement): CertifiedCoordinateData => ({
    xAxis: placement.xAxis,
    yAxis: placement.yAxis,
    columnType: placement.marker.code,
    locationKey: keyOf(placement),
    page: certified.page,
    bbox: toBoundingBox(placement.marker.rect, certified.pageWidth, certified.pageHeight),
  }));
  const placedFootings = new Set(placements.map((placement) => placement.footing.id));
  const planRows = [
    ...placements.map((placement): FoundationPlanCoordinateData => ({
      foundation: placement.footing.label,
      xAxis: placement.xAxis,
      yAxis: placement.yAxis,
      planColumnType: placement.footing.fcCode ?? '',
      locationKey: keyOf(placement),
      page: plan.page,
      bbox: toBoundingBox(placement.footing.rect, plan.pageWidth, plan.pageHeight),
    })),
    ...plan.footings
      .filter((footing) => footing.fcCode && !placedFootings.has(footing.id))
      .flatMap((footing) => locatorRowsFor(plan, footing)),
  ];

  return {
    certifiedRows,
    planRows,
    warnings: [...emptyFootingWarning(plan, placements), ...unreadWarning(placements)],
  };
};
