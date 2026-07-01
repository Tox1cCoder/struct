import { ColumnReinforcementData, EditableExpandedReinforcementData, FoundationColumnData } from '../types';
import { mergeReinforcementWithFoundation } from './mergeData';

export const buildColumnWorkingRows = (
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[],
): EditableExpandedReinforcementData[] => {
  // Track how many times each base key has appeared so legitimate duplicates
  // (e.g. the same columnType on multiple pages when no foundation linking exists)
  // each get a unique reconciliation identity. Without this, duplicate rows share a
  // rowId/sourceKey — editing one edits both, and reconciliation collapses them (data loss).
  const occurrences = new Map<string, number>();
  return mergeReinforcementWithFoundation(reinforcementData, foundationData).map((row) => {
    const fileId = row.sourceFileId ?? 'linked';
    const baseKey = `column:${fileId}:${row.foundation ?? ''}:${row.columnType}`;
    const occurrence = occurrences.get(baseKey) ?? 0;
    occurrences.set(baseKey, occurrence + 1);
    // First occurrence keeps the bare key so the common (no-duplicate) case is unchanged.
    const sourceKey = occurrence === 0 ? baseKey : `${baseKey}#${occurrence}`;
    return {
      ...row,
      rowId: sourceKey,
      sourceKey,
      sourceFileIds: row.sourceFileId ? [row.sourceFileId] : [],
      provenance: 'extracted',
      edited: false,
    };
  });
};
