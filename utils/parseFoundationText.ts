import { FoundationColumnData } from '../types';

/**
 * Parse foundation-column text input.
 * Supports two formats:
 * 1. Old format: "F11 : C1" (Foundation : Column)
 * 2. New format: "F1A : C3 : -" or "F2A : - : FC1" (Foundation : Column : Foundation-Column)
 * 
 * Rules:
 * - If Column (C) is provided (not "-"), Foundation-Column (FC) should be "-"
 * - If Foundation-Column (FC) is provided (not "-"), Column (C) should be "-"
 * - If column type starts with "F" (not FC or C), auto-fill foundation with same name
 * - Removes duplicate lines
 * - Only keeps foundations matching Fxxx pattern (removes FK, FW, etc.)
 * - Removes parenthetical content like (SGL-***)
 */
export function parseFoundationColumnText(input: string): FoundationColumnData[] {
  if (!input.trim()) return [];

  const lines = input.split('\n');
  const seen = new Set<string>();
  const result: FoundationColumnData[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Split by colon to handle both 2-field and 3-field formats
    const parts = trimmedLine.split(':').map(p => p.trim());
    
    if (parts.length < 2) continue;

    let foundation = parts[0];
    let columnType = '';

    // Remove parenthetical content from foundation (e.g., "(SGL-***)", "(SGL-1,495)")
    foundation = foundation.replace(/\s*\([^)]*\)/g, '').trim();

    // Determine which format we're dealing with
    if (parts.length === 2) {
      // Old format: "F11 : C1"
      columnType = parts[1];
    } else if (parts.length >= 3) {
      // New format: "F1A : C3 : -" or "F2A : - : FC1"
      const cValue = parts[1];
      const fcValue = parts[2];

      // Determine which value to use based on "-" placeholders
      if (cValue !== '-' && cValue !== '') {
        // Use C value
        columnType = cValue;
      } else if (fcValue !== '-' && fcValue !== '') {
        // Use FC value
        columnType = fcValue;
      } else {
        // Both are blank or "-", skip this line
        continue;
      }
    }

    // Clean up columnType
    columnType = columnType.trim();
    if (!columnType) continue;

    // Special case: If column type starts with F (but not FC or C), auto-fill foundation
    if (/^F\d+[A-Z]?$/i.test(columnType)) {
      // This is an F-prefix column (like F7), use it as both foundation and column
      foundation = columnType;
    }

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
