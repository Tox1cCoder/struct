import type {
  CertifiedPlacementMap,
  FoundationPlanGeometry,
  PageRect,
  PriorityPipelineDiagnostics,
} from '../types';
import {
  applyMarkerCodes,
  readCertifiedDocument,
  readFoundationPlanDocument,
} from '../utils/foundationPriorityDocuments';
import {
  addPriorityWarning,
  createPriorityDiagnostics,
  finishStage,
  incrementPriorityCropCount,
} from '../utils/foundationPriorityDiagnostics';
import { loadPdfPageGeometries, renderPdfPageRegions } from '../utils/pdfPageLoader';
import { selectMarkerOcrRequestPolicy } from './geminiRequestPolicy';
import { readCertifiedMarkerCodes } from './geminiService';

/** Diagnostics model name for results read from PDF vectors and text, with no model call. */
export const VECTOR_GEOMETRY_MODEL = 'vector-geometry';

/** The PDF has no page this reader understands; callers fall back to the Gemini extractors. */
export class PriorityGeometryUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriorityGeometryUnavailableError';
  }
}

const CROP_PADDING = 2;

const padded = ({ x0, y0, x1, y1 }: PageRect): PageRect => ({
  x0: x0 - CROP_PADDING,
  y0: y0 - CROP_PADDING,
  x1: x1 + CROP_PADDING,
  y1: y1 + CROP_PADDING,
});

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const geometryDiagnostics = (
  fileName: string,
  role: 'certified' | 'plan',
  counts: Partial<PriorityPipelineDiagnostics['anchorCounts']>,
): PriorityPipelineDiagnostics => {
  const base = createPriorityDiagnostics(fileName, role);
  return {
    ...base,
    model: VECTOR_GEOMETRY_MODEL,
    anchorMode: 'native',
    anchorCounts: { ...base.anchorCounts, ...counts },
  };
};

export const extractFoundationPlanGeometry = async (
  file: File,
): Promise<{ geometry: FoundationPlanGeometry; diagnostics: PriorityPipelineDiagnostics }> => {
  const started = Date.now();
  const geometry = readFoundationPlanDocument(await loadPdfPageGeometries(file));
  if (!geometry) {
    throw new PriorityGeometryUnavailableError(
      `${file.name} has no page with X/Y grid labels and F-labelled footing outlines.`,
    );
  }

  const missingLabels = [...new Set(geometry.unassignedLabels)];
  let diagnostics = geometryDiagnostics(file.name, 'plan', {
    foundation: geometry.footings.length,
    'plan-column': geometry.footings.filter((footing) => footing.fcCode).length,
    'x-axis': geometry.gridX.length,
    'y-axis': geometry.gridY.length,
  });
  diagnostics = {
    ...diagnostics,
    coverage: {
      mode: 'anchored',
      expectedCount: geometry.footings.length + geometry.unassignedLabels.length,
      returnedCount: geometry.footings.length,
      coordinateCount: geometry.footings.length,
      codeCount: geometry.footings.filter((footing) => footing.fcCode).length,
      missingLabels,
      unresolvedLabels: [],
    },
  };
  if (missingLabels.length > 0) {
    diagnostics = addPriorityWarning(
      diagnostics,
      `No footing outline found for: ${missingLabels.join(', ')}.`,
    );
  }
  return { geometry, diagnostics: finishStage(diagnostics, 'total', Date.now() - started) };
};

/** Read the labels that are not embedded in the PDF from rendered marker crops. */
const readUnlabelledMarkers = async (
  file: File,
  map: CertifiedPlacementMap,
  diagnostics: PriorityPipelineDiagnostics,
) => {
  const unread = map.markers.filter((marker) => !marker.code);
  let next = incrementPriorityCropCount(
    { ...diagnostics, model: selectMarkerOcrRequestPolicy().model },
    unread.length,
  );
  const started = Date.now();
  let codes = new Map<string, string>();
  try {
    const regions = unread.map((marker) => padded(marker.rect));
    const images = await renderPdfPageRegions(file, map.page, regions);
    codes = await readCertifiedMarkerCodes(
      unread.map((marker, index) => ({ id: marker.id, ...images[index] })),
    );
  } catch (error) {
    next = addPriorityWarning(
      next,
      `Reading ${unread.length} certified marker label(s) failed: ${errorMessage(error)}`,
    );
  }
  next = finishStage(next, 'primaryGeneration', Date.now() - started);
  const stillUnread = unread.filter((marker) => !codes.has(marker.id)).length;
  if (stillUnread > 0 && !next.warning) {
    next = addPriorityWarning(next, `${stillUnread} certified marker label(s) could not be read.`);
  }
  const embedded = map.markers
    .filter((marker) => marker.code)
    .map((marker): [string, string] => [marker.id, marker.code]);
  return {
    placementMap: applyMarkerCodes(map, new Map([...embedded, ...codes])),
    diagnostics: next,
  };
};

export const extractCertifiedPlacementMap = async (
  file: File,
): Promise<{ placementMap: CertifiedPlacementMap; diagnostics: PriorityPipelineDiagnostics }> => {
  const started = Date.now();
  const map = readCertifiedDocument(await loadPdfPageGeometries(file));
  if (!map) {
    throw new PriorityGeometryUnavailableError(
      `${file.name} has no page with colour markers drawn on a grid.`,
    );
  }

  const diagnostics = finishStage(
    geometryDiagnostics(file.name, 'certified', {
      'certified-column': map.markers.length,
      'x-axis': map.gridCandidates.x.length,
      'y-axis': map.gridCandidates.y.length,
    }),
    'preprocess',
    Date.now() - started,
  );
  const result = map.markers.every((marker) => marker.code)
    ? { placementMap: map, diagnostics }
    : await readUnlabelledMarkers(file, map, diagnostics);
  return { ...result, diagnostics: finishStage(result.diagnostics, 'total', Date.now() - started) };
};
