import { FoundationColumnData } from '../types';

/**
 * Parse foundation-column text input.
 * - Removes duplicate lines
 * - Only keeps foundations matching Fxxx pattern (removes FK, FW, etc.)
 * - Removes parenthetical content like (SGL-***)
 * - Parses "F11 : C1" format
 */
export function parseFoundationColumnText(input: string): FoundationColumnData[] {
  if (!input.trim()) return [];

  const lines = input.split('\n');
  const seen = new Set<string>();
  const result: FoundationColumnData[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Parse "Foundation : Column" format
    const match = trimmedLine.match(/^([^:]+)\s*:\s*(.+)$/);
    if (!match) continue;

    let foundation = match[1].trim();
    const columnType = match[2].trim();

    // Remove parenthetical content (e.g., "(SGL-***)", "(SGL-1,495)")
    foundation = foundation.replace(/\s*\([^)]*\)/g, '').trim();

    // Only keep foundations matching F followed by digits and optional letter (F11, F11A, F112A)
    // Reject FK, FW, or other patterns
    if (!/^F\d+[A-Z]?$/i.test(foundation)) continue;

    // Create unique key for deduplication
    const key = `${foundation}:${columnType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ foundation, columnType });
  }

  // Sort by foundation alphanumerically
  result.sort((a, b) => {
    // Extract numeric part for proper sorting (F1, F2, F10, F11, etc.)
    const aMatch = a.foundation.match(/^F(\d+)([A-Z]?)$/i);
    const bMatch = b.foundation.match(/^F(\d+)([A-Z]?)$/i);
    
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      if (aNum !== bNum) return aNum - bNum;
      // If numbers are equal, sort by letter suffix
      return (aMatch[2] || '').localeCompare(bMatch[2] || '');
    }
    
    return a.foundation.localeCompare(b.foundation);
  });

  return result;
}
