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

  const squareMatch = value.match(/^([\d,]+)$/);
  if (squareMatch) {
    const side = squareMatch[1].replace(/,/g, '');
    return { width: side, height: side };
  }

  // Fallback: return original value in width only
  return { width: value, height: '' };
}

/**
 * Read a supplementary hoop tie count off a model response.
 *
 * The count is a number of drawn lines, so anything that is not a non-negative
 * whole number — a missing field, prose, a fraction — means none were counted
 * and reads as "0" rather than propagating an unusable value.
 */
export function parseTieCount(value: unknown): string {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return '0';
  return String(n);
}

/**
 * Split a perimeter main-bar count into per-direction counts.
 *
 * Column-stub bars run around the perimeter, so the total and the per-side
 * counts are tied together by total = 2 × (nx + ny) − 4: each of the four corner
 * bars is counted by an X side and a Y side at once. That fixes nx + ny but not
 * how it divides, so the gaps between bars are shared out in proportion to the
 * side lengths — which is the same as keeping the bar pitch even all the way
 * round, and hands the longer side the extra bar.
 *
 * The drawings state only the total, so this is a reconstruction, not a reading.
 * Anything that cannot sit on a perimeter — an odd total, fewer than four bars,
 * a count that never parsed, a missing side length — returns blanks instead of a
 * number nobody can justify.
 */
export function deriveMainBarSplit(
  count: string,
  width: string,
  height: string,
): { x: string; y: string } {
  const blank = { x: '', y: '' };

  const total = Number(count);
  if (!Number.isInteger(total) || total < 4 || total % 2 !== 0) return blank;

  const lx = Number(width);
  const ly = Number(height);
  if (!(lx > 0) || !(ly > 0)) return blank;

  const perSide = total / 2 + 2; // nx + ny
  const gaps = perSide - 2; // (nx − 1) + (ny − 1)
  const gapsX = Math.min(Math.max(Math.round((gaps * lx) / (lx + ly)), 1), gaps - 1);

  return { x: String(gapsX + 1), y: String(gaps - gapsX + 1) };
}

/**
 * Keep a row's derived split in step with a hand edit.
 *
 * An edit to the total or to either side length invalidates the split, so it is
 * recomputed. An edit to the split itself is the user overruling the
 * reconstruction and passes through untouched.
 */
export function withDerivedMainBarSplit(
  row: ExpandedReinforcementData,
  patch: Partial<ExpandedReinforcementData>,
): Partial<ExpandedReinforcementData> {
  const derivedFrom = ['mainReinforcementCount', 'dimensionWidth', 'dimensionHeight'] as const;
  if (!derivedFrom.some((field) => field in patch)) return patch;

  const next = { ...row, ...patch };
  const split = deriveMainBarSplit(
    next.mainReinforcementCount,
    next.dimensionWidth,
    next.dimensionHeight,
  );
  return { ...patch, mainReinforcementCountX: split.x, mainReinforcementCountY: split.y };
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

    const mainBarSplit = deriveMainBarSplit(mainReinf.count, dimensions.width, dimensions.height);

    // Create a row for each column type
    for (const colType of columnTypes) {
      result.push({
        columnType: colType,
        dimensionWidth: dimensions.width,
        dimensionHeight: dimensions.height,
        mainReinforcementCount: mainReinf.count,
        mainReinforcementCountX: mainBarSplit.x,
        mainReinforcementCountY: mainBarSplit.y,
        mainReinforcementSize: mainReinf.size,
        hoopReinforcementSize: hoopReinf.size,
        hoopReinforcementSpacing: hoopReinf.spacing,
        // No cross-section figure to count means no supplementary ties.
        hoopSupplementaryX: item.hoopSupplementaryX ?? '0',
        hoopSupplementaryY: item.hoopSupplementaryY ?? '0',
        sourceFileId: item.sourceFileId,
        page: item.page,
        bbox: item.bbox,
      });
    }
  }

  return result;
}

