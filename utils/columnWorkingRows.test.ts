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

  it('gives duplicate column types distinct keys so edits do not contaminate each other', () => {
    // No foundation linking + same columnType twice (e.g. "C1" on two PDF pages).
    const rows = buildColumnWorkingRows(
      [
        { columnType: 'C1', columnDimensions: '700x700', mainReinforcement: '16-D22', hoopReinforcement: 'D13@150', sourceFileId: 'pdf-1' },
        { columnType: 'C1', columnDimensions: '700x700', mainReinforcement: '20-D22', hoopReinforcement: 'D13@100', sourceFileId: 'pdf-1' },
      ],
      [],
    );

    expect(rows).toHaveLength(2);
    const keys = new Set(rows.map((r) => r.rowId));
    expect(keys.size).toBe(2);
    expect(rows.map((r) => r.sourceKey)).toEqual([...keys]);
  });
});
