import { describe, expect, it } from 'vitest';
import { extractPdfPageGeometry, type PdfPageLike } from './pdfPageGeometry';

const OPS = {
  setLineWidth: 2,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  endPath: 28,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginAnnotation: 80,
  endAnnotation: 81,
  constructPath: 91,
};

const UNROTATED = [1, 0, 0, -1, 0, 800];

const fakePage = (
  ops: Array<[number, unknown]>,
  textItems: unknown[] = [],
  transform = UNROTATED,
): PdfPageLike => ({
  getViewport: () => ({ width: 600, height: 800, transform }),
  getOperatorList: async () => ({
    fnArray: ops.map(([fn]) => fn),
    argsArray: ops.map(([, args]) => args),
  }),
  getTextContent: async () => ({ items: textItems }),
});

const path = (ops: number[], coords: number[]): [number, unknown] => [
  OPS.constructPath,
  [ops, coords, []],
];

describe('extractPdfPageGeometry', () => {
  it('returns a filled rectangle op in display space with its fill colour', async () => {
    const page = fakePage([
      [OPS.setFillRGBColor, new Uint8ClampedArray([255, 0, 255])],
      path([OPS.rectangle], [100, 700, 20, 10]),
      [OPS.fill, null],
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.rects).toEqual([
      {
        rect: { x0: 100, y0: 90, x1: 120, y1: 100 },
        lineWidth: 1,
        stroked: false,
        filled: true,
        fill: [255, 0, 255],
      },
    ]);
  });

  it('treats a closed moveTo/lineTo quad as a stroked rectangle with scaled width', async () => {
    const page = fakePage([
      [OPS.save, null],
      [OPS.transform, [0.5, 0, 0, 0.5, 0, 0]],
      [OPS.setLineWidth, [0.96]],
      path(
        [OPS.moveTo, OPS.lineTo, OPS.lineTo, OPS.lineTo, OPS.lineTo],
        [200, 200, 240, 200, 240, 260, 200, 260, 200, 200],
      ),
      [OPS.stroke, null],
      [OPS.restore, null],
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.rects).toHaveLength(1);
    expect(geometry.rects[0].rect).toEqual({ x0: 100, y0: 670, x1: 120, y1: 700 });
    expect(geometry.rects[0].lineWidth).toBeCloseTo(0.48);
    expect(geometry.rects[0].stroked).toBe(true);
    expect(geometry.segments).toHaveLength(4);
  });

  it('restores the transform after restore and form XObjects', async () => {
    const page = fakePage([
      [OPS.paintFormXObjectBegin, [[1, 0, 0, 1, 50, 0], [0, 0, 10, 10]]],
      path([OPS.moveTo, OPS.lineTo], [0, 10, 0, 90]),
      [OPS.stroke, null],
      [OPS.paintFormXObjectEnd, null],
      path([OPS.moveTo, OPS.lineTo], [0, 10, 0, 90]),
      [OPS.stroke, null],
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.segments.map((segment) => segment.x0)).toEqual([50, 0]);
    expect(geometry.segments[0]).toMatchObject({ y0: 790, y1: 710 });
  });

  it('paints nothing for clip-only paths ending in endPath', async () => {
    const page = fakePage([
      path([OPS.rectangle], [0, 0, 600, 800]),
      [OPS.endPath, null],
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.rects).toEqual([]);
    expect(geometry.segments).toEqual([]);
  });

  it('applies page rotation from the viewport transform', async () => {
    const rotated = [0, -1, -1, 0, 842, 595];
    const page = fakePage(
      [path([OPS.rectangle], [100, 200, 10, 20]), [OPS.stroke, null]],
      [],
      rotated,
    );

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.rects[0].rect).toEqual({ x0: 622, y0: 485, x1: 642, y1: 495 });
  });

  it('draws annotation appearances from the base transform, not page content state', async () => {
    const annotation = (id: string): [number, unknown] => [
      OPS.beginAnnotation,
      [id, [460, 180, 470, 190], [1, 0, 0, 1, 460, 180], [1, 0, 0, 1, -460, -180], false],
    ];
    const page = fakePage([
      [OPS.transform, [0.06, 0, 0, 0.06, 0, 0]],
      annotation('1R'),
      [OPS.transform, [2, 0, 0, 2, 0, 0]],
      [OPS.endAnnotation, []],
      annotation('2R'),
      [OPS.setFillRGBColor, new Uint8ClampedArray([255, 0, 255])],
      path([OPS.rectangle], [464, 184, 7, 7]),
      [OPS.fill, null],
      [OPS.endAnnotation, []],
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.rects.map((shape) => shape.rect)).toEqual([
      { x0: 464, y0: 609, x1: 471, y1: 616 },
    ]);
  });

  it('adds AutoCAD SHX text annotations as text, ignoring other annotations', async () => {
    const square = (title: string, contents: string, rect: number[]) =>
      ({ subtype: 'Square', titleObj: { str: title }, contentsObj: { str: contents }, rect });
    const page: PdfPageLike = {
      ...fakePage([]),
      getAnnotations: async () => [
        square('AutoCAD SHX Text', 'C1', [317, 136, 326, 144]),
        square('reviewer', 'check', [0, 0, 10, 10]),
        square('AutoCAD SHX Text', ' ', [0, 0, 10, 10]),
      ],
    };

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.texts).toEqual([
      { text: 'C1', rect: { x0: 317, y0: 656, x1: 326, y1: 664 } },
    ]);
  });

  it('returns text boxes that extend upward from the baseline', async () => {
    const page = fakePage([], [
      { str: 'F1', transform: [3, 0, 0, 3, 100, 700], width: 4, height: 3 },
      { str: '', transform: [3, 0, 0, 3, 0, 0], width: 0, height: 3 },
    ]);

    const geometry = await extractPdfPageGeometry(page, OPS);

    expect(geometry.texts).toEqual([{ text: 'F1', rect: { x0: 100, y0: 97, x1: 104, y1: 100 } }]);
  });
});
