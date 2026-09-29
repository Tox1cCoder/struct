import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageGeometry, PageShapeRect } from '../utils/pdfPageGeometry';

const mocks = vi.hoisted(() => ({
  loadPdfPageGeometries: vi.fn(),
  renderPdfPageRegions: vi.fn(),
  readCertifiedMarkerCodes: vi.fn(),
}));
const { loadPdfPageGeometries, renderPdfPageRegions, readCertifiedMarkerCodes } = mocks;

vi.mock('../utils/pdfPageLoader', () => ({
  loadPdfPageGeometries: mocks.loadPdfPageGeometries,
  renderPdfPageRegions: mocks.renderPdfPageRegions,
}));
vi.mock('./geminiService', () => ({ readCertifiedMarkerCodes: mocks.readCertifiedMarkerCodes }));

import {
  extractCertifiedPlacementMap,
  extractFoundationPlanGeometry,
  PriorityGeometryUnavailableError,
} from './foundationPriorityGeometry';

const file = (name: string) => new File([new Uint8Array(4)], name, { type: 'application/pdf' });

const blank: PdfPageGeometry = { width: 600, height: 800, texts: [], segments: [], rects: [] };

const text = (value: string, x0: number, y0: number) =>
  ({ text: value, rect: { x0, y0, x1: x0 + 4, y1: y0 + 3 } });

const planPage: PdfPageGeometry = {
  ...blank,
  texts: [
    text('X1', 98, 500),
    text('Y1', 48, 398),
    text('F1', 88, 286),
    text('FC1', 95, 295),
    text('F2', 500, 40),
  ],
  rects: [
    { rect: { x0: 90, y0: 290, x1: 110, y1: 310 }, lineWidth: 0.48, stroked: true, filled: false },
  ],
};

const marker = (x0: number): PageShapeRect => ({
  rect: { x0, y0: 200, x1: x0 + 20, y1: 216 },
  lineWidth: 0.06,
  stroked: true,
  filled: true,
  fill: [0, 255, 0],
});

const certifiedPage: PdfPageGeometry = {
  ...blank,
  segments: [
    { x0: 100, y0: 0, x1: 100, y1: 700, lineWidth: 0.3 },
    { x0: 400, y0: 0, x1: 400, y1: 700, lineWidth: 0.3 },
    { x0: 0, y0: 100, x1: 600, y1: 100, lineWidth: 0.3 },
    { x0: 0, y0: 600, x1: 600, y1: 600, lineWidth: 0.3 },
  ],
  rects: [marker(100), marker(150), marker(200)],
  texts: [text('C1', 108, 202)],
};

beforeEach(() => {
  loadPdfPageGeometries.mockReset();
  renderPdfPageRegions.mockReset();
  readCertifiedMarkerCodes.mockReset();
});

describe('extractFoundationPlanGeometry', () => {
  it('reads the plan without any model request and reports labels without footings', async () => {
    loadPdfPageGeometries.mockResolvedValue([planPage]);

    const { geometry, diagnostics } = await extractFoundationPlanGeometry(file('plan.pdf'));

    expect(geometry.footings).toEqual([
      { id: 'f0', label: 'F1', rect: { x0: 90, y0: 290, x1: 110, y1: 310 }, fcCode: 'FC1' },
    ]);
    expect(diagnostics).toMatchObject({
      role: 'plan',
      model: 'vector-geometry',
      anchorMode: 'native',
      cropCount: 0,
      warning: 'No footing outline found for: F2.',
      coverage: { missingLabels: ['F2'] },
    });
    expect(diagnostics.stages.totalMs).toBeGreaterThanOrEqual(0);
    expect(readCertifiedMarkerCodes).not.toHaveBeenCalled();
  });

  it('signals that geometry is unavailable when no page has grid labels and footings', async () => {
    loadPdfPageGeometries.mockResolvedValue([blank]);

    await expect(extractFoundationPlanGeometry(file('scan.pdf'))).rejects.toBeInstanceOf(
      PriorityGeometryUnavailableError,
    );
  });
});

describe('extractCertifiedPlacementMap', () => {
  it('reads only unlabelled markers from padded crops and applies their codes', async () => {
    loadPdfPageGeometries.mockResolvedValue([blank, certifiedPage]);
    renderPdfPageRegions.mockResolvedValue([
      { data: 'a', mimeType: 'image/png' },
      { data: 'b', mimeType: 'image/png' },
    ]);
    readCertifiedMarkerCodes.mockResolvedValue(new Map([['m1', 'C2'], ['m2', 'P1']]));

    const { placementMap, diagnostics } = await extractCertifiedPlacementMap(file('certified.pdf'));

    expect(renderPdfPageRegions).toHaveBeenCalledWith(expect.any(File), 2, [
      { x0: 148, y0: 198, x1: 172, y1: 218 },
      { x0: 198, y0: 198, x1: 222, y1: 218 },
    ]);
    expect(readCertifiedMarkerCodes).toHaveBeenCalledWith([
      { id: 'm1', data: 'a', mimeType: 'image/png' },
      { id: 'm2', data: 'b', mimeType: 'image/png' },
    ]);
    expect(placementMap.markers.map((entry) => entry.code)).toEqual(['C1', 'C2', 'P1']);
    expect(diagnostics).toMatchObject({
      role: 'certified',
      model: 'gemini-3.1-pro-preview',
      cropCount: 2,
    });
    expect(diagnostics.warning).toBeUndefined();
  });

  it('makes no model request when every marker has an embedded label', async () => {
    loadPdfPageGeometries.mockResolvedValue([{
      ...certifiedPage,
      texts: [text('C1', 108, 202), text('C3', 158, 202), text('P1', 208, 202)],
    }]);

    const { diagnostics } = await extractCertifiedPlacementMap(file('certified.pdf'));

    expect(readCertifiedMarkerCodes).not.toHaveBeenCalled();
    expect(diagnostics.model).toBe('vector-geometry');
  });

  it('keeps the map and warns when the label read fails', async () => {
    loadPdfPageGeometries.mockResolvedValue([certifiedPage]);
    renderPdfPageRegions.mockResolvedValue([
      { data: 'a', mimeType: 'image/png' },
      { data: 'b', mimeType: 'image/png' },
    ]);
    readCertifiedMarkerCodes.mockRejectedValue(new Error('quota exceeded'));

    const { placementMap, diagnostics } = await extractCertifiedPlacementMap(file('certified.pdf'));

    expect(placementMap.markers.map((entry) => entry.code)).toEqual(['C1', '', '']);
    expect(diagnostics.warning).toBe('Reading 2 certified marker label(s) failed: quota exceeded');
  });

  it('warns about markers the model could not read', async () => {
    loadPdfPageGeometries.mockResolvedValue([certifiedPage]);
    renderPdfPageRegions.mockResolvedValue([
      { data: 'a', mimeType: 'image/png' },
      { data: 'b', mimeType: 'image/png' },
    ]);
    readCertifiedMarkerCodes.mockResolvedValue(new Map([['m1', 'C2']]));

    const { diagnostics } = await extractCertifiedPlacementMap(file('certified.pdf'));

    expect(diagnostics.warning).toBe('1 certified marker label(s) could not be read.');
  });

  it('signals that geometry is unavailable when no page has colour markers on a grid', async () => {
    loadPdfPageGeometries.mockResolvedValue([blank]);

    await expect(extractCertifiedPlacementMap(file('scan.pdf'))).rejects.toBeInstanceOf(
      PriorityGeometryUnavailableError,
    );
  });
});
