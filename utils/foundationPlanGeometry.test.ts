import { describe, expect, it } from 'vitest';
import type { PageRect } from '../types';
import { buildFoundationPlanGeometry } from './foundationPlanGeometry';
import type { PageSegment, PageShapeRect, PageText, PdfPageGeometry } from './pdfPageGeometry';

const text = (value: string, x0: number, y0: number, width = 4, height = 3): PageText => ({
  text: value,
  rect: { x0, y0, x1: x0 + width, y1: y0 + height },
});

const box = (rect: PageRect, lineWidth = 0.48): PageShapeRect => ({
  rect,
  lineWidth,
  stroked: true,
  filled: false,
});

const dashedVertical = (x: number): PageSegment[] =>
  Array.from({ length: 20 }, (_, index) => ({
    x0: x, y0: index * 20, x1: x, y1: index * 20 + 12, lineWidth: 0.12,
  }));

const page = (parts: Partial<PdfPageGeometry>): PdfPageGeometry => ({
  width: 800,
  height: 600,
  texts: [],
  segments: [],
  rects: [],
  ...parts,
});

const gridTexts = [
  text('X1', 98, 500),
  text('X2', 198, 500),
  text('Y2', 48, 298.5),
  text('Y1', 48, 398.5),
];

describe('buildFoundationPlanGeometry', () => {
  it('names grid lines from label centres, ignoring nearby beam or wall lines', () => {
    const geometry = buildFoundationPlanGeometry(
      page({ texts: [...gridTexts, text('X1', 98, 90)], segments: dashedVertical(101.5) }),
      1,
    );

    expect(geometry.gridX).toEqual([
      { name: 'X1', position: 100 },
      { name: 'X2', position: 200 },
    ]);
    expect(geometry.gridY).toEqual([
      { name: 'Y2', position: 300 },
      { name: 'Y1', position: 400 },
    ]);
  });

  it('ignores a key plan that repeats grid labels at other positions', () => {
    const names = ['X1', 'X2', 'X3', 'X4', 'X5'];
    const mainRow = names.map((name, index) => text(name, 98 + index * 100, 500));
    const keyPlan = names.map((name, index) => text(name, 698 + index * 20, 60));
    const geometry = buildFoundationPlanGeometry(page({ texts: [...mainRow, ...keyPlan] }), 1);

    expect(geometry.gridX.map((line) => line.position)).toEqual([100, 200, 300, 400, 500]);
  });

  it('merges grid labels drawn in both a top and a bottom row', () => {
    const bottom = ['X1', 'X2', 'X3'].map((name, index) => text(name, 98 + index * 100, 500));
    const top = [text('X1', 98.5, 40), text('X2', 197.5, 40), text('X2A', 248, 40)];
    const geometry = buildFoundationPlanGeometry(page({ texts: [...bottom, ...top] }), 1);

    expect(geometry.gridX.map((line) => line.name)).toEqual(['X1', 'X2', 'X2A', 'X3']);
    expect(geometry.gridX.find((line) => line.name === 'X2A')?.position).toBe(250);
  });

  it('assigns each F label its own footing, giving a leader-offset label the remaining box', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [
          ...gridTexts,
          text('F1', 88, 286),
          text('F4', 158, 286),
          text('F9A(設計GL-1,500)', 172, 280, 26),
        ],
        rects: [
          box({ x0: 90, y0: 290, x1: 110, y1: 310 }),
          box({ x0: 160, y0: 290, x1: 170, y1: 300 }),
          box({ x0: 190, y0: 290, x1: 210, y1: 310 }),
          box({ x0: 157, y0: 289.5, x1: 162, y1: 295 }, 0.12),
        ],
      }),
      1,
    );

    expect(geometry.footings.map(({ label, rect }) => [label, rect.x0])).toEqual([
      ['F1', 90],
      ['F4', 160],
      ['F9A', 190],
    ]);
    expect(geometry.unassignedLabels).toEqual([]);
  });

  it('attaches an FC label to the footing that contains it or sits beside it', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [
          ...gridTexts,
          text('F1A', 88, 286),
          text('FC1', 95, 295),
          text('F9A', 138, 286),
          text('FC1', 134, 292),
        ],
        rects: [
          box({ x0: 90, y0: 290, x1: 110, y1: 310 }),
          box({ x0: 140, y0: 290, x1: 150, y1: 300 }),
        ],
      }),
      1,
    );

    expect(geometry.footings.map(({ label, fcCode }) => [label, fcCode])).toEqual([
      ['F1A', 'FC1'],
      ['F9A', 'FC1'],
    ]);
  });

  it('does not let a distant stray label claim an unlabelled footing', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1', 88, 286), text('F9', 190, 395)],
        rects: [
          box({ x0: 90, y0: 290, x1: 110, y1: 310 }),
          box({ x0: 190, y0: 290, x1: 210, y1: 310 }),
        ],
      }),
      1,
    );

    expect(geometry.footings.map((footing) => footing.label)).toEqual(['F1']);
    expect(geometry.unassignedLabels).toEqual(['F9']);
    expect(geometry.unlabelledFootings).toEqual([{ x0: 190, y0: 290, x1: 210, y1: 310 }]);
  });

  it('counts a label once when it is both native text and an SHX annotation', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1', 88, 286), text('F1', 88.2, 286.1)],
        rects: [
          box({ x0: 90, y0: 290, x1: 110, y1: 310 }),
          box({ x0: 112, y0: 290, x1: 122, y1: 300 }),
        ],
      }),
      1,
    );

    expect(geometry.footings.map((footing) => footing.rect.x0)).toEqual([90]);
    expect(geometry.unlabelledFootings).toEqual([{ x0: 112, y0: 290, x1: 122, y1: 300 }]);
  });

  it('does not report pedestal squares nested inside a labelled footing as unlabelled', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1A', 88, 286)],
        rects: [
          box({ x0: 90, y0: 290, x1: 110, y1: 310 }),
          box({ x0: 97, y0: 297, x1: 103, y1: 303 }),
        ],
      }),
      1,
    );

    expect(geometry.unlabelledFootings).toEqual([]);
  });

  it('reports labels that have no footing nearby', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1', 88, 286), text('F2', 600, 100)],
        rects: [box({ x0: 90, y0: 290, x1: 110, y1: 310 })],
      }),
      1,
    );

    expect(geometry.footings.map((footing) => footing.label)).toEqual(['F1']);
    expect(geometry.unassignedLabels).toEqual(['F2']);
  });

  it('accepts a footing drawn with a white mask fill', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1', 88, 286)],
        rects: [
          { ...box({ x0: 90, y0: 290, x1: 110, y1: 310 }), filled: true, fill: [255, 255, 255] },
        ],
      }),
      1,
    );

    expect(geometry.footings.map((footing) => footing.label)).toEqual(['F1']);
  });

  it('ignores coloured fills and page-sized frames when looking for footings', () => {
    const geometry = buildFoundationPlanGeometry(
      page({
        texts: [...gridTexts, text('F1', 88, 286)],
        rects: [
          { ...box({ x0: 90, y0: 290, x1: 110, y1: 310 }), filled: true, fill: [0, 255, 0] },
          box({ x0: 10, y0: 10, x1: 790, y1: 590 }),
        ],
      }),
      1,
    );

    expect(geometry.footings).toEqual([]);
    expect(geometry.unassignedLabels).toEqual(['F1']);
  });
});
