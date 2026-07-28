import * as XLSX from 'xlsx';

/** Derive the XLSX bookType from a file extension so the output preserves the original format. */
export function getBookType(fileName: string): XLSX.BookType {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? 'xlsx';
  const MAP: Record<string, XLSX.BookType> = {
    xlsx: 'xlsx',
    xlsm: 'xlsm',
    xlsb: 'xlsb',
    xls: 'biff8',
    ods: 'ods',
  };
  return MAP[ext] ?? 'xlsx';
}

/** Read up to maxRows × maxCols cells from one sheet as a 2-D string array. */
export function parseSheetPreview(
  workbook: XLSX.WorkBook,
  sheetIndex: number,
  maxRows = 60,
  maxCols = 30,
): (string | null)[][] {
  const safeIndex = Math.min(Math.max(sheetIndex, 0), workbook.SheetNames.length - 1);
  const ws = workbook.Sheets[workbook.SheetNames[safeIndex]];
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows: (string | null)[][] = [];
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + maxRows - 1); r++) {
    const row: (string | null)[] = [];
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + maxCols - 1); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell?.v != null ? String(cell.v) : null);
    }
    rows.push(row);
  }
  return rows;
}
