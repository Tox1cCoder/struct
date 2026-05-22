import * as XLSX from 'xlsx';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import type { ExpandedReinforcementData, RowMapping, SourceField, TemplateMappingConfig } from '../types';

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

// Auto-match a label string to the closest known source field
const LABEL_PATTERNS: Array<[RegExp, SourceField]> = [
  [/柱型.{0,4}[Ll]x|^[Ll]x$/i, 'dimensionWidth'],
  [/柱型.{0,4}[Ll]y|^[Ll]y$/i, 'dimensionHeight'],
  [/主筋.{0,4}本数|main.{0,6}count|count/i, 'mainReinforcementCount'],
  [/主筋.{0,4}直径|main.{0,6}(dia|size)/i, 'mainReinforcementSize'],
  [/[Hh]oop.{0,4}直径|帯筋.{0,4}直径|hoop.{0,6}(dia|size)/i, 'hoopReinforcementSize'],
  [/[Hh]oop.{0,4}(距離|間隔|pitch|spac)|帯筋.{0,4}(距離|間隔)/i, 'hoopReinforcementSpacing'],
  [/柱符号|[Cc]olumn.{0,4}[Tt]ype/i, 'columnType'],
  [/^[Bb]柱?$|柱_[Ll]x|柱.{0,2}[Bb]$/i, 'bColumn'],
  [/^[Hh]柱?$|柱_[Ll]y|柱.{0,2}[Hh]$/i, 'hColumn'],
];

export function autoMatchField(label: string): SourceField | null {
  for (const [pattern, field] of LABEL_PATTERNS) {
    if (pattern.test(label)) return field;
  }
  return null;
}

/** Read up to maxRows × maxCols cells from one sheet as a 2-D string array. */
export function parseSheetPreview(
  workbook: XLSX.WorkBook,
  sheetIndex: number,
  maxRows = 60,
  maxCols = 30,
): (string | null)[][] {
  const ws = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  if (!ws['!ref']) return [];
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

/**
 * Scan the workbook for likely header row and label column, then build
 * an initial TemplateMappingConfig with auto-matched row mappings.
 */
export function autoDetectConfig(
  workbook: XLSX.WorkBook,
  sheetIndex: number,
  knownFoundations: string[],
): TemplateMappingConfig {
  const ws = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  const foundationSet = new Set(knownFoundations.map((f) => f.toUpperCase()));

  let headerRow = 1;
  for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
    let hits = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (v && foundationSet.has(String(v).trim().toUpperCase())) hits++;
    }
    if (hits >= Math.min(2, knownFoundations.length)) {
      headerRow = r + 1;
      break;
    }
  }

  let labelColIdx = range.s.c;
  let bestScore = -1;
  const scanStart = headerRow;
  for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 4); c++) {
    let score = 0;
    for (let r = scanStart; r <= Math.min(range.e.r, scanStart + 30); r++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (typeof v === 'string' && v.trim().length > 1) score++;
    }
    if (score > bestScore) { bestScore = score; labelColIdx = c; }
  }
  const labelColumn = XLSX.utils.encode_col(labelColIdx);

  const rowMappings: RowMapping[] = [];
  for (let r = scanStart; r <= range.e.r; r++) {
    const v = ws[XLSX.utils.encode_cell({ r, c: labelColIdx })]?.v;
    const label = v != null ? String(v).trim() : '';
    if (label) {
      rowMappings.push({ rowIndex: r + 1, label, sourceField: autoMatchField(label) });
    }
  }

  return { sheetIndex, headerRow, labelColumn, rowMappings, multiValueStrategy: 'first' };
}

// ─── ZIP + XML fill path ──────────────────────────────────────────────────────

const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
function encode(str: string): Uint8Array {
  return strToU8(str);
}

/** Resolve the worksheet file path inside the ZIP for the given 0-based sheet index. */
function resolveSheetPath(files: Record<string, Uint8Array>, sheetIndex: number): string | null {
  const wbBytes = files['xl/workbook.xml'];
  const relsBytes = files['xl/_rels/workbook.xml.rels'];
  if (!wbBytes || !relsBytes) return null;

  const parser = new DOMParser();
  const wbDoc = parser.parseFromString(decode(wbBytes), 'text/xml');
  const relsDoc = parser.parseFromString(decode(relsBytes), 'text/xml');

  const sheets = Array.from(wbDoc.getElementsByTagName('sheet'));
  if (sheetIndex >= sheets.length) return null;

  const rId =
    sheets[sheetIndex].getAttributeNS(REL_NS, 'id') ??
    sheets[sheetIndex].getAttribute('r:id');
  if (!rId) return null;

  const rel = Array.from(relsDoc.getElementsByTagName('Relationship')).find(
    (r) => r.getAttribute('Id') === rId,
  );
  if (!rel) return null;

  const target = rel.getAttribute('Target') ?? '';
  // target is relative to xl/  (e.g. "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml")
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

/** Parse the sharedStrings.xml into a plain array of strings. */
function parseSharedStrings(files: Record<string, Uint8Array>): string[] {
  const bytes = files['xl/sharedStrings.xml'];
  if (!bytes) return [];
  const doc = new DOMParser().parseFromString(decode(bytes), 'text/xml');
  const strings: string[] = [];
  for (const si of Array.from(doc.getElementsByTagName('si'))) {
    let text = '';
    for (const t of Array.from(si.getElementsByTagName('t'))) {
      text += t.textContent ?? '';
    }
    strings.push(text);
  }
  return strings;
}

/** Get the display value of a cell element using the shared strings table. */
function getCellText(cell: Element, shared: string[]): string {
  const t = cell.getAttribute('t') ?? '';
  if (t === 's') {
    const idx = parseInt(cell.getElementsByTagName('v')[0]?.textContent ?? '', 10);
    return isNaN(idx) ? '' : (shared[idx] ?? '');
  }
  if (t === 'inlineStr') {
    return cell.getElementsByTagName('t')[0]?.textContent ?? '';
  }
  // number, boolean, formula-result, etc.
  return cell.getElementsByTagName('v')[0]?.textContent ?? '';
}

/** Convert a column letter string ("A", "AB", …) to a 0-based index. */
function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Convert a 0-based column index to a column letter string. */
function indexToCol(idx: number): string {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** Extract the 0-based column index from a cell address like "D23". */
function addrToColIndex(addr: string): number {
  return colToIndex(addr.match(/^[A-Z]+/)?.[0] ?? 'A');
}

/** Find a <row r="N"> element (1-based row number). */
function findRow(doc: Document, rowNum: number): Element | null {
  for (const row of Array.from(doc.getElementsByTagNameNS(XLSX_NS, 'row'))) {
    if (parseInt(row.getAttribute('r') ?? '0', 10) === rowNum) return row;
  }
  // Fallback for no-namespace files
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    if (parseInt(row.getAttribute('r') ?? '0', 10) === rowNum) return row;
  }
  return null;
}

/** Find or create a <c r="addr"> inside the given row, maintaining column order. */
function upsertCell(doc: Document, rowEl: Element, colIdx: number, rowNum: number): Element {
  const addr = indexToCol(colIdx) + rowNum;
  const ns = rowEl.namespaceURI ?? XLSX_NS;

  // Try to find existing cell
  for (const c of Array.from(rowEl.children)) {
    if (c.getAttribute('r') === addr) return c;
  }

  // Create new cell and insert in column order
  const newCell = doc.createElementNS(ns, 'c');
  newCell.setAttribute('r', addr);

  let insertBefore: Element | null = null;
  for (const c of Array.from(rowEl.children)) {
    if (addrToColIndex(c.getAttribute('r') ?? '') > colIdx) {
      insertBefore = c;
      break;
    }
  }
  rowEl.insertBefore(newCell, insertBefore);
  return newCell;
}

/**
 * Write a value into a cell element.
 * - Numbers  → <v>num</v>  with no t attr (preserves any existing t="n")
 * - Strings  → t="inlineStr" with <is><t>text</t></is>  (avoids touching sharedStrings.xml)
 * The cell's existing s (style) attribute is kept untouched.
 */
function writeCellValue(doc: Document, cell: Element, value: string | number, isNum: boolean): void {
  // Remove all child nodes
  while (cell.firstChild) cell.removeChild(cell.firstChild);

  const ns = cell.namespaceURI ?? XLSX_NS;

  if (isNum) {
    cell.removeAttribute('t');
    const v = doc.createElementNS(ns, 'v');
    v.textContent = String(value);
    cell.appendChild(v);
  } else {
    cell.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(ns, 'is');
    const t = doc.createElementNS(ns, 't');
    t.textContent = String(value);
    is.appendChild(t);
    cell.appendChild(is);
  }
}

/** Resolve the final value string from a list of candidate values. */
function resolveValue(values: string[], strategy: TemplateMappingConfig['multiValueStrategy']): string {
  const unique = [...new Set(values)];
  if (unique.length === 1 || strategy === 'first') return values[0];
  if (strategy === 'all') return unique.join(' / ');
  if (strategy === 'most-common') {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (strategy === 'largest') {
    const nums = unique.map(Number).filter((n) => !isNaN(n));
    return nums.length > 0 ? String(Math.max(...nums)) : values[0];
  }
  return values[0];
}

/**
 * Fill the template by patching only the worksheet XML cell values inside the
 * original ZIP.  Every other file — styles.xml, workbook.xml, sharedStrings.xml,
 * vbaraw — is passed through byte-for-byte so all formatting is preserved.
 */
export function fillTemplate(
  fileBytes: Uint8Array,
  mergedData: ExpandedReinforcementData[],
  config: TemplateMappingConfig,
): Uint8Array {
  // 1. Unzip the original file
  const files = unzipSync(fileBytes);

  // 2. Locate the target worksheet
  const sheetPath = resolveSheetPath(files, config.sheetIndex);
  if (!sheetPath || !files[sheetPath]) {
    throw new Error(`Sheet ${config.sheetIndex} not found in ZIP`);
  }

  // 3. Parse shared strings (needed to read header/label cell text)
  const shared = parseSharedStrings(files);

  // 4. Parse the worksheet XML
  const wsXml = decode(files[sheetPath]);
  const parser = new DOMParser();
  const doc = parser.parseFromString(wsXml, 'text/xml');

  // 5. Build foundation → data rows map
  const byFoundation = new Map<string, ExpandedReinforcementData[]>();
  for (const row of mergedData) {
    if (!row.foundation) continue;
    const arr = byFoundation.get(row.foundation) ?? [];
    arr.push(row);
    byFoundation.set(row.foundation, arr);
  }

  // 6. Find foundation columns from the header row
  const headerRow = findRow(doc, config.headerRow);
  const labelColIdx = colToIndex(config.labelColumn);
  const foundationCols = new Map<string, number[]>();

  if (headerRow) {
    const cells = Array.from(headerRow.getElementsByTagNameNS(XLSX_NS, 'c'));
    const fallback = cells.length === 0 ? Array.from(headerRow.getElementsByTagName('c')) : cells;
    for (const cell of fallback) {
      const addr = cell.getAttribute('r') ?? '';
      const val = getCellText(cell, shared).trim();
      if (val && byFoundation.has(val)) {
        const list = foundationCols.get(val) ?? [];
        list.push(addrToColIndex(addr));
        foundationCols.set(val, list);
      }
    }
  }

  // 7. Fill each mapped row
  for (const rowMap of config.rowMappings) {
    if (!rowMap.sourceField) continue;

    const row = findRow(doc, rowMap.rowIndex);
    if (!row) continue;

    // Safety: verify the label at (rowMap.rowIndex, labelColIdx) still matches
    const labelCells = Array.from(row.getElementsByTagNameNS(XLSX_NS, 'c'));
    const fallbackCells = labelCells.length === 0 ? Array.from(row.getElementsByTagName('c')) : labelCells;
    const labelCell = fallbackCells.find((c) => addrToColIndex(c.getAttribute('r') ?? '') === labelColIdx);
    const actualLabel = labelCell ? getCellText(labelCell, shared).trim() : '';
    if (actualLabel !== rowMap.label) continue;

    for (const [foundation, colIdxList] of foundationCols) {
      const fRows = byFoundation.get(foundation) ?? [];
      const values = fRows
        .map((r) => String((r as unknown as Record<string, unknown>)[rowMap.sourceField!] ?? ''))
        .filter(Boolean);
      if (values.length === 0) continue;

      const resolved = resolveValue(values, config.multiValueStrategy);
      const numVal = Number(resolved);
      const isNum = resolved.trim() !== '' && !isNaN(numVal) && isFinite(numVal);

      for (const colIdx of colIdxList) {
        const cell = upsertCell(doc, row, colIdx, rowMap.rowIndex);
        writeCellValue(doc, cell, isNum ? numVal : resolved, isNum);
      }
    }
  }

  // 8. Write the column-type summary into row 1 of the template.
  //    Row 1 already exists (it contains the orange title + column-type labels like C2, C3 …).
  //    We upsert only the foundation data cells — the merged title area is left untouched.
  if (foundationCols.size > 0) {
    const sheetDataEl =
      doc.getElementsByTagNameNS(XLSX_NS, 'sheetData')[0] ??
      doc.getElementsByTagName('sheetData')[0];

    if (sheetDataEl) {
      const summaryRowNum = 1;

      // Re-use the existing <row r="1"> element; create one only if missing.
      let summaryRowEl = findRow(doc, summaryRowNum);
      if (!summaryRowEl) {
        const ns = sheetDataEl.namespaceURI ?? XLSX_NS;
        summaryRowEl = doc.createElementNS(ns, 'row');
        summaryRowEl.setAttribute('r', String(summaryRowNum));
        sheetDataEl.insertBefore(summaryRowEl, sheetDataEl.firstChild);
      }

      // Overwrite only the foundation data columns — one cell per column per foundation.
      for (const [foundation, colIdxList] of foundationCols) {
        const fRows = byFoundation.get(foundation) ?? [];
        const types = [...new Set(fRows.map((r) => r.columnType))].filter(Boolean).join(', ');
        if (!types) continue;
        for (const colIdx of colIdxList) {
          const cell = upsertCell(doc, summaryRowEl, colIdx, summaryRowNum);
          writeCellValue(doc, cell, types, false);
        }
      }
    }
  }

  // 9. Serialize the modified worksheet back to XML
  const modifiedXml = new XMLSerializer().serializeToString(doc);

  // 10. Replace the worksheet file and re-zip; everything else (styles, VBA, …) is unchanged
  const output: Record<string, Uint8Array> = { ...files, [sheetPath]: encode(modifiedXml) };
  return zipSync(output, { level: 6 });
}
