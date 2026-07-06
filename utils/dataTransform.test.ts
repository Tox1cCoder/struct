import { describe, expect, it } from 'vitest';
import { transformForExport } from './dataTransform';

describe('transformForExport dimensions', () => {
  it('uses a single square column dimension for both lx and ly', () => {
    const [row] = transformForExport([
      {
        columnType: 'C1',
        columnDimensions: '660',
        mainReinforcement: '24-D25',
        hoopReinforcement: 'D13@100',
      },
    ]);

    expect(row).toMatchObject({
      dimensionWidth: '660',
      dimensionHeight: '660',
    });
  });
});
