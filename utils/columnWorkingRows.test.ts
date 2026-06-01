import { describe, expect, it } from 'vitest';
import { buildColumnWorkingRows } from './columnWorkingRows';

describe('buildColumnWorkingRows', () => {
  it('creates stable source keys for report-ready merged rows', () => {
    const rows = buildColumnWorkingRows(
      [{ columnType: 'FC1', columnDimensions: '700x700', mainReinforcement: '24-D25', hoopReinforcement: 'D13@100', sourceFileId: 'pdf-1' }],
      [{ foundation: 'F1', columnType: 'FC1' }],
    );
    expect(rows[0]).toMatchObject({ foundation: 'F1', columnType: 'FC1', provenance: 'extracted', edited: false });
    expect(rows[0].sourceKey).toContain('pdf-1');
  });
});
