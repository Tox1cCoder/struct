import { EditableRowMeta, EditableRowsState } from '../types';

export const reconcileExtractedRows = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  incoming: T[],
): EditableRowsState<T> => {
  const lockedByKey = new Map(
    state.rows
      .filter((row) => row.edited || row.provenance === 'manual')
      .map((row) => [row.sourceKey, row]),
  );
  const deleted = new Set(state.deletedSourceKeys);
  const rows = incoming
    .filter((row) => !deleted.has(row.sourceKey))
    .map((row) => lockedByKey.get(row.sourceKey) ?? row);

  for (const locked of lockedByKey.values()) {
    if (!rows.some((row) => row.sourceKey === locked.sourceKey)) {
      rows.push(locked);
    }
  }

  return { ...state, rows };
};

export const updateWorkingRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  rowId: string,
  patch: Partial<Omit<T, keyof EditableRowMeta>>,
): EditableRowsState<T> => ({
  ...state,
  rows: state.rows.map((row) => row.rowId === rowId ? { ...row, ...patch, edited: true } : row),
});

export const addManualRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  row: T,
): EditableRowsState<T> => ({ ...state, rows: [...state.rows, row] });

export const deleteWorkingRow = <T extends EditableRowMeta>(
  state: EditableRowsState<T>,
  rowId: string,
): EditableRowsState<T> => {
  const removed = state.rows.find((row) => row.rowId === rowId);
  if (!removed) return state;
  return {
    rows: state.rows.filter((row) => row.rowId !== rowId),
    deletedSourceKeys: removed.provenance === 'extracted'
      ? [...new Set([...state.deletedSourceKeys, removed.sourceKey])]
      : state.deletedSourceKeys,
  };
};
