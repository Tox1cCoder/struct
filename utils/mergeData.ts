import { ColumnReinforcementData, FoundationColumnData, ExpandedReinforcementData } from '../types';
import { transformForExport } from './dataTransform';

/**
 * Merge reinforcement data with foundation-column mapping.
 * Links foundation to column types when both data sources are available.
 *
 * Behavior:
 * - If foundation data is present, ALL foundation entries are shown (even if no PDF match).
 * - Rows without a PDF match show blank for reinforcement fields.
 * - B(柱) and H(柱) from the foundation-column linking are always shown when present.
 */
export function mergeReinforcementWithFoundation(
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[]
): ExpandedReinforcementData[] {
  // First, transform reinforcement data to expanded format
  const expandedData = transformForExport(reinforcementData);

  // If no foundation data provided — fall back to previous behaviour
  if (foundationData.length === 0) {
    return expandedData.map(row => ({ ...row, foundation: '' }));
  }

  // Build a lookup: columnType -> list of { foundation, bColumn, hColumn }
  const columnToFoundations = new Map<string, Array<{ foundation: string; bColumn?: string; hColumn?: string }>>();
  for (const fc of foundationData) {
    const columns = fc.columnType.split(',').map(c => c.trim());
    for (const col of columns) {
      const existing = columnToFoundations.get(col) ?? [];
      // Avoid duplicate foundation entries
      if (!existing.find(e => e.foundation === fc.foundation)) {
        existing.push({ foundation: fc.foundation, bColumn: fc.bColumn, hColumn: fc.hColumn });
      }
      columnToFoundations.set(col, existing);
    }
  }

  // Build a lookup for reinforcement data by columnType for quick access
  const reinfByColumnType = new Map<string, ExpandedReinforcementData>();
  for (const row of expandedData) {
    reinfByColumnType.set(row.columnType, row);
  }

  const result: ExpandedReinforcementData[] = [];

  // Iterate all foundation entries to guarantee every F is shown
  for (const fc of foundationData) {
    const columns = fc.columnType.split(',').map(c => c.trim());
    for (const col of columns) {
      const reinfRow = reinfByColumnType.get(col);

      if (reinfRow) {
        result.push({
          ...reinfRow,
          foundation: fc.foundation,
          bColumn: fc.bColumn,
          hColumn: fc.hColumn,
        });
      } else {
        // No PDF data for this column – show a blank row
        result.push({
          foundation: fc.foundation,
          columnType: col,
          bColumn: fc.bColumn,
          hColumn: fc.hColumn,
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
