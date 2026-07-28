import { describe, expect, it } from 'vitest';
import { calculateAnchorCropBox } from './pdfAnchorCrop';

describe('calculateAnchorCropBox', () => {
  it('adds a 10-percent page margin and clamps to the page', () => {
    expect(calculateAnchorCropBox(
      { ymin: 20, xmin: 10, ymax: 40, xmax: 30 },
      1000,
      1000,
    )).toEqual({ ymin: 0, xmin: 0, ymax: 220, xmax: 220 });
  });

  it('enforces a 20-percent minimum crop around a tiny label', () => {
    const crop = calculateAnchorCropBox(
      { ymin: 490, xmin: 490, ymax: 510, xmax: 510 },
      1000,
      1000,
    );

    expect(crop.xmax - crop.xmin).toBeGreaterThanOrEqual(200);
    expect(crop.ymax - crop.ymin).toBeGreaterThanOrEqual(200);
  });

  it('preserves the expanded crop size when clamping to a far edge', () => {
    const crop = calculateAnchorCropBox(
      { ymin: 980, xmin: 980, ymax: 995, xmax: 995 },
      1000,
      1000,
    );

    expect(crop).toEqual({ ymin: 785, xmin: 785, ymax: 1000, xmax: 1000 });
  });
});
