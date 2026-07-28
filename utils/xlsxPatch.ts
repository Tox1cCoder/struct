import { strToU8 } from 'fflate';

/**
 * Low-level primitives for patching cell values directly inside an xlsx/xlsm ZIP.
 *
 * Every writer built on these edits only the target worksheet XML — styles.xml,
 * sharedStrings.xml, vbaProject.bin and friends are passed through byte-for-byte,
 * so template formatting and macros survive the round trip.
 */

export const XLSX_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

export function encode(str: string): Uint8Array {
  return strToU8(str);
}

/** Resolve the worksheet file path inside the ZIP for the given 0-based sheet index. */
export function resolveSheetPath(files: Record<string, Uint8Array>, sheetIndex: number): string | null {
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
export function parseSharedStrings(files: Record<string, Uint8Array>): string[] {
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
export function getCellText(cell: Element, shared: string[]): string {
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
export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Convert a 0-based column index to a column letter string. */
export function indexToCol(idx: number): string {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** Extract the 0-based column index from a cell address like "D23". */
export function addrToColIndex(addr: string): number {
  return colToIndex(addr.match(/^[A-Z]+/)?.[0] ?? 'A');
}

/** Find a <row r="N"> element (1-based row number). */
export function findRow(doc: Document, rowNum: number): Element | null {
  for (const row of Array.from(doc.getElementsByTagNameNS(XLSX_NS, 'row'))) {
    if (parseInt(row.getAttribute('r') ?? '0', 10) === rowNum) return row;
  }
  // Fallback for no-namespace files
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    if (parseInt(row.getAttribute('r') ?? '0', 10) === rowNum) return row;
  }
  return null;
}

/** List the <c> children of a row, tolerating both namespaced and plain documents. */
export function rowCells(rowEl: Element): Element[] {
  const namespaced = Array.from(rowEl.getElementsByTagNameNS(XLSX_NS, 'c'));
  return namespaced.length > 0 ? namespaced : Array.from(rowEl.getElementsByTagName('c'));
}

/** Find or create a <c r="addr"> inside the given row, maintaining column order. */
export function upsertCell(doc: Document, rowEl: Element, colIdx: number, rowNum: number): Element {
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
export function writeCellValue(doc: Document, cell: Element, value: string | number, isNum: boolean): void {
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

/** Write a value as a number when it parses cleanly, otherwise as inline text. */
export function writeAutoTypedValue(doc: Document, cell: Element, value: string): void {
  const num = Number(value);
  const isNum = value.trim() !== '' && !isNaN(num) && isFinite(num);
  writeCellValue(doc, cell, isNum ? num : value, isNum);
}

/**
 * Widen <dimension ref="…"> so it covers maxColIdx.
 * Excel tolerates a stale dimension, but keeping it honest avoids
 * "repaired records" warnings when columns are appended past the original range.
 */
export function widenDimension(doc: Document, maxColIdx: number): void {
  const dim =
    doc.getElementsByTagNameNS(XLSX_NS, 'dimension')[0] ??
    doc.getElementsByTagName('dimension')[0];
  const ref = dim?.getAttribute('ref');
  if (!dim || !ref) return;

  const [start, end] = ref.split(':');
  if (!end) return;

  const endCol = end.match(/^[A-Z]+/)?.[0] ?? 'A';
  const endRow = end.match(/\d+$/)?.[0] ?? '1';
  if (colToIndex(endCol) >= maxColIdx) return;

  dim.setAttribute('ref', `${start}:${indexToCol(maxColIdx)}${endRow}`);
}
