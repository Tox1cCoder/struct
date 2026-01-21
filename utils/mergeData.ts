import { ColumnReinforcementData, FoundationColumnData, ExpandedReinforcementData } from '../types';
import { transformForExport } from './dataTransform';

/**
 * Merge reinforcement data with foundation-column mapping.
 * Links foundation to column types when both data sources are available.
 */
export function mergeReinforcementWithFoundation(
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[]
): ExpandedReinforcementData[] {
  // First, transform reinforcement data to expanded format
  const expandedData = transformForExport(reinforcementData);

  // If no foundation data, return expanded data without foundation field
  if (foundationData.length === 0) {
    return expandedData;
  }

  // Create a map of columnType -> foundation for quick lookup
  // Note: A foundation can have multiple columns, but we map column -> foundation
  const columnToFoundationMap = new Map<string, string>();
  
  for (const fc of foundationData) {
    // Handle comma-separated column types in foundation data
    const columns = fc.columnType.split(',').map(c => c.trim());
    for (const col of columns) {
      // If column already has a foundation, append (handle edge case of same column in multiple foundations)
      const existing = columnToFoundationMap.get(col);
      if (existing && existing !== fc.foundation) {
        columnToFoundationMap.set(col, `${existing}, ${fc.foundation}`);
      } else {
        columnToFoundationMap.set(col, fc.foundation);
      }
    }
  }

  // Merge foundation info into expanded data
  const result: ExpandedReinforcementData[] = [];

  for (const row of expandedData) {
    const constructionType = row.columnType;
    const foundationStr = columnToFoundationMap.get(constructionType);

    if (foundationStr) {
      // If found, check if it contains multiple foundations (comma separated)
      const foundations = foundationStr.split(',').map(f => f.trim());
      
      // Create a row for each foundation
      for (const foundation of foundations) {
        result.push({
          ...row,
          foundation: foundation
        });
      }
    } else {
      // No foundation found, keep as is (with empty foundation)
      result.push({
        ...row,
        foundation: ''
      });
    }
  }

  return result;
}
