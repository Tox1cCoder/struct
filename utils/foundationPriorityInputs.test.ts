import { describe, expect, it } from 'vitest';
import type {
  CertifiedCoordinateFileResult,
  CertifiedPlacementMap,
  FoundationPlanCoordinateFileResult,
  FoundationPlanGeometry,
} from '../types';
import { collectPriorityInputs } from './foundationPriorityInputs';
import { buildFoundationPriorityText } from './mergeFoundationPriority';

const geometry: FoundationPlanGeometry = {
  page: 1,
  pageWidth: 842,
  pageHeight: 595,
  gridX: [
    { name: 'X1', position: 100 },
    { name: 'X2', position: 200 },
    { name: 'X3', position: 300 },
  ],
  gridY: [{ name: 'Y2', position: 100 }, { name: 'Y1', position: 200 }],
  footings: [
    { id: 'f0', label: 'F1', rect: { x0: 90, y0: 90, x1: 110, y1: 110 } },
    { id: 'f1', label: 'F2', rect: { x0: 190, y0: 190, x1: 210, y1: 210 } },
  ],
  unassignedLabels: [],
};

const placementMap = (code: string): CertifiedPlacementMap => ({
  page: 1,
  pageWidth: 1191,
  pageHeight: 842,
  gridCandidates: { x: [210, 410, 610], y: [110, 310] },
  markers: [
    { id: 'm0', code, fill: [0, 255, 0], rect: { x0: 201, y0: 103, x1: 221, y1: 119 } },
  ],
});

const certifiedResult = (
  id: string,
  extra: Partial<CertifiedCoordinateFileResult>,
): CertifiedCoordinateFileResult =>
  ({ id, fileName: `${id}.pdf`, status: 'SUCCESS', data: [], ...extra });

const planResult = (
  id: string,
  extra: Partial<FoundationPlanCoordinateFileResult>,
): FoundationPlanCoordinateFileResult =>
  ({ id, fileName: `${id}.pdf`, status: 'SUCCESS', data: [], ...extra });

const linesOf = (inputs: ReturnType<typeof collectPriorityInputs>) =>
  buildFoundationPriorityText(inputs.certifiedRows, inputs.planRows).lines;

describe('collectPriorityInputs', () => {
  it('joins plan geometry with the certified placement map, tagging each side', () => {
    const inputs = collectPriorityInputs(
      [certifiedResult('cert', { placementMap: placementMap('C3') })],
      [planResult('plan', { geometry })],
    );

    expect(linesOf(inputs)).toEqual(['F1: C3']);
    expect(inputs.certifiedRows[0]).toMatchObject({ sourceFileId: 'cert', locationKey: 'cert:m0' });
    expect(inputs.planRows[0]).toMatchObject({ sourceFileId: 'plan', sourceFileName: 'plan.pdf' });
    expect(inputs.planWarnings).toEqual({
      plan: 'No certified column marker inside: F2 (1 of 1 footings).',
    });
  });

  it('uses the most recent successful certified placement map', () => {
    const inputs = collectPriorityInputs(
      [
        certifiedResult('old', { placementMap: placementMap('C3') }),
        certifiedResult('new', { placementMap: placementMap('C5') }),
        certifiedResult('failed', { status: 'ERROR', placementMap: placementMap('C9') }),
      ],
      [planResult('plan', { geometry })],
    );

    expect(linesOf(inputs)).toEqual(['F1: C5']);
  });

  it('matches plan geometry to Gemini certified rows by grid labels when there is no map', () => {
    const inputs = collectPriorityInputs(
      [certifiedResult('cert', { data: [{ xAxis: 'X1', yAxis: 'Y2', columnType: 'C3009' }] })],
      [planResult('plan', { geometry })],
    );

    expect(linesOf(inputs)).toEqual(['F1: C3009']);
    expect(inputs.planWarnings).toEqual({});
  });

  it('passes Gemini plan rows through unchanged and skips unfinished results', () => {
    const inputs = collectPriorityInputs(
      [certifiedResult('cert', { data: [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C1' }] })],
      [
        planResult('plan', {
          data: [{ foundation: 'F7', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
        }),
        planResult('busy', {
          status: 'PROCESSING',
          data: [{ foundation: 'F8', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
        }),
      ],
    );

    expect(linesOf(inputs)).toEqual(['F7: C1']);
  });
});
