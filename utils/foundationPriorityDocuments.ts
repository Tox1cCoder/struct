import type { CertifiedPlacementMap, FoundationPlanGeometry } from '../types';
import { buildCertifiedPlacementMap } from './certifiedPlacementMap';
import { buildFoundationPlanGeometry } from './foundationPlanGeometry';
import type { PdfPageGeometry } from './pdfPageGeometry';

const MIN_MARKERS = 3;
const MIN_GRID_CANDIDATES = 2;

const mostOf = <T>(items: T[], score: (item: T) => number): T | null =>
  items.reduce<T | null>(
    (best, item) => (best === null || score(item) > score(best) ? item : best),
    null,
  );

/**
 * The 基礎伏図 page with the most F-labelled footings, or null when no page has
 * X and Y grid labels and at least one labelled footing.
 */
export const readFoundationPlanDocument = (
  pages: PdfPageGeometry[],
): FoundationPlanGeometry | null => {
  const usable = pages
    .map((geometry, index) => buildFoundationPlanGeometry(geometry, index + 1))
    .filter((plan) => plan.footings.length > 0 && plan.gridX.length > 0 && plan.gridY.length > 0);
  return mostOf(usable, (plan) => plan.footings.length);
};

const hasGridLabels = (map: CertifiedPlacementMap) =>
  map.gridLabels.x.length >= MIN_GRID_CANDIDATES && map.gridLabels.y.length >= MIN_GRID_CANDIDATES;

/**
 * The 認定柱脚資料 placement page, or null when no page has at least three markers and
 * two grid-line candidates on each axis. A page with X/Y grid labels beats one without
 * (catalog pages carry coloured table cells too); then the most markers wins.
 */
export const readCertifiedDocument = (
  pages: PdfPageGeometry[],
): CertifiedPlacementMap | null => {
  const usable = pages
    .map((geometry, index) => buildCertifiedPlacementMap(geometry, index + 1))
    .filter((map) =>
      map.markers.length >= MIN_MARKERS &&
      map.gridCandidates.x.length >= MIN_GRID_CANDIDATES &&
      map.gridCandidates.y.length >= MIN_GRID_CANDIDATES);
  const labelled = usable.filter(hasGridLabels);
  return mostOf(labelled.length > 0 ? labelled : usable, (map) => map.markers.length);
};

export const applyMarkerCodes = (
  map: CertifiedPlacementMap,
  codes: Map<string, string>,
): CertifiedPlacementMap => ({
  ...map,
  markers: map.markers.map((marker) => ({ ...marker, code: codes.get(marker.id) ?? '' })),
});
