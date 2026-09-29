import { describe, expect, it } from 'vitest';
import type { PageRect } from '../types';
import { buildCertifiedPlacementMap } from './certifiedPlacementMap';
import type { PageSegment, PageShapeRect, PdfPageGeometry, Rgb } from './pdfPageGeometry';

const longLine = (orientation: 'vertical' | 'horizontal', at: number): PageSegment =>
  orientation === 'vertical'
    ? { x0: at, y0: 100, x1: at, y1: 700, lineWidth: 0.3 }
    : { x0: 250, y0: at, x1: 1000, y1: at, lineWidth: 0.3 };

const filled = (rect: PageRect, fill: Rgb): PageShapeRect => ({
  rect,
  fill,
  filled: true,
  stroked: true,
  lineWidth: 0.06,
});

const page = (rects: PageShapeRect[]): PdfPageGeometry => ({
  width: 1191,
  height: 842,
  texts: [],
  segments: [
    longLine('vertical', 322.3),
    longLine('vertical', 323.0),
    longLine('vertical', 602.4),
    longLine('horizontal', 171.2),
    longLine('horizontal', 655.8),
  ],
  rects,
});

describe('buildCertifiedPlacementMap', () => {
  it('collects grid-line candidates, merging CAD double lines', () => {
    const map = buildCertifiedPlacementMap(page([]), 1);
    expect(map.gridCandidates.x.map(Math.round)).toEqual([323, 602]);
    expect(map.gridCandidates.y).toEqual([171.2, 655.8]);
    expect(map).toMatchObject({ page: 1, pageWidth: 1191, pageHeight: 842 });
  });

  it('keeps coloured marker fills inside the grid area and skips black, legend and duplicates', () => {
    const marker = { x0: 313, y0: 204, x1: 333, y1: 221 };
    const map = buildCertifiedPlacementMap(
      page([
        filled(marker, [0, 255, 0]),
        filled(marker, [0, 255, 0]),
        filled({ x0: 400, y0: 300, x1: 407, y1: 307 }, [255, 0, 255]),
        filled({ x0: 400, y0: 400, x1: 401, y1: 401 }, [0, 0, 0]),
        filled({ x0: 40, y0: 480, x1: 88, y1: 497 }, [0, 255, 0]),
        filled({ x0: 300, y0: 150, x1: 700, y1: 650 }, [255, 0, 0]),
      ]),
      1,
    );

    expect(map.markers).toEqual([
      { id: 'm0', rect: marker, fill: [0, 255, 0], code: '' },
      { id: 'm1', rect: { x0: 400, y0: 300, x1: 407, y1: 307 }, fill: [255, 0, 255], code: '' },
    ]);
  });

  it('reads a marker code from the one code-like text centred inside it', () => {
    const geometry = page([
      filled({ x0: 313, y0: 204, x1: 333, y1: 221 }, [0, 255, 0]),
      filled({ x0: 400, y0: 300, x1: 407, y1: 307 }, [255, 0, 255]),
      filled({ x0: 450, y0: 300, x1: 470, y1: 317 }, [255, 0, 0]),
      filled({ x0: 500, y0: 300, x1: 520, y1: 317 }, [0, 255, 0]),
    ]);
    geometry.texts = [
      { text: "1'C1", rect: { x0: 322, y0: 205, x1: 330, y1: 210 } },
      { text: '柱面', rect: { x0: 315, y0: 212, x1: 320, y1: 216 } },
      { text: 'P1', rect: { x0: 402, y0: 300, x1: 406, y1: 304 } },
      { text: 'C5', rect: { x0: 452, y0: 301, x1: 458, y1: 305 } },
      { text: 'C6', rect: { x0: 460, y0: 301, x1: 466, y1: 305 } },
    ];

    const map = buildCertifiedPlacementMap(geometry, 1);

    expect(map.markers.map((marker) => marker.code)).toEqual(['1C1', 'P1', '', '']);
  });
});
