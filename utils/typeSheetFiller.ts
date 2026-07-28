import * as XLSX from 'xlsx';
import { unzipSync, zipSync } from 'fflate';
import type { MultiValueStrategy, TypeSheetConfig, TypeSheetEntity, TypeSheetRowMapping } from '../types';
import {
  addrToColIndex,
  colToIndex,
  decode,
  encode,
  findRow,
  getCellText,
  indexToCol,
  parseSharedStrings,
  resolveSheetPath,
  rowCells,
  upsertCell,
  widenDimension,
  writeAutoTypedValue,
} from './xlsxPatch';

/**
 * Generic writer for the "type table" sheets in the Tnf design workbook
 * (FoundationType, FoundationInstance, FramingType, …).
 *
 * They all share one shape: parameter names run down a label column, and every
 * entity — a foundation, a grid instance, a frame — owns one column to the right
 * of it. This module knows that shape and nothing about the domain; each sheet
 * supplies its own label→field map and entities via a TypeSheetSpec.
 */

/** Phasing is never extracted from drawings; these sheets always get 施工. */
export const PHASING_CONSTRUCTION_VALUE = '施工';

/** Reserved field name that resolves to PHASING_CONSTRUCTION_VALUE for every entity. */
export const PHASING_FIELD = 'phasingConstant';

export const normalizeLabel = (label: string) => label.replace(/\s+/g, ' ').trim().toLowerCase();

/** Everything a sheet needs to describe itself to the generic engine. */
export interface TypeSheetSpec {
  /** Human-facing name, used in UI copy and error messages. */
  title: string;
  /** Matches the worksheet name inside the workbook. */
  sheetPattern: RegExp;
  /**
   * Label of the row whose values identify each column. Re-running the fill
   * matches on this row to update a column in place instead of duplicating it.
   * FramingType/FoundationType identify by Type Mark; FoundationInstance by its
   * grid label, because one foundation legitimately spans many instances.
   */
  identityLabel: string;
  /** Sheet label (normalized) → entity field name. */
  labelToField: Map<string, string>;
  /** 1-indexed caption row to fill for rows that carry no parameter label. */
  summaryRow?: number;
  /** Entity field written into summaryRow. Required when summaryRow is set. */
  summaryField?: string;
}

/** Read a cell's trimmed text from a parsed sheet by row/column index. */
function cellText(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell?.v != null ? String(cell.v).trim() : '';
}

/** Locate the sheet a spec describes, or -1 when the workbook has no such sheet. */
export function findSpecSheetIndex(workbook: XLSX.WorkBook, spec: TypeSheetSpec): number {
  return workbook.SheetNames.findIndex((name) => spec.sheetPattern.test(name));
}

/**
 * Work out a sheet's layout: which column holds the parameter labels, which row
 * identifies the columns, and which field each row maps to.
 *
 * Anchors on the spec's identity label. Returns null when that anchor is absent,
 * so a workbook without this sheet is skipped rather than filled at a guess.
 */
export function autoDetectTypeSheetConfig(
  workbook: XLSX.WorkBook,
  sheetIndex: number,
  spec: TypeSheetSpec,
): TypeSheetConfig | null {
  if (sheetIndex < 0 || sheetIndex >= workbook.SheetNames.length) return null;
  const ws = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  if (!ws?.['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);

  const anchor = normalizeLabel(spec.identityLabel);
  let labelColIdx = -1;
  let identityRow = -1;
  for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 6) && identityRow < 0; c++) {
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 20); r++) {
      if (normalizeLabel(cellText(ws, r, c)) === anchor) {
        labelColIdx = c;
        identityRow = r;
        break;
      }
    }
  }
  if (identityRow < 0) return null;

  const rowMappings: TypeSheetRowMapping[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const label = cellText(ws, r, labelColIdx);
    if (!label) continue;
    // Rows above the identity row are table headings ("Name of Parameters"), not parameters.
    if (r < identityRow) continue;
    rowMappings.push({
      rowIndex: r + 1,
      label,
      sourceField: spec.labelToField.get(normalizeLabel(label)) ?? null,
    });
  }

  return {
    sheetIndex,
    identityRow: identityRow + 1,
    labelColumn: indexToCol(labelColIdx),
    firstDataColumn: indexToCol(labelColIdx + 1),
    rowMappings,
    ...(spec.summaryRow && spec.summaryField
      ? { summary: { rowIndex: spec.summaryRow, sourceField: spec.summaryField } }
      : {}),
  };
}

/** Pick one value out of several competing ones for the same cell. */
export function resolveMultiValue(values: string[], strategy: MultiValueStrategy): string {
  const present = values.filter(Boolean);
  if (present.length === 0) return '';
  const unique = [...new Set(present)];
  if (unique.length === 1) return unique[0];

  switch (strategy) {
    case 'all':
      return unique.join(' / ');
    case 'most-common': {
      const counts = new Map<string, number>();
      for (const v of present) counts.set(v, (counts.get(v) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    case 'largest': {
      const nums = unique.map(Number).filter((n) => !isNaN(n));
      return nums.length > 0 ? String(Math.max(...nums)) : unique[0];
    }
    case 'first':
    default:
      return present[0];
  }
}

/**
 * Give every entity a column: an identity already in the sheet keeps its column
 * so a re-export updates in place, and anything new takes the next free one.
 */
function assignColumns(
  identityRowEl: Element | null,
  shared: string[],
  entities: TypeSheetEntity[],
  firstDataColIdx: number,
): Map<string, number> {
  const existing = new Map<string, number>();
  const occupied = new Set<number>();

  if (identityRowEl) {
    for (const cell of rowCells(identityRowEl)) {
      const colIdx = addrToColIndex(cell.getAttribute('r') ?? '');
      if (colIdx < firstDataColIdx) continue;
      const text = getCellText(cell, shared).trim();
      if (!text) continue;
      if (!existing.has(text)) existing.set(text, colIdx);
      occupied.add(colIdx);
    }
  }

  const assigned = new Map<string, number>();
  let nextFree = firstDataColIdx;
  for (const entity of entities) {
    const reused = existing.get(entity.key);
    if (reused != null) {
      assigned.set(entity.key, reused);
      continue;
    }
    while (occupied.has(nextFree)) nextFree++;
    occupied.add(nextFree);
    assigned.set(entity.key, nextFree);
  }
  return assigned;
}

/**
 * Write entities into one type sheet of an existing workbook.
 *
 * Only the target worksheet XML is touched — styles, macros and every other
 * sheet pass through byte-for-byte. Rows whose parameter has no matching field,
 * and fields an entity does not carry, are left blank rather than cleared, so
 * anything filled in by hand survives.
 */
export function fillTypeSheet(
  fileBytes: Uint8Array,
  entities: TypeSheetEntity[],
  config: TypeSheetConfig,
  strategy: MultiValueStrategy = 'first',
): Uint8Array {
  if (entities.length === 0) return fileBytes;

  const files = unzipSync(fileBytes);
  const sheetPath = resolveSheetPath(files, config.sheetIndex);
  if (!sheetPath || !files[sheetPath]) {
    throw new Error(`Sheet ${config.sheetIndex} not found in ZIP`);
  }

  const shared = parseSharedStrings(files);
  const doc = new DOMParser().parseFromString(decode(files[sheetPath]), 'text/xml');

  const firstDataColIdx = colToIndex(config.firstDataColumn);
  const labelColIdx = colToIndex(config.labelColumn);
  const identityRowEl = findRow(doc, config.identityRow);
  const columns = assignColumns(identityRowEl, shared, entities, firstDataColIdx);

  for (const rowMap of config.rowMappings) {
    if (!rowMap.sourceField) continue;

    const rowEl = findRow(doc, rowMap.rowIndex);
    if (!rowEl) continue;

    // Only write when the label column still reads as expected, so a stale saved
    // config can never scatter values across unrelated rows.
    const labelCell = rowCells(rowEl).find(
      (c) => addrToColIndex(c.getAttribute('r') ?? '') === labelColIdx,
    );
    if (!labelCell || getCellText(labelCell, shared).trim() !== rowMap.label) continue;

    for (const entity of entities) {
      const colIdx = columns.get(entity.key);
      if (colIdx == null) continue;

      const raw = entity.values[rowMap.sourceField];
      const value = Array.isArray(raw) ? resolveMultiValue(raw, strategy) : (raw ?? '');
      if (!value) continue; // nothing extracted for this field → leave it blank

      writeAutoTypedValue(doc, upsertCell(doc, rowEl, colIdx, rowMap.rowIndex), value);
    }
  }

  // Caption row (no parameter label to guard against) — e.g. the column types
  // feeding each foundation, written above its column.
  if (config.summary) {
    const { rowIndex, sourceField } = config.summary;
    const rowEl = findRow(doc, rowIndex);
    if (rowEl) {
      for (const entity of entities) {
        const colIdx = columns.get(entity.key);
        if (colIdx == null) continue;
        const raw = entity.values[sourceField];
        const value = Array.isArray(raw) ? [...new Set(raw.filter(Boolean))].join(', ') : (raw ?? '');
        if (!value) continue;
        writeAutoTypedValue(doc, upsertCell(doc, rowEl, colIdx, rowIndex), value);
      }
    }
  }

  widenDimension(doc, Math.max(...columns.values()));

  const modifiedXml = new XMLSerializer().serializeToString(doc);
  return zipSync({ ...files, [sheetPath]: encode(modifiedXml) }, { level: 6 });
}
