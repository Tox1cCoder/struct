import { ColumnReinforcementData, ExpandedReinforcementData } from '../types';

/**
 * Parse main reinforcement value (e.g., "32-D25" → { count: "32", size: "D25" })
 */
export function parseMainReinforcement(value: string): { count: string; size: string } {
  // Match patterns like "32-D25", "24-D22", etc.
  const match = value.match(/^(\d+)-([A-Z]\d+)$/i);
  if (match) {
    return { count: match[1], size: match[2] };
  }
  // Fallback: return original value in both fields
  return { count: value, size: '' };
}

/**
 * Parse hoop reinforcement value (e.g., "D13@100" → { size: "D13", spacing: "100" })
 */
export function parseHoopReinforcement(value: string): { size: string; spacing: string } {
  // Match patterns like "D13@100", "D10@150", etc.
  const match = value.match(/^([A-Z]\d+)@(\d+)$/i);
  if (match) {
    return { size: match[1], spacing: match[2] };
  }
  // Fallback: return original value in both fields
  return { size: value, spacing: '' };
}

/**
 * Parse dimensions value (e.g., "600x600" or "600×600" → { width: "600", height: "600" })
 */
export function parseDimensions(value: string): { width: string; height: string } {
  // Match patterns like "600x600", "770×770", "1,400×1,400", etc.
  // Supports both 'x' and '×' (Unicode multiplication sign)
  const match = value.match(/^([\d,]+)\s*[x×]\s*([\d,]+)$/i);
  if (match) {
    return { width: match[1].replace(/,/g, ''), height: match[2].replace(/,/g, '') };
  }
  // Fallback: return original value in width only
  return { width: value, height: '' };
}

/**
 * Split column types (e.g., "F21C,F23,F24" → ["F21C", "F23", "F24"])
 */
export function splitColumnTypes(columnType: string): string[] {
  // Split by comma and trim whitespace
  return columnType.split(',').map(type => type.trim()).filter(type => type.length > 0);
}

/**
 * Transform data for Excel export:
 * - Split column types into separate rows
 * - Parse dimensions into width and height
 * - Parse main reinforcement into count and size
 * - Parse hoop reinforcement into size and spacing
 */
export function transformForExport(data: ColumnReinforcementData[]): ExpandedReinforcementData[] {
  const result: ExpandedReinforcementData[] = [];

  for (const item of data) {
    const columnTypes = splitColumnTypes(item.columnType);
    const dimensions = parseDimensions(item.columnDimensions);
    const mainReinf = parseMainReinforcement(item.mainReinforcement);
    const hoopReinf = parseHoopReinforcement(item.hoopReinforcement);

    // Create a row for each column type
    for (const colType of columnTypes) {
      result.push({
        columnType: colType,
        dimensionWidth: dimensions.width,
        dimensionHeight: dimensions.height,
        mainReinforcementCount: mainReinf.count,
        mainReinforcementSize: mainReinf.size,
        hoopReinforcementSize: hoopReinf.size,
        hoopReinforcementSpacing: hoopReinf.spacing,
      });
    }
  }

  return result;
}

