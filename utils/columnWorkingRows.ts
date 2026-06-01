import { ColumnReinforcementData, EditableExpandedReinforcementData, FoundationColumnData } from '../types';
import { mergeReinforcementWithFoundation } from './mergeData';

export const buildColumnWorkingRows = (
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[],
): EditableExpandedReinforcementData[] =>
  mergeReinforcementWithFoundation(reinforcementData, foundationData).map((row) => {
    const fileId = row.sourceFileId ?? 'linked';
    const sourceKey = `column:${fileId}:${row.foundation ?? ''}:${row.columnType}`;
    return {
      ...row,
      rowId: sourceKey,
      sourceKey,
      sourceFileIds: row.sourceFileId ? [row.sourceFileId] : [],
      provenance: 'extracted',
      edited: false,
    };
  });
