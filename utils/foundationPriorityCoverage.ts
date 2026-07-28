import { FoundationPlanCoordinateData } from '../types';
import { PdfAnchorInventory } from './pdfTextAnchors';

export type PriorityCoverageReason =
  | 'normalized-rows-empty'
  | 'missing-foundations'
  | 'no-readable-coordinates'
  | 'unresolved-foundations';

export interface PriorityCoverageResult {
  complete: boolean;
  mode: 'anchored' | 'structural';
  expectedCount: number;
  returnedCount: number;
  coordinateCount: number;
  codeCount: number;
  missingLabels: string[];
  unresolvedLabels: string[];
  reasons: PriorityCoverageReason[];
}

const normalizeToken = (value: string) => value.trim().replace(/['’]/g, '').toUpperCase();

const hasCoordinate = (row: FoundationPlanCoordinateData) =>
  /^X[A-Z0-9-]+$/.test(normalizeToken(row.xAxis)) &&
  /^Y[A-Z0-9-]+$/.test(normalizeToken(row.yAxis));

const hasCode = (row: FoundationPlanCoordinateData) =>
  /^(?:FC[A-Z0-9]+|(?:\d+)?[CP][A-Z0-9]+)$/.test(normalizeToken(row.planColumnType));

const normalizedRows = (rows: FoundationPlanCoordinateData[]) => rows.filter((row) =>
  /^F[A-Z0-9]+$/.test(normalizeToken(row.foundation)),
);

export const evaluateFoundationPlanCoverage = (
  inventory: PdfAnchorInventory,
  rows: FoundationPlanCoordinateData[],
): PriorityCoverageResult => {
  const usableRows = normalizedRows(rows);
  const coordinateCount = usableRows.filter(hasCoordinate).length;
  const codeCount = usableRows.filter(hasCode).length;
  const returnedLabels = new Set(usableRows.map((row) => normalizeToken(row.foundation)));
  const mode = inventory.mode === 'native' && inventory.foundationLabels.length > 0
    ? 'anchored'
    : 'structural';

  if (mode === 'structural') {
    const reasons: PriorityCoverageReason[] = [];
    if (usableRows.length === 0) reasons.push('normalized-rows-empty');
    if (coordinateCount === 0) reasons.push('no-readable-coordinates');
    return {
      complete: reasons.length === 0,
      mode,
      expectedCount: 0,
      returnedCount: returnedLabels.size,
      coordinateCount,
      codeCount,
      missingLabels: [],
      unresolvedLabels: [],
      reasons,
    };
  }

  const expectedLabels = [...new Set(inventory.foundationLabels.map(normalizeToken))];
  const missingLabels = expectedLabels.filter((label) => !returnedLabels.has(label));
  const unresolvedLabels = expectedLabels.filter((label) => {
    const matches = usableRows.filter((row) => normalizeToken(row.foundation) === label);
    return matches.length > 0 && !matches.some((row) => hasCoordinate(row) || hasCode(row));
  });
  const reasons: PriorityCoverageReason[] = [];
  if (usableRows.length === 0) reasons.push('normalized-rows-empty');
  if (missingLabels.length > 0) reasons.push('missing-foundations');
  if (unresolvedLabels.length > 0) reasons.push('unresolved-foundations');

  return {
    complete: reasons.length === 0,
    mode,
    expectedCount: expectedLabels.length,
    returnedCount: returnedLabels.size,
    coordinateCount,
    codeCount,
    missingLabels,
    unresolvedLabels,
    reasons,
  };
};

export const mergePriorityPlanRows = (
  primary: FoundationPlanCoordinateData[],
  targeted: FoundationPlanCoordinateData[],
): FoundationPlanCoordinateData[] => {
  const seen = new Set<string>();
  return [...primary, ...targeted].filter((row) => {
    const key = [row.foundation, row.xAxis, row.yAxis, row.planColumnType]
      .map(normalizeToken)
      .join('__');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
