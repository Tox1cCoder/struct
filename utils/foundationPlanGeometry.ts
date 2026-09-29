import type { FoundationPlanGeometry, PageRect, PlanFooting, PlanGridLine } from '../types';
import type { PageShapeRect, PageText, PdfPageGeometry } from './pdfPageGeometry';
import { classifyPriorityAnchor } from './priorityLabels';

const MAX_FOOTING_FRACTION = 0.25;
/** Farthest a label may sit from its footing, in text sizes (leader labels reach ~10). */
const MAX_LABEL_DISTANCE_SIZES = 12;
const DUPLICATE_LABEL_DISTANCE = 0.5;
const FC_MAX_DISTANCE = 12;

interface Label {
  label: string;
  rect: PageRect;
}

const centre = (rect: PageRect) => ({ x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 });

const isDuplicate = (label: Label, other: Label) =>
  label.label === other.label &&
  Math.abs(label.rect.x0 - other.rect.x0) <= DUPLICATE_LABEL_DISTANCE &&
  Math.abs(label.rect.y0 - other.rect.y0) <= DUPLICATE_LABEL_DISTANCE;

/** Labels of one kind; a label drawn both as native text and as an SHX annotation counts once. */
const labelsOfKind = (texts: PageText[], kind: string): Label[] =>
  texts
    .flatMap((text) => {
      const classified = classifyPriorityAnchor(text.text);
      return classified?.kind === kind ? [{ label: classified.label, rect: text.rect }] : [];
    })
    .filter((label, index, all) => !all.slice(0, index).some((other) => isDuplicate(label, other)));

const textSize = (rect: PageRect) => Math.max(1, Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0));

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true });

const ROW_AGREEMENT = 2;

type Row = Map<string, number>;

/** Group labels whose centres share a row (X labels) or column (Y labels). */
const labelRows = (labels: Label[], axis: 'x' | 'y'): Row[] => {
  const across = axis === 'x' ? 'y' : 'x';
  const groups: Label[][] = [];
  const offset = (label: Label) => centre(label.rect)[across];
  const ordered = [...labels].sort((left, right) => offset(left) - offset(right));
  for (const label of ordered) {
    const group = groups[groups.length - 1];
    const sameRow = group && offset(label) - offset(group[0]) <= 2 * textSize(label.rect);
    if (sameRow) group.push(label);
    else groups.push([label]);
  }
  return groups.map((group) => {
    const positions = new Map<string, number[]>();
    for (const label of group) {
      positions.set(label.label, [...(positions.get(label.label) ?? []), centre(label.rect)[axis]]);
    }
    return new Map([...positions].map(([name, values]) =>
      [name, values.reduce((sum, value) => sum + value, 0) / values.length]));
  });
};

const span = (row: Row) => Math.max(...row.values()) - Math.min(...row.values());

const agrees = (base: Row, row: Row) =>
  [...row].every(([name, position]) =>
    !base.has(name) || Math.abs(base.get(name)! - position) <= ROW_AGREEMENT);

/**
 * Grid bubbles are centred on their line, so a label centre is the line position.
 * The widest row of bubbles is the grid; other rows (bubbles repeated along the far
 * edge) join only when they agree with it, so a key plan in a corner that repeats
 * the labels at other positions is ignored. Snapping to nearby vector lines was
 * rejected: beam and wall edges run within 1-2 pt of grid lines.
 */
const namedGridLines = (labels: Label[], axis: 'x' | 'y'): PlanGridLine[] => {
  const rows = labelRows(labels, axis).sort((left, right) => span(right) - span(left));
  const grid: Row = new Map(rows[0] ?? []);
  for (const row of rows.slice(1).filter((candidate) => agrees(grid, candidate))) {
    row.forEach((position, name) => { if (!grid.has(name)) grid.set(name, position); });
  }
  return [...grid]
    .map(([name, position]) => ({ name, position: Math.round(position * 100) / 100 }))
    .sort((left, right) => left.position - right.position || naturalCompare(left.name, right.name));
};

/** Label sits above the top-left corner of its footing in this drawing convention. */
const labelDistance = (label: PageRect, rect: PageRect) =>
  Math.abs(label.x0 - rect.x0) + Math.abs(label.y1 - rect.y0);

const roundWidth = (value: number) => Math.round(value * 100) / 100;

/**
 * Footings share one stroke width. Pick the width for which the most F labels
 * have a rectangle close to their corner, so thin text frames never win.
 */
const dominantFootingWidth = (labels: Label[], candidates: PageShapeRect[]): number | null => {
  const counts = new Map<number, number>();
  for (const label of labels) {
    const near = 3 * (label.rect.y1 - label.rect.y0);
    const widths = new Set(
      candidates
        .filter((candidate) => labelDistance(label.rect, candidate.rect) <= near)
        .map((candidate) => roundWidth(candidate.lineWidth)),
    );
    widths.forEach((width) => counts.set(width, (counts.get(width) ?? 0) + 1));
  }
  const ranked = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  return ranked[0]?.[0] ?? null;
};

/** Outlines may carry a white mask fill; coloured fills are highlights, not footings. */
const isOutline = ({ stroked, filled, fill }: PageShapeRect) =>
  stroked && (!filled || (fill !== undefined && fill.every((channel) => channel >= 240)));

const footingCandidates = (geometry: PdfPageGeometry): PageShapeRect[] => {
  const maxSize = MAX_FOOTING_FRACTION * Math.min(geometry.width, geometry.height);
  return geometry.rects.filter((shape) => {
    const width = shape.rect.x1 - shape.rect.x0;
    const height = shape.rect.y1 - shape.rect.y0;
    const sized = width >= 1 && height >= 1 && width <= maxSize && height <= maxSize;
    return sized && isOutline(shape);
  });
};

/**
 * Greedy one-to-one assignment, closest label/rectangle pairs first. A label only
 * reaches footings within a few text sizes, so a stray note cannot claim a footing
 * whose own label is missing.
 */
const assignLabels = (labels: Label[], rects: PageRect[]) => {
  const pairs = labels
    .flatMap((label, labelIndex) =>
      rects.map((rect, rectIndex) => ({
        labelIndex,
        rectIndex,
        distance: labelDistance(label.rect, rect),
        reach: MAX_LABEL_DISTANCE_SIZES * textSize(label.rect),
      })))
    .filter((pair) => pair.distance <= pair.reach)
    .sort((left, right) => left.distance - right.distance);
  const rectOfLabel = new Map<number, number>();
  const takenRects = new Set<number>();
  for (const pair of pairs) {
    if (rectOfLabel.has(pair.labelIndex) || takenRects.has(pair.rectIndex)) continue;
    rectOfLabel.set(pair.labelIndex, pair.rectIndex);
    takenRects.add(pair.rectIndex);
  }
  return rectOfLabel;
};

const distanceToRect = (point: { x: number; y: number }, rect: PageRect) => {
  const dx = Math.max(rect.x0 - point.x, 0, point.x - rect.x1);
  const dy = Math.max(rect.y0 - point.y, 0, point.y - rect.y1);
  return Math.hypot(dx, dy);
};

const attachFcCodes = (footings: PlanFooting[], fcLabels: Label[]) => {
  for (const fc of fcLabels) {
    const point = centre(fc.rect);
    const ranked = footings
      .map((footing) => ({ footing, distance: distanceToRect(point, footing.rect) }))
      .filter(({ distance }) => distance <= FC_MAX_DISTANCE)
      .sort((left, right) => left.distance - right.distance);
    const target = ranked[0]?.footing;
    if (target && !target.fcCode) target.fcCode = fc.label;
  }
};

const encloses = (outer: PageRect, inner: PageRect) =>
  inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1;

/** Footing-style outlines left without a label, other than pedestal squares inside a footing. */
const unlabelledOutlines = (rects: PageRect[], footings: PlanFooting[]) =>
  rects.filter((rect) =>
    !footings.some((footing) => footing.rect === rect || encloses(footing.rect, rect)));

/** Named grid lines from X/Y grid-bubble labels (native text or SHX annotations). */
export const readGridLabels = (texts: PageText[]) => ({
  x: namedGridLines(labelsOfKind(texts, 'x-axis'), 'x'),
  y: namedGridLines(labelsOfKind(texts, 'y-axis'), 'y'),
});

/**
 * Read a 基礎伏図 page: grid lines named from their X/Y labels, and every F-labelled
 * footing rectangle with the FC code drawn on it, if any.
 */
export const buildFoundationPlanGeometry = (
  geometry: PdfPageGeometry,
  page: number,
): FoundationPlanGeometry => {
  const foundationLabels = labelsOfKind(geometry.texts, 'foundation');
  const gridLabels = readGridLabels(geometry.texts);

  const candidates = footingCandidates(geometry);
  const width = dominantFootingWidth(foundationLabels, candidates);
  const footingRects = candidates
    .filter((candidate) => width !== null && roundWidth(candidate.lineWidth) === width)
    .map((candidate) => candidate.rect);
  const rectOfLabel = assignLabels(foundationLabels, footingRects);

  const footings: PlanFooting[] = [...rectOfLabel.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([labelIndex, rectIndex], index) => ({
      id: `f${index}`,
      label: foundationLabels[labelIndex].label,
      rect: footingRects[rectIndex],
    }));
  attachFcCodes(footings, labelsOfKind(geometry.texts, 'plan-column'));

  return {
    page,
    pageWidth: geometry.width,
    pageHeight: geometry.height,
    gridX: gridLabels.x,
    gridY: gridLabels.y,
    footings,
    unassignedLabels: foundationLabels
      .filter((_, index) => !rectOfLabel.has(index))
      .map((label) => label.label),
    unlabelledFootings: unlabelledOutlines(footingRects, footings),
  };
};
