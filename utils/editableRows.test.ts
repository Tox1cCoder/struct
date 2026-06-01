import { describe, expect, it } from 'vitest';
import { addManualRow, deleteWorkingRow, reconcileExtractedRows, updateWorkingRow } from './editableRows';
import { EditableRowMeta } from '../types';

type Row = EditableRowMeta & { value: string };

const extracted = (rowId: string, sourceKey: string, value: string): Row => ({
  rowId,
  sourceKey,
  sourceFileIds: ['file-a'],
  provenance: 'extracted',
  edited: false,
  value,
});

describe('editable result reconciliation', () => {
  it('does not overwrite an edited extracted row when async extraction completes later', () => {
    const state = updateWorkingRow(
      { rows: [extracted('row-a', 'key-a', 'original')], deletedSourceKeys: [] },
      'row-a',
      { value: 'corrected' },
    );
    const next = reconcileExtractedRows(state, [
      extracted('row-a', 'key-a', 'late model value'),
      extracted('row-b', 'key-b', 'new file value'),
    ]);
    expect(next.rows.map((row) => row.value)).toEqual(['corrected', 'new file value']);
  });

  it('keeps user-added rows while new extracted rows arrive', () => {
    const state = addManualRow({ rows: [], deletedSourceKeys: [] }, {
      rowId: 'manual-a',
      sourceKey: 'manual-a',
      sourceFileIds: [],
      provenance: 'manual',
      edited: true,
      value: 'manual',
    });
    expect(reconcileExtractedRows(state, [extracted('row-a', 'key-a', 'new')]).rows).toHaveLength(2);
  });

  it('does not restore a deleted extracted row during reconciliation', () => {
    const state = deleteWorkingRow(
      { rows: [extracted('row-a', 'key-a', 'old')], deletedSourceKeys: [] },
      'row-a',
    );
    expect(reconcileExtractedRows(state, [extracted('row-a', 'key-a', 'again')]).rows).toEqual([]);
  });
});
