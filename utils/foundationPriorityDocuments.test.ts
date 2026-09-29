import { describe, expect, it } from 'vitest';
import type { CertifiedPlacementMap } from '../types';
import {
  applyMarkerCodes,
  readCertifiedDocument,
  readFoundationPlanDocument,
} from './foundationPriorityDocuments';
import type { PdfPageGeometry } from './pdfPageGeometry';
import { canonicalMarkerCode } from './priorityLabels';

const blank: PdfPageGeometry = { width: 600, height: 800, texts: [], segments: [], rects: [] };

const planPage: PdfPageGeometry = {
  ...blank,
  texts: [
    { text: 'X1', rect: { x0: 98, y0: 500, x1: 102, y1: 503 } },
    { text: 'Y1', rect: { x0: 48, y0: 398, x1: 52, y1: 401 } },
    { text: 'F1', rect: { x0: 88, y0: 286, x1: 92, y1: 289 } },
  ],
  rects: [{
    rect: { x0: 90, y0: 290, x1: 110, y1: 310 },
    lineWidth: 0.48,
    stroked: true,
    filled: false,
  }],
};

const line = (orientation: 'vertical' | 'horizontal', at: number) =>
  orientation === 'vertical'
    ? { x0: at, y0: 0, x1: at, y1: 700, lineWidth: 0.3 }
    : { x0: 0, y0: at, x1: 600, y1: at, lineWidth: 0.3 };

const markerPage = (count: number): PdfPageGeometry => ({
  ...blank,
  segments: [
    line('vertical', 100),
    line('vertical', 400),
    line('horizontal', 100),
    line('horizontal', 600),
  ],
  rects: Array.from({ length: count }, (_, index) => ({
    rect: { x0: 100 + index * 30, y0: 200, x1: 120 + index * 30, y1: 216 },
    lineWidth: 0.06,
    stroked: true,
    filled: true,
    fill: [0, 255, 0] as [number, number, number],
  })),
});

describe('readFoundationPlanDocument', () => {
  it('reads the page with the most labelled footings', () => {
    const plan = readFoundationPlanDocument([blank, planPage]);
    expect(plan?.page).toBe(2);
    expect(plan?.footings.map((footing) => footing.label)).toEqual(['F1']);
  });

  it('returns null when no page has grid labels and a labelled footing', () => {
    const withoutGrid = { ...planPage, texts: planPage.texts.slice(2) };
    expect(readFoundationPlanDocument([blank, withoutGrid])).toBeNull();
  });
});

describe('readCertifiedDocument', () => {
  it('reads the page with the most colour markers', () => {
    const map = readCertifiedDocument([markerPage(2), markerPage(5), blank]);
    expect(map?.page).toBe(2);
    expect(map?.markers).toHaveLength(5);
  });

  it('returns null when no page has at least three markers inside a grid', () => {
    expect(readCertifiedDocument([markerPage(2), blank])).toBeNull();
  });
});

describe('applyMarkerCodes', () => {
  it('fills codes by marker id and leaves unread markers empty', () => {
    const map = readCertifiedDocument([markerPage(3)]) as CertifiedPlacementMap;
    const read = applyMarkerCodes(map, new Map([['m0', 'C1'], ['m2', 'P1']]));
    expect(read.markers.map((marker) => marker.code)).toEqual(['C1', '', 'P1']);
    expect(map.markers.map((marker) => marker.code)).toEqual(['', '', '']);
  });
});

describe('canonicalMarkerCode', () => {
  it.each([
    ["1'C1", '1C1'],
    ['1’C6', '1C6'],
    [' c2 ', 'C2'],
    ['P1', 'P1'],
    ['P1A', 'P1A'],
    ['Ｃ１', 'C1'],
    ['ＣＩ', null],
    ['FC1', null],
    ['', null],
    ['C', null],
    ['unknown', null],
  ])('%s → %s', (raw, expected) => {
    expect(canonicalMarkerCode(raw)).toBe(expected);
  });
});
