import { describe, expect, it } from 'vitest';
import type { ExpandedReinforcementData, FoundationPriorityWorkingRow, FrameData } from '../types';
import {
  FOUNDATION_INSTANCE_SHEET,
  FOUNDATION_TYPE_SHEET,
  FRAMING_TYPE_SHEET,
  buildFoundationInstanceEntities,
  buildFoundationTypeEntities,
  buildFramingTypeEntities,
} from './templateSheets';
import { PHASING_CONSTRUCTION_VALUE, PHASING_FIELD, normalizeLabel } from './typeSheetFiller';

const column = (over: Partial<ExpandedReinforcementData>): ExpandedReinforcementData => ({
  columnType: 'FC1',
  dimensionWidth: '500',
  dimensionHeight: '500',
  mainReinforcementCount: '12',
  mainReinforcementSize: '22',
  hoopReinforcementSize: '10',
  hoopReinforcementSpacing: '100',
  ...over,
});

const priorityRow = (
  foundation: string,
  columnType: string,
  axes: Array<[string, string]>,
): FoundationPriorityWorkingRow => ({
  rowId: `p:${foundation}`,
  sourceKey: `priority:${foundation}`,
  sourceFileIds: ['plan'],
  provenance: 'extracted',
  edited: false,
  foundation,
  codes: [columnType],
  resolutions: [
    {
      columnType,
      method: 'plan-fc',
      locations: axes.map(([xAxis, yAxis]) => ({
        evidenceId: `${foundation}:${xAxis}:${yAxis}`,
        plan: { fileId: 'plan', role: 'plan' as const, xAxis, yAxis },
      })),
    },
  ],
});

const fwFrame: FrameData = {
  frameType: 'FW',
  frameName: 'FW1',
  b: '150',
  h: '600',
  fwBaseRebarDiameter: '13',
  fwVerticalRebarDiameter: '13',
  fwHorizontalRebarCount: '4',
  fwHorizontalRebarDiameter: '10',
};

describe('sheet label maps', () => {
  it('maps the FoundationType parameters the extractor can supply', () => {
    const m = FOUNDATION_TYPE_SHEET.labelToField;
    expect(m.get(normalizeLabel('Type Mark'))).toBe('typeMark');
    expect(m.get(normalizeLabel('Phasing'))).toBe(PHASING_FIELD);
    expect(m.get(normalizeLabel('柱型_Lx'))).toBe('dimensionWidth');
    expect(m.get(normalizeLabel('柱型_Ly'))).toBe('dimensionHeight');
    expect(m.get(normalizeLabel('柱型_主筋_本数'))).toBe('mainReinforcementCount');
    expect(m.get(normalizeLabel('柱型_Hoop_距離_最大'))).toBe('hoopReinforcementSpacing');
    expect(m.get(normalizeLabel('柱_Lx'))).toBe('bColumn');
    expect(m.get(normalizeLabel('柱_Ly'))).toBe('hColumn');
    // Foundation body dimensions are not extracted, so they must stay unmapped.
    expect(m.get(normalizeLabel('基礎_厚さ_上'))).toBeUndefined();
    expect(m.get(normalizeLabel('鉄筋_はかま_直径'))).toBeUndefined();
  });

  it('identifies FoundationInstance columns by grid label, not Type Mark', () => {
    // One foundation legitimately covers many intersections; keying on Type Mark
    // would collapse them all into a single column.
    expect(FOUNDATION_INSTANCE_SHEET.identityLabel).toBe('通り芯_ラベル');
    const m = FOUNDATION_INSTANCE_SHEET.labelToField;
    expect(m.get(normalizeLabel('通り芯_ラベル'))).toBe('gridLabel');
    expect(m.get(normalizeLabel('Type Mark'))).toBe('typeMark');
    expect(m.get(normalizeLabel('柱_マーク'))).toBe('columnMark');
    expect(m.get(normalizeLabel('X軸'))).toBe('xAxis');
    expect(m.get(normalizeLabel('Y軸'))).toBe('yAxis');
    expect(m.get(normalizeLabel('アンカー_マーク'))).toBeUndefined();
  });

  it('derives the FramingType map from the frame results table', () => {
    const m = FRAMING_TYPE_SHEET.labelToField;
    expect(m.get(normalizeLabel('Type Mark'))).toBe('typeMark');
    expect(m.get(normalizeLabel('b'))).toBe('b');
    expect(m.get(normalizeLabel('FG_St_距離_最大'))).toBe('fgStirrupMaxDistance');
    expect(m.get(normalizeLabel('FW_ヨコ筋_本数'))).toBe('fwHorizontalRebarCount');
    expect(m.get(normalizeLabel('FW_立上の上端筋_直径'))).toBeUndefined();
  });
});

describe('buildFoundationTypeEntities', () => {
  it('gives each foundation one column keyed by its name', () => {
    const entities = buildFoundationTypeEntities([
      column({ foundation: 'F1' }),
      column({ foundation: 'F2', dimensionWidth: '600' }),
    ]);
    expect(entities.map((e) => e.key)).toEqual(['F1', 'F2']);
    expect(entities[0].values.typeMark).toBe('F1');
    expect(entities[0].values[PHASING_FIELD]).toBe(PHASING_CONSTRUCTION_VALUE);
  });

  it('collects competing values so the strategy can resolve them later', () => {
    const entities = buildFoundationTypeEntities([
      column({ foundation: 'F1', dimensionWidth: '500' }),
      column({ foundation: 'F1', dimensionWidth: '900' }),
    ]);
    expect(entities).toHaveLength(1);
    expect(entities[0].values.dimensionWidth).toEqual(['500', '900']);
  });

  it('skips rows with no foundation', () => {
    expect(buildFoundationTypeEntities([column({}), column({ foundation: '  ' })])).toEqual([]);
  });
});

describe('buildFoundationInstanceEntities', () => {
  it('gives every grid intersection its own column', () => {
    const entities = buildFoundationInstanceEntities([
      priorityRow('F1', 'FC1', [['X1', 'Y1'], ['X2', 'Y1']]),
      priorityRow('F2', 'FC2', [['X1', 'Y2']]),
    ]);

    expect(entities).toHaveLength(3);
    expect(entities.map((e) => e.values.gridLabel)).toEqual(['X1-Y1', 'X2-Y1', 'X1-Y2']);
    // The same foundation repeats across its instances — that is the point.
    expect(entities.map((e) => e.values.typeMark)).toEqual(['F1', 'F1', 'F2']);
    expect(entities.map((e) => e.values.columnMark)).toEqual(['FC1', 'FC1', 'FC2']);
    expect(entities[1].values.xAxis).toBe('X2');
    expect(entities[1].values.yAxis).toBe('Y1');
  });

  it('keys columns per foundation and intersection so distinct rows never merge', () => {
    const entities = buildFoundationInstanceEntities([
      priorityRow('F1', 'FC1', [['X1', 'Y1']]),
      priorityRow('F2', 'FC2', [['X1', 'Y1']]),
    ]);
    expect(entities.map((e) => e.key)).toEqual(['F1@X1-Y1', 'F2@X1-Y1']);
  });

  it('collapses the same intersection reported by several resolutions', () => {
    const row = priorityRow('F1', 'FC1', [['X1', 'Y1']]);
    row.resolutions.push({
      columnType: 'FC9',
      method: 'certified-fallback',
      locations: [{ evidenceId: 'dup', plan: { fileId: 'plan', role: 'plan', xAxis: 'X1', yAxis: 'Y1' } }],
    });

    const entities = buildFoundationInstanceEntities([row]);
    expect(entities).toHaveLength(1);
    expect(entities[0].values.columnMark).toBe('FC1');
  });

  it('ignores rows with no foundation or no axes', () => {
    const noAxes = priorityRow('F1', 'FC1', [['', '']]);
    expect(buildFoundationInstanceEntities([noAxes])).toEqual([]);
    expect(buildFoundationInstanceEntities([priorityRow('', 'FC1', [['X1', 'Y1']])])).toEqual([]);
  });

  it('produces nothing when a foundation has no resolved evidence', () => {
    const bare: FoundationPriorityWorkingRow = {
      rowId: 'p:F9', sourceKey: 'priority:F9', sourceFileIds: [], provenance: 'manual',
      edited: false, foundation: 'F9', codes: [], resolutions: [],
    };
    expect(buildFoundationInstanceEntities([bare])).toEqual([]);
  });
});

describe('buildFramingTypeEntities', () => {
  it('keys each frame by name and sets the constant phasing', () => {
    const entities = buildFramingTypeEntities([fwFrame]);
    expect(entities[0].key).toBe('FW1');
    expect(entities[0].values.typeMark).toBe('FW1');
    expect(entities[0].values[PHASING_FIELD]).toBe(PHASING_CONSTRUCTION_VALUE);
    expect(entities[0].values.fwHorizontalRebarCount).toBe('4');
  });

  it('merges rows sharing a name, first non-empty value winning', () => {
    const entities = buildFramingTypeEntities([
      { ...fwFrame, fwHorizontalRebarCount: '' } as FrameData,
      { ...fwFrame, fwHorizontalRebarCount: '7' } as FrameData,
    ]);
    expect(entities).toHaveLength(1);
    expect(entities[0].values.fwHorizontalRebarCount).toBe('7');
  });

  it('does not leak frameName into a parameter row', () => {
    expect(buildFramingTypeEntities([fwFrame])[0].values.frameName).toBeUndefined();
  });

  it('skips frames with no name', () => {
    expect(buildFramingTypeEntities([{ ...fwFrame, frameName: '' } as FrameData])).toEqual([]);
  });
});
