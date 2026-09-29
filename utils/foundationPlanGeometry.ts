import type { FoundationPlanGeometry, PageRect, PlanFooting, PlanGridLine } from '../types';
import type { PageShapeRect, PageText, PdfPageGeometry } from './pdfPageGeometry';
import { classifyPriorityAnchor } from './priorityLabels';

const MAX_FOOTING_FRACTION = 0.25;
const MAX_LABEL_DISTANCE_FRACTION = 0.1;
const FC_MAX_DISTANCE = 12;

interface Label {
  label: string;
  rect: PageRect;
}

const centre = (rect: PageRect) => ({ x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 });

const labelsOfKind = (texts: PageText[], kind: string): Label[] =>
  texts.flatMap((text) => {
    const classified = classifyPriorityAnchor(text.text);
    return classified?.kind === kind ? [{ label: classified.label, rect: text.rect }] : [];
  });

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true });

/**
 * Grid bubbles are centred on their line, so the label centre is the line position.
 * Snapping to nearby vector lines was tried and rejected: beam and wall edges run
 * within 1-2 pt of grid lines and pull the position off the grid.
 */
const namedGridLines = (labels: Label[], axis: 'x' | 'y'): PlanGridLine[] => {
  const byName = new Map<string, number[]>();
  for (const label of labels) {
    byName.set(label.label, [...(byName.get(label.label) ?? []), centre(label.rect)[axis]]);
  }
  return [...byName.entries()]
    .map(([name, positions]) => {
      const mean = positions.reduce((sum, value) => sum + value, 0) / positions.length;
      return { name, position: Math.round(mean * 100) / 100 };
    })
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

const footingCandidates = (geometry: PdfPageGeometry): PageShapeRect[] => {
  const maxSize = MAX_FOOTING_FRACTION * Math.min(geometry.width, geometry.height);
  return geometry.rects.filter(({ rect, stroked, filled }) => {
    const width = rect.x1 - rect.x0;
    const height = rect.y1 - rect.y0;
    return stroked && !filled && width >= 1 && height >= 1 && width <= maxSize && height <= maxSize;
  });
};

/** Greedy one-to-one assignment, closest label/rectangle pairs first. */
const assignLabels = (labels: Label[], rects: PageRect[], maxDistance: number) => {
  const pairs = labels
    .flatMap((label, labelIndex) =>
      rects.map((rect, rectIndex) => ({
        labelIndex,
        rectIndex,
        distance: labelDistance(label.rect, rect),
      })))
    .filter((pair) => pair.distance <= maxDistance)
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

/**
 * Read a 基礎伏図 page: grid lines named from their X/Y labels, and every F-labelled
 * footing rectangle with the FC code drawn on it, if any.
 */
export const buildFoundationPlanGeometry = (
  geometry: PdfPageGeometry,
  page: number,
): FoundationPlanGeometry => {
  const foundationLabels = labelsOfKind(geometry.texts, 'foundation');

  const candidates = footingCandidates(geometry);
  const width = dominantFootingWidth(foundationLabels, candidates);
  const footingRects = candidates
    .filter((candidate) => width !== null && roundWidth(candidate.lineWidth) === width)
    .map((candidate) => candidate.rect);
  const maxDistance = MAX_LABEL_DISTANCE_FRACTION * Math.hypot(geometry.width, geometry.height);
  const rectOfLabel = assignLabels(foundationLabels, footingRects, maxDistance);

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
    gridX: namedGridLines(labelsOfKind(geometry.texts, 'x-axis'), 'x'),
    gridY: namedGridLines(labelsOfKind(geometry.texts, 'y-axis'), 'y'),
    footings,
    unassignedLabels: foundationLabels
      .filter((_, index) => !rectOfLabel.has(index))
      .map((label) => label.label),
  };
};
