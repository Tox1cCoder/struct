import { describe, expect, it } from 'vitest';
import type {
  CertifiedMarker,
  CertifiedPlacementMap,
  FoundationPlanGeometry,
  PageRect,
  PlanFooting,
} from '../types';
import {
  joinFoundationPriorityGeometry,
  planLocatorRows,
} from './foundationPriorityGeometryJoin';
import { buildFoundationPriorityText } from './mergeFoundationPriority';

const rect = (x0: number, y0: number, x1: number, y1: number): PageRect => ({ x0, y0, x1, y1 });

const footing = (id: string, label: string, area: PageRect, fcCode?: string): PlanFooting => ({
  id,
  label,
  rect: area,
  ...(fcCode ? { fcCode } : {}),
});

const plan = (footings: PlanFooting[]): FoundationPlanGeometry => ({
  page: 1,
  pageWidth: 842,
  pageHeight: 595,
  gridX: [
    { name: 'X1', position: 100 },
    { name: 'X2', position: 200 },
    { name: 'X3', position: 300 },
  ],
  gridY: [
    { name: 'Y2', position: 100 },
    { name: 'Y1', position: 200 },
  ],
  footings,
  unassignedLabels: [],
});

/** Certified sheet = plan × 2, shifted by (+10, -90), with extra non-grid lines. */
const certified = (
  markers: CertifiedMarker[],
  x = [50, 210, 410, 610],
): CertifiedPlacementMap => ({
  page: 1,
  pageWidth: 1191,
  pageHeight: 842,
  gridCandidates: { x, y: [110, 310, 700] },
  markers,
});

/** A column marker box drawn up-right of the column symbol at certified (cx, cy). */
const columnMarker = (id: string, code: string, cx: number, cy: number): CertifiedMarker => ({
  id,
  code,
  fill: [0, 255, 0],
  rect: rect(cx - 9, cy - 7, cx + 11, cy + 9),
});

const postMarker = (id: string, code: string, cx: number, cy: number): CertifiedMarker => ({
  id,
  code,
  fill: [255, 0, 255],
  rect: rect(cx - 1, cy - 4, cx + 6, cy + 3),
});

const sampleFootings = [
  footing('fA', 'F1', rect(90, 90, 110, 110)),
  footing('fB', 'F4', rect(147, 97, 155, 103)),
  footing('fC', 'F7', rect(190, 190, 310, 210)),
  footing('fD', 'F9A', rect(290, 90, 310, 110), 'FC1'),
  footing('fE', 'F2', rect(190, 90, 210, 110)),
];

const sampleMarkers = [
  columnMarker('m0', 'C1', 210, 110),
  postMarker('m1', 'P1', 310, 110),
  postMarker('m2', 'P1', 510, 110),
  columnMarker('m3', 'C3', 410, 310),
  columnMarker('m4', 'C1', 610, 310),
  columnMarker('m5', 'C4', 610, 110),
  columnMarker('m6', 'C9', 5, 5),
];

const linesOf = (result: ReturnType<typeof joinFoundationPriorityGeometry>) =>
  buildFoundationPriorityText(result.certifiedRows, result.planRows).lines;

const joinSample = (markers = sampleMarkers, certifiedX?: number[]) =>
  joinFoundationPriorityGeometry(plan(sampleFootings), certified(markers, certifiedX), 'c1');

describe('joinFoundationPriorityGeometry', () => {
  it('places certified markers in plan footings through the registered grid', () => {
    const result = joinSample();

    expect(linesOf(result)).toEqual(['F1: C1', 'F4: P1', 'F7: C3, C1', 'F9A: FC1']);
  });

  it('reports footings with no certified marker and no FC code', () => {
    const result = joinSample();

    expect(result.warnings).toEqual(['No certified column marker inside: F2 (1 of 1 footings).']);
  });

  it('keeps plan and certified evidence for every placement under one location key', () => {
    const result = joinSample();
    const f7 = result.planRows.filter((row) => row.foundation === 'F7');

    expect(f7.map((row) => [row.locationKey, row.xAxis, row.yAxis])).toEqual([
      ['c1:m3', 'X2', 'Y1'],
      ['c1:m4', 'X3', 'Y1'],
    ]);
    expect(result.certifiedRows.find((row) => row.locationKey === 'c1:m1')).toMatchObject({
      xAxis: 'X1-X2',
      yAxis: 'Y2',
      columnType: 'P1',
      page: 1,
    });
    expect(f7[0].bbox).toEqual({ ymin: 319, xmin: 226, ymax: 353, xmax: 368 });
  });

  it('snaps a marker box crossing two close grid lines to the line nearest its centre', () => {
    const closePlan: FoundationPlanGeometry = {
      ...plan([
        footing('fa', 'F1', rect(96, 96, 104, 104)),
        footing('fb', 'F2', rect(96, 108, 104, 112)),
      ]),
      gridY: [
        { name: 'Y4', position: 100 },
        { name: 'Y3', position: 110 },
      ],
    };
    const closeCertified: CertifiedPlacementMap = {
      ...certified([
        { id: 'm0', code: 'C1', fill: [0, 255, 0], rect: rect(201, 198, 221, 224) },
      ]),
      gridCandidates: { x: [210, 410, 610], y: [200, 220] },
    };

    const result = joinFoundationPriorityGeometry(closePlan, closeCertified, 'c1');

    expect(linesOf(result)).toEqual(['F2: C1']);
  });

  it('falls back to FC-only rows with a warning when the grids cannot be registered', () => {
    const result = joinSample(sampleMarkers, [210]);

    expect(linesOf(result)).toEqual(['F9A: FC1']);
    expect(result.warnings[0]).toMatch(/X grid lines .* could not be matched/);
  });

  it('names the foundations whose marker labels could not be read', () => {
    const result = joinSample(
      sampleMarkers.map((marker) => (marker.id === 'm3' ? { ...marker, code: '' } : marker)),
    );

    expect(linesOf(result)).toContain('F7: C1');
    expect(result.warnings).toContain('Could not read 1 certified marker label(s) in: F7.');
  });
});

describe('planLocatorRows', () => {
  it('emits one row per grid intersection inside a footing, or a between-grid token', () => {
    const rows = planLocatorRows(plan(sampleFootings));

    expect(rows.map((row) => [row.foundation, row.xAxis, row.yAxis, row.planColumnType])).toEqual([
      ['F1', 'X1', 'Y2', ''],
      ['F4', 'X1-X2', 'Y2', ''],
      ['F7', 'X2', 'Y1', ''],
      ['F7', 'X3', 'Y1', ''],
      ['F9A', 'X3', 'Y2', 'FC1'],
      ['F2', 'X2', 'Y2', ''],
    ]);
  });
});
