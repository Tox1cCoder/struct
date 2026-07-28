import { describe, expect, it } from 'vitest';
import { FoundationPlanCoordinateData } from '../types';
import { PdfAnchorInventory } from './pdfTextAnchors';
import {
  evaluateFoundationPlanCoverage,
  mergePriorityPlanRows,
} from './foundationPriorityCoverage';

const inventoryWithFoundations = (labels: string[]): PdfAnchorInventory => ({
  mode: 'native',
  anchors: labels.map((label, index) => ({
    kind: 'foundation',
    label,
    sourceText: label,
    page: 1,
    bbox: { ymin: index * 10, xmin: 10, ymax: index * 10 + 5, xmax: 15 },
  })),
  foundationLabels: labels,
  counts: {
    foundation: labels.length,
    'plan-column': 0,
    'certified-column': 0,
    'x-axis': 0,
    'y-axis': 0,
  },
});

const planRow = (
  foundation: string,
  xAxis: string,
  yAxis: string,
  planColumnType: string,
): FoundationPlanCoordinateData => ({ foundation, xAxis, yAxis, planColumnType });

describe('evaluateFoundationPlanCoverage', () => {
  it('rejects partial plan output even when two FC1 rows exist', () => {
    const inventory = inventoryWithFoundations(['F1', 'F1A', 'F2', 'F3']);
    const result = evaluateFoundationPlanCoverage(inventory, [
      planRow('F1A', 'X6', 'Y8', 'FC1'),
      planRow('F1A', 'X6', 'Y9', 'FC1'),
    ]);

    expect(result.complete).toBe(false);
    expect(result.missingLabels).toEqual(['F1', 'F2', 'F3']);
    expect(result.reasons).toContain('missing-foundations');
  });

  it('accepts complete anchored coverage with a coordinate or direct code per foundation', () => {
    const inventory = inventoryWithFoundations(['F1', 'F2']);
    const result = evaluateFoundationPlanCoverage(inventory, [
      planRow('F1', 'X1', 'Y1', ''),
      planRow('F2', '', '', 'FC1'),
    ]);

    expect(result.complete).toBe(true);
    expect(result.unresolvedLabels).toEqual([]);
  });

  it('reports anchored labels that are present but lack coordinates and codes', () => {
    const result = evaluateFoundationPlanCoverage(inventoryWithFoundations(['F1']), [
      planRow('F1', '', '', ''),
    ]);

    expect(result.complete).toBe(false);
    expect(result.missingLabels).toEqual([]);
    expect(result.unresolvedLabels).toEqual(['F1']);
    expect(result.reasons).toContain('unresolved-foundations');
  });

  it('uses structural validation when native anchors are unavailable', () => {
    const inventory: PdfAnchorInventory = {
      mode: 'unavailable',
      anchors: [],
      foundationLabels: [],
      counts: { foundation: 0, 'plan-column': 0, 'certified-column': 0, 'x-axis': 0, 'y-axis': 0 },
    };

    expect(evaluateFoundationPlanCoverage(inventory, [planRow('F1', 'X1', 'Y1', '')]).complete).toBe(true);
    expect(evaluateFoundationPlanCoverage(inventory, [planRow('F1', '', '', 'FC1')])).toMatchObject({
      complete: false,
      mode: 'structural',
      reasons: ['no-readable-coordinates'],
    });
  });
});

describe('mergePriorityPlanRows', () => {
  it('preserves primary order and adds only distinct targeted rows', () => {
    const primary = [
      planRow('F1', 'X1', 'Y1', 'FC1'),
      planRow('F2', 'X2', 'Y2', ''),
    ];
    const targeted = [
      planRow('F1', 'X1', 'Y1', 'FC1'),
      planRow('F2', 'X2', 'Y2', '1C1'),
    ];

    expect(mergePriorityPlanRows(primary, targeted)).toEqual([
      ...primary,
      targeted[1],
    ]);
  });
});
