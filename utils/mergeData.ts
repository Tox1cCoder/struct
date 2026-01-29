import { ColumnReinforcementData, FoundationColumnData, ExpandedReinforcementData } from '../types';
import { transformForExport } from './dataTransform';

/**
 * Merge reinforcement data with foundation-column mapping.
 * Links foundation to column types when both data sources are available.
 * Auto-fills foundation for F-prefixed columns (F7, F1A, etc.) when no mapping exists.
 */
export function mergeReinforcementWithFoundation(
  reinforcementData: ColumnReinforcementData[],
  foundationData: FoundationColumnData[]
): ExpandedReinforcementData[] {
  // First, transform reinforcement data to expanded format
  const expandedData = transformForExport(reinforcementData);

  // Create a map of columnType -> foundation for quick lookup
  // Note: A foundation can have multiple columns, but we map column -> foundation
  const columnToFoundationMap = new Map<string, string>();
  
  // Build the mapping from foundation data (if provided)
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
    let foundationStr = columnToFoundationMap.get(constructionType);

    // Auto-fill: If no foundation mapping exists and column type matches F pattern (F7, F1A, etc.)
    // then use the column type as the foundation
    if (!foundationStr && /^F\d+[A-Z]?$/i.test(constructionType)) {
      foundationStr = constructionType;
    }

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
