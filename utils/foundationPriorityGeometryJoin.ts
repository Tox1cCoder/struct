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
import { alignGrids, type GridAlignment } from './priorityGridAlignment';

export interface PriorityGeometryJoinResult {
  certifiedRows: CertifiedCoordinateData[];
  planRows: FoundationPlanCoordinateData[];
  warnings: string[];
}

const ON_LINE_TOLERANCE = 1;
const CONTAIN_TOLERANCE = 0.5;
const NEAR_EDGE = 1;

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

/**
 * A marker box surrounds its column symbol and label. Columns sit on grid lines,
 * so snap to a line crossing the box (the one nearest the box centre when several
 * do). A post between lines keeps the box centre, which can sit a couple of points
 * off the post itself; `nearEdgeWarning` flags the placements that this can flip.
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

interface MappedMarker {
  marker: CertifiedMarker;
  x: number;
  y: number;
}

/** Each marker inside the registered grid, at its column position in plan space. */
const mapMarkers = (
  certified: CertifiedPlacementMap,
  registration: GridAlignment,
): MappedMarker[] =>
  certified.markers.flatMap((marker) => {
    const { rect } = marker;
    const certX = snapAxis(rect.x0, rect.x1, registration.certX);
    const certY = snapAxis(rect.y0, rect.y1, registration.certY);
    if (!insideGrid(certX, registration.certX) || !insideGrid(certY, registration.certY)) return [];
    return [{ marker, x: registration.toPlanX(certX), y: registration.toPlanY(certY) }];
  });

const placementOf = (plan: FoundationPlanGeometry, { marker, x, y }: MappedMarker) => {
  const footing = containingFooting(plan.footings, x, y);
  return footing
    ? [{ marker, footing, xAxis: axisToken(x, plan.gridX), yAxis: axisToken(y, plan.gridY) }]
    : [];
};

const edgeDistance = ({ x0, y0, x1, y1 }: PageRect, x: number, y: number) => {
  const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inside) return Math.min(x - x0, x1 - x, y - y0, y1 - y);
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
};

/** A marker this close to a footing edge could belong on either side of it. */
const nearEdgeWarning = (plan: FoundationPlanGeometry, mapped: MappedMarker[]) => {
  const near = mapped.flatMap(({ x, y }) =>
    plan.footings.filter((footing) => edgeDistance(footing.rect, x, y) < NEAR_EDGE));
  if (near.length === 0) return [];
  const labels = [...new Set(near.map((footing) => footing.label))].join(', ');
  return [
    `${near.length} certified marker(s) sit within ${NEAR_EDGE} pt of a footing edge ` +
      `(${labels}); check their evidence.`,
  ];
};

const unlabelledWarning = (plan: FoundationPlanGeometry, mapped: MappedMarker[]) => {
  const inside = mapped.filter(({ x, y }) =>
    !containingFooting(plan.footings, x, y) &&
    plan.unlabelledFootings.some((rect) =>
      x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1));
  return inside.length
    ? [`${inside.length} certified column marker(s) sit inside footing outlines with no F label.`]
    : [];
};

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
 * Certified rows keyed by the certified sheet's own printed grid labels, for plan rows
 * that carry only grid labels (a 基礎伏図 read by the Gemini fallback). Labels spelled
 * differently on the two sheets (X2A and X2C) will not match; callers warn about it.
 */
export const certifiedLocatorRows = (map: CertifiedPlacementMap): CertifiedCoordinateData[] => {
  const { x, y } = map.gridLabels;
  if (x.length === 0 || y.length === 0) return [];
  const xs = x.map((line) => line.position);
  const ys = y.map((line) => line.position);
  return map.markers
    .filter((marker) => marker.code)
    .map(({ rect, code }): CertifiedCoordinateData => ({
      xAxis: axisToken(snapAxis(rect.x0, rect.x1, xs), x),
      yAxis: axisToken(snapAxis(rect.y0, rect.y1, ys), y),
      columnType: code,
      page: map.page,
      bbox: toBoundingBox(rect, map.pageWidth, map.pageHeight),
    }));
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
  const registration = alignGrids(plan, certified);
  if (typeof registration === 'string') {
    return { certifiedRows: [], planRows: planLocatorRows(plan), warnings: [registration] };
  }

  const mapped = mapMarkers(certified, registration);
  const placements = mapped.flatMap((entry) => placementOf(plan, entry));
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
    warnings: [
      ...emptyFootingWarning(plan, placements),
      ...unreadWarning(placements),
      ...nearEdgeWarning(plan, mapped),
      ...unlabelledWarning(plan, mapped),
    ],
  };
};
