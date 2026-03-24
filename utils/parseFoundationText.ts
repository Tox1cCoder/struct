import { FoundationColumnData } from '../types';

/**
 * Parse foundation-column text input.
 * Supports formats:
 * 1. Old format: "F11 : C1" (Foundation : Column)
 * 2. 3-field format: "F1A : C3 : -" or "F2A : - : FC1" (Foundation : Column : Foundation-Column)
 * 3. New 4-field format: "F110A : C1 : - : 400x400" (Foundation : Column : FC : BxH)
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

    // Split by colon to handle 2-field, 3-field, and 4-field formats
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
      // 3-field or 4-field: "F1A : C3 : -" or "F110A : C1 : - : 400x400"
      const cValue = parts[1];
      const fcValue = parts[2];

      if (cValue !== '-' && cValue !== '') {
        columnType = cValue;
      } else if (fcValue !== '-' && fcValue !== '') {
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
      foundation = columnType;
    }

    // Only keep foundations matching F followed by digits and optional letter (F11, F11A, F112A)
    if (!/^F\d+[A-Z]?$/i.test(foundation)) continue;

    // Parse optional BxH field (4th field, index 3)
    let bColumn: string | undefined;
    let hColumn: string | undefined;
    if (parts.length >= 4) {
      const bxh = parts[3].trim();
      if (bxh && bxh !== '-') {
        const dimMatch = bxh.match(/^(\d+)\s*[xX\u00d7]\s*(\d+)$/);
        if (dimMatch) {
          bColumn = dimMatch[1];
          hColumn = dimMatch[2];
        }
      }
    }

    // Create unique key for deduplication
    const key = `${foundation}:${columnType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ foundation, columnType, bColumn, hColumn });
  }

  // Sort by foundation alphanumerically
  result.sort((a, b) => {
    const aMatch = a.foundation.match(/^F(\d+)([A-Z]?)$/i);
    const bMatch = b.foundation.match(/^F(\d+)([A-Z]?)$/i);

    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1], 10);
      const bNum = parseInt(bMatch[1], 10);
      if (aNum !== bNum) return aNum - bNum;
      return (aMatch[2] || '').localeCompare(bMatch[2] || '');
    }

    return a.foundation.localeCompare(b.foundation);
  });

  return result;
}
