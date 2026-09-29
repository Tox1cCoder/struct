import type { CertifiedMarker, CertifiedPlacementMap, PageRect } from '../types';
import type { PageShapeRect, PageText, PdfPageGeometry, Rgb } from './pdfPageGeometry';
import { clusterLinePositions } from './priorityGridRegistration';
import { canonicalMarkerCode } from './priorityLabels';

const LONG_LINE_FRACTION = 0.3;
const MIN_MARKER_SIZE = 2;
const MAX_MARKER_SIZE = 40;
const GRID_AREA_MARGIN = 0.05;
const MIN_SATURATION = 60;

const isColoured = ([red, green, blue]: Rgb) =>
  Math.max(red, green, blue) - Math.min(red, green, blue) >= MIN_SATURATION;

const isMarkerSized = (rect: PageRect) => {
  const width = rect.x1 - rect.x0;
  const height = rect.y1 - rect.y0;
  return [width, height].every((size) => size >= MIN_MARKER_SIZE && size <= MAX_MARKER_SIZE);
};

const expandedRange = (positions: number[]): [number, number] => {
  const low = Math.min(...positions);
  const high = Math.max(...positions);
  const margin = (high - low) * GRID_AREA_MARGIN;
  return [low - margin, high + margin];
};

const rectKey = ({ x0, y0, x1, y1 }: PageRect) =>
  [x0, y0, x1, y1].map((value) => value.toFixed(1)).join(',');

const isMarkerShape = (shape: PageShapeRect): shape is PageShapeRect & { fill: Rgb } =>
  shape.filled && shape.fill !== undefined && isColoured(shape.fill) && isMarkerSized(shape.rect);

const centreInside = (rect: PageRect, [xLow, xHigh]: number[], [yLow, yHigh]: number[]) => {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  return cx >= xLow && cx <= xHigh && cy >= yLow && cy <= yHigh;
};

/** The code printed inside a marker, when exactly one distinct code-like text is centred in it. */
const embeddedCode = (rect: PageRect, texts: PageText[]) => {
  const codes = new Set(
    texts
      .filter((text) => centreInside(text.rect, [rect.x0, rect.x1], [rect.y0, rect.y1]))
      .map((text) => canonicalMarkerCode(text.text))
      .filter((code): code is string => code !== null),
  );
  return codes.size === 1 ? [...codes][0] : '';
};

const collectMarkers = (geometry: PdfPageGeometry, x: number[], y: number[]): CertifiedMarker[] => {
  if (x.length === 0 || y.length === 0) return [];
  const xRange = expandedRange(x);
  const yRange = expandedRange(y);
  const seen = new Set<string>();
  const markers: CertifiedMarker[] = [];
  for (const shape of geometry.rects.filter(isMarkerShape)) {
    const key = rectKey(shape.rect);
    if (seen.has(key) || !centreInside(shape.rect, xRange, yRange)) continue;
    seen.add(key);
    markers.push({
      id: `m${markers.length}`,
      rect: shape.rect,
      fill: shape.fill,
      code: embeddedCode(shape.rect, geometry.texts),
    });
  }
  return markers;
};

/**
 * Read a 認定柱脚資料 placement page: long straight lines that may be grid lines,
 * and the coloured highlight boxes drawn over each column or post. A marker's code
 * comes from text inside it (AutoCAD SHX text annotations included); markers
 * without one keep an empty code, to be read from a rendered crop.
 */
export const buildCertifiedPlacementMap = (
  geometry: PdfPageGeometry,
  page: number,
): CertifiedPlacementMap => {
  const { segments } = geometry;
  const x = clusterLinePositions(segments, 'vertical', LONG_LINE_FRACTION * geometry.height);
  const y = clusterLinePositions(segments, 'horizontal', LONG_LINE_FRACTION * geometry.width);
  return {
    page,
    pageWidth: geometry.width,
    pageHeight: geometry.height,
    gridCandidates: { x, y },
    markers: collectMarkers(geometry, x, y),
  };
};
