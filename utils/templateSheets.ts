import type {
  ExpandedReinforcementData,
  FoundationPriorityWorkingRow,
  FrameData,
  TypeSheetEntity,
} from '../types';
import { getFrameColumns } from './frameTable';
import {
  PHASING_CONSTRUCTION_VALUE,
  PHASING_FIELD,
  normalizeLabel,
  type TypeSheetSpec,
} from './typeSheetFiller';

/**
 * Maps the Tnf design workbook's type sheets onto the app's extraction results.
 *
 * Each spec pairs the Japanese/English parameter labels found in a sheet's label
 * column with the field names its entity builder produces. Labels the extractor
 * cannot supply are simply absent from the map, which leaves those rows blank.
 */

const buildLabelMap = (entries: Array<[string, string]>): Map<string, string> =>
  new Map(entries.map(([label, field]) => [normalizeLabel(label), field]));

// ─── FoundationType ← Column Reinforcement ───────────────────────────────────

export const FOUNDATION_TYPE_SHEET: TypeSheetSpec = {
  title: 'Foundation Type',
  sheetPattern: /^foundationtype$/i,
  identityLabel: 'Type Mark',
  // The title row has no parameter name of its own, so it is filled as a caption
  // listing the column types behind each foundation (pre-existing behaviour).
  summaryRow: 1,
  summaryField: 'columnType',
  labelToField: buildLabelMap([
    ['Type Mark', 'typeMark'],
    ['Phasing', PHASING_FIELD],
    ['柱型_Lx', 'dimensionWidth'],
    ['柱型_Ly', 'dimensionHeight'],
    ['柱型_主筋_本数', 'mainReinforcementCount'],
    ['柱型_主筋_直径', 'mainReinforcementSize'],
    ['柱型_Hoop_直径', 'hoopReinforcementSize'],
    ['柱型_Hoop_距離_最大', 'hoopReinforcementSpacing'],
    ['柱_Lx', 'bColumn'],
    ['柱_Ly', 'hColumn'],
  ]),
};

/** One column per foundation; rows sharing a foundation are collapsed per field. */
export function buildFoundationTypeEntities(rows: ExpandedReinforcementData[]): TypeSheetEntity[] {
  const byFoundation = new Map<string, ExpandedReinforcementData[]>();
  for (const row of rows) {
    const foundation = row.foundation?.trim();
    if (!foundation) continue;
    const list = byFoundation.get(foundation) ?? [];
    list.push(row);
    byFoundation.set(foundation, list);
  }

  const collect = (list: ExpandedReinforcementData[], field: keyof ExpandedReinforcementData) =>
    list.map((r) => String(r[field] ?? '')).filter(Boolean);

  return [...byFoundation.entries()].map(([foundation, list]) => ({
    key: foundation,
    values: {
      typeMark: foundation,
      [PHASING_FIELD]: PHASING_CONSTRUCTION_VALUE,
      columnType: collect(list, 'columnType'),
      dimensionWidth: collect(list, 'dimensionWidth'),
      dimensionHeight: collect(list, 'dimensionHeight'),
      mainReinforcementCount: collect(list, 'mainReinforcementCount'),
      mainReinforcementSize: collect(list, 'mainReinforcementSize'),
      hoopReinforcementSize: collect(list, 'hoopReinforcementSize'),
      hoopReinforcementSpacing: collect(list, 'hoopReinforcementSpacing'),
      bColumn: collect(list, 'bColumn'),
      hColumn: collect(list, 'hColumn'),
    },
  }));
}

// ─── FoundationInstance ← Foundation Priority ────────────────────────────────

export const FOUNDATION_INSTANCE_SHEET: TypeSheetSpec = {
  title: 'Foundation Instance',
  sheetPattern: /^foundationinstance$/i,
  // One foundation spans many grid intersections, so the grid label — not the
  // Type Mark — is what makes a column unique here.
  identityLabel: '通り芯_ラベル',
  labelToField: buildLabelMap([
    ['通り芯_ラベル', 'gridLabel'],
    ['Type Mark', 'typeMark'],
    ['柱_マーク', 'columnMark'],
    ['X軸', 'xAxis'],
    ['Y軸', 'yAxis'],
  ]),
};

/** One column per grid intersection found in the resolved priority evidence. */
export function buildFoundationInstanceEntities(
  rows: FoundationPriorityWorkingRow[],
): TypeSheetEntity[] {
  const entities = new Map<string, TypeSheetEntity>();

  for (const row of rows) {
    const foundation = row.foundation?.trim();
    if (!foundation) continue;

    for (const resolution of row.resolutions) {
      for (const location of resolution.locations) {
        const { xAxis, yAxis } = location.plan;
        if (!xAxis && !yAxis) continue;

        const gridLabel = [xAxis, yAxis].filter(Boolean).join('-');
        const key = `${foundation}@${gridLabel}`;
        // The same intersection can be reported by several resolutions; keep the
        // first and let its column mark stand.
        if (entities.has(key)) continue;

        entities.set(key, {
          key,
          values: {
            gridLabel,
            typeMark: foundation,
            columnMark: resolution.columnType ?? '',
            xAxis: xAxis ?? '',
            yAxis: yAxis ?? '',
          },
        });
      }
    }
  }

  return [...entities.values()];
}

// ─── FramingType ← Frame (FW/FG) ─────────────────────────────────────────────

export const FRAMING_TYPE_SHEET: TypeSheetSpec = {
  title: 'Framing Type',
  sheetPattern: /^framingtype$/i,
  identityLabel: 'Type Mark',
  labelToField: (() => {
    const map = buildLabelMap([
      ['Type Mark', 'typeMark'],
      ['Phasing', PHASING_FIELD],
    ]);
    // Derived from the very same column definitions the Frame results table
    // renders, so the sheet mapping cannot drift when a frame field is renamed.
    for (const frameType of ['FW', 'FG'] as const) {
      for (const { header, key } of getFrameColumns(frameType)) {
        if (key === 'frameName') continue; // the frame name is the Type Mark
        map.set(normalizeLabel(header), key);
      }
    }
    return map;
  })(),
};

/** One column per frame name; rows sharing a name merge, first non-empty wins. */
export function buildFramingTypeEntities(frames: FrameData[]): TypeSheetEntity[] {
  const merged = new Map<string, Record<string, string | string[]>>();

  for (const frame of frames) {
    const name = frame.frameName?.trim();
    if (!name) continue;
    const target = merged.get(name) ?? { typeMark: name, [PHASING_FIELD]: PHASING_CONSTRUCTION_VALUE };
    for (const [key, value] of Object.entries(frame)) {
      if (key === 'frameName') continue;
      const text = value == null ? '' : String(value);
      if (text && !target[key]) target[key] = text;
    }
    merged.set(name, target);
  }

  return [...merged.entries()].map(([key, values]) => ({ key, values }));
}

// ─── Shared ──────────────────────────────────────────────────────────────────

export const TEMPLATE_SHEET_SPECS = [
  FOUNDATION_TYPE_SHEET,
  FOUNDATION_INSTANCE_SHEET,
  FRAMING_TYPE_SHEET,
] as const;
