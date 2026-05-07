import { ColumnReinforcementData, FoundationColumnData, ExpandedReinforcementData } from '../types';
import { transformForExport } from './dataTransform';

const isFcCode = (value: string) => /^FC/i.test(value.trim());

/**
 * Merge reinforcement data with foundation-column mapping.
 *
 * Behavior:
 * - When foundation data is present, every foundation is shown (even if no PDF match).
 * - Rows without a PDF match show blank reinforcement fields.
 * - B(柱) and H(柱) from the foundation-column linking are always shown when present.
 * - When a foundation has both an FC code and a plain C/CP/etc. code, the FC code wins
 *   and the non-FC entries for that foundation are dropped.
 */
export function mergeReinforcementWithFoundation(
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[]
): ExpandedReinforcementData[] {
  const expandedData = transformForExport(reinforcementData);

  if (foundationData.length === 0) {
    return expandedData.map(row => ({ ...row, foundation: '' }));
  }

  const reinfByColumnType = new Map<string, ExpandedReinforcementData>();
  for (const row of expandedData) {
    reinfByColumnType.set(row.columnType, row);
  }

  // Group columns per foundation across ALL entries (since the user may have multiple lines
  // for one F, e.g. "F1: C1" and "F1: FC1"). Track explicit metadata (bColumn/hColumn) per
  // (foundation, column) pair so the right dimensions stay attached after FC filtering.
  type Meta = { bColumn?: string; hColumn?: string };
  const foundationToColumns = new Map<string, Map<string, Meta>>();

  for (const fc of foundationData) {
    const columns = fc.columnType.split(',').map(c => c.trim()).filter(Boolean);
    const bucket = foundationToColumns.get(fc.foundation) ?? new Map<string, Meta>();
    for (const col of columns) {
      if (!bucket.has(col)) {
        bucket.set(col, { bColumn: fc.bColumn, hColumn: fc.hColumn });
      }
    }
    foundationToColumns.set(fc.foundation, bucket);
  }

  // Apply FC > C priority per foundation: if any FC code exists, drop non-FC entries.
  for (const [foundation, columns] of foundationToColumns) {
    const hasFc = [...columns.keys()].some(isFcCode);
    if (hasFc) {
      for (const col of [...columns.keys()]) {
        if (!isFcCode(col)) columns.delete(col);
      }
      foundationToColumns.set(foundation, columns);
    }
  }

  const result: ExpandedReinforcementData[] = [];

  for (const [foundation, columns] of foundationToColumns) {
    for (const [col, meta] of columns) {
      const reinfRow = reinfByColumnType.get(col);
      if (reinfRow) {
        result.push({
          ...reinfRow,
          foundation,
          bColumn: meta.bColumn,
          hColumn: meta.hColumn,
        });
      } else {
        result.push({
          foundation,
          columnType: col,
          bColumn: meta.bColumn,
          hColumn: meta.hColumn,
          dimensionWidth: '',
          dimensionHeight: '',
          mainReinforcementCount: '',
          mainReinforcementSize: '',
          hoopReinforcementSize: '',
          hoopReinforcementSpacing: '',
        });
      }
    }
  }

  return result;
}
