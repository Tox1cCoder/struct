import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import type { ExpandedReinforcementData, FoundationPriorityWorkingRow, FrameData } from '../types';
import {
  PHASING_CONSTRUCTION_VALUE,
  autoDetectTypeSheetConfig,
  fillTypeSheet,
  findSpecSheetIndex,
  resolveMultiValue,
} from './typeSheetFiller';
import {
  FOUNDATION_INSTANCE_SHEET,
  FOUNDATION_TYPE_SHEET,
  FRAMING_TYPE_SHEET,
  buildFoundationInstanceEntities,
  buildFoundationTypeEntities,
  buildFramingTypeEntities,
} from './templateSheets';

const TEMPLATE_PATH = resolve(__dirname, '../samples/V2.4 TnfDesignInformation_v08_Template.xlsm');

const templateBytes = () => new Uint8Array(readFileSync(TEMPLATE_PATH));
const read = (bytes: Uint8Array) => XLSX.read(bytes, { type: 'array' });
const at = (wb: XLSX.WorkBook, sheet: string, addr: string) => {
  const v = wb.Sheets[sheet][addr]?.v;
  return v == null ? '' : String(v);
};

/** Detect a spec's layout against the real template. */
const configFor = (spec: Parameters<typeof autoDetectTypeSheetConfig>[2]) => {
  const wb = read(templateBytes());
  const idx = findSpecSheetIndex(wb, spec);
  const config = autoDetectTypeSheetConfig(wb, idx, spec);
  if (!config) throw new Error(`no config for ${spec.title}`);
  return config;
};

const columns: ExpandedReinforcementData[] = [
  { foundation: 'F1', columnType: 'FC1', bColumn: '800', hColumn: '800', dimensionWidth: '500', dimensionHeight: '500', mainReinforcementCount: '12', mainReinforcementSize: '22', hoopReinforcementSize: '10', hoopReinforcementSpacing: '100' },
  { foundation: 'F2', columnType: 'FC2', bColumn: '900', hColumn: '900', dimensionWidth: '600', dimensionHeight: '600', mainReinforcementCount: '16', mainReinforcementSize: '25', hoopReinforcementSize: '13', hoopReinforcementSpacing: '150' },
];

const priority: FoundationPriorityWorkingRow[] = [
  {
    rowId: 'p:F1', sourceKey: 'priority:F1', sourceFileIds: ['plan'], provenance: 'extracted', edited: false,
    foundation: 'F1', codes: ['FC1'],
    resolutions: [{
      columnType: 'FC1', method: 'plan-fc',
      locations: [
        { evidenceId: 'a', plan: { fileId: 'plan', role: 'plan', xAxis: 'X1', yAxis: 'Y1' } },
        { evidenceId: 'b', plan: { fileId: 'plan', role: 'plan', xAxis: 'X2', yAxis: 'Y1' } },
      ],
    }],
  },
  {
    rowId: 'p:F2', sourceKey: 'priority:F2', sourceFileIds: ['plan'], provenance: 'extracted', edited: false,
    foundation: 'F2', codes: ['FC2'],
    resolutions: [{
      columnType: 'FC2', method: 'certified-fallback',
      locations: [{ evidenceId: 'c', plan: { fileId: 'plan', role: 'plan', xAxis: 'X1', yAxis: 'Y2' } }],
    }],
  },
];

const frames: FrameData[] = [
  { frameType: 'FW', frameName: 'FW1', b: '150', h: '600', fwBaseRebarDiameter: '13', fwVerticalRebarDiameter: '13', fwHorizontalRebarCount: '4', fwHorizontalRebarDiameter: '10' },
  { frameType: 'FG', frameName: 'FG1', b: '300', h: '700', fgTopRebarDiameter: '22', fgBottomRebarDiameter: '25', fgStirrupDiameter: '10', fgStirrupMaxDistance: '200', fgBellyRebarDiameter: '13', fgWidthStopRebarDiameter: '10', fgWidthStopRebarMaxDistance: '1000' },
];

describe('resolveMultiValue', () => {
  it('picks by strategy and ignores blanks', () => {
    expect(resolveMultiValue(['500', '900'], 'first')).toBe('500');
    expect(resolveMultiValue(['500', '900'], 'largest')).toBe('900');
    expect(resolveMultiValue(['500', '900'], 'all')).toBe('500 / 900');
    expect(resolveMultiValue(['500', '900', '900'], 'most-common')).toBe('900');
    expect(resolveMultiValue(['', '700'], 'first')).toBe('700');
    expect(resolveMultiValue(['', ''], 'first')).toBe('');
  });
});

describe('autoDetectTypeSheetConfig', () => {
  it('locates all three sheets in the real template', () => {
    const wb = read(templateBytes());
    expect(wb.SheetNames[findSpecSheetIndex(wb, FOUNDATION_TYPE_SHEET)]).toBe('FoundationType');
    expect(wb.SheetNames[findSpecSheetIndex(wb, FOUNDATION_INSTANCE_SHEET)]).toBe('FoundationInstance');
    expect(wb.SheetNames[findSpecSheetIndex(wb, FRAMING_TYPE_SHEET)]).toBe('FramingType');
  });

  it('does not mistake the hidden output sheets for the real ones', () => {
    const wb = read(templateBytes());
    // FramingTypeOutput / FTypeOutPut hold Revit metadata, not fillable columns.
    expect(wb.SheetNames[findSpecSheetIndex(wb, FRAMING_TYPE_SHEET)]).not.toMatch(/output/i);
    expect(wb.SheetNames[findSpecSheetIndex(wb, FOUNDATION_TYPE_SHEET)]).not.toMatch(/output/i);
  });

  it('reads the FoundationType layout', () => {
    const c = configFor(FOUNDATION_TYPE_SHEET);
    expect(c.labelColumn).toBe('C');
    expect(c.firstDataColumn).toBe('D');
    expect(c.identityRow).toBe(4); // "Type Mark"
    expect(c.summary).toEqual({ rowIndex: 1, sourceField: 'columnType' });

    const byRow = new Map(c.rowMappings.map((r) => [r.rowIndex, r.sourceField]));
    expect(byRow.get(23)).toBe('dimensionWidth');
    expect(byRow.get(24)).toBe('dimensionHeight');
    expect(byRow.get(29)).toBe('mainReinforcementCount');
    expect(byRow.get(32)).toBe('hoopReinforcementSpacing');
    expect(byRow.get(33)).toBe('bColumn');
    expect(byRow.get(34)).toBe('hColumn');
  });

  it('reads the FoundationInstance layout', () => {
    const c = configFor(FOUNDATION_INSTANCE_SHEET);
    expect(c.labelColumn).toBe('C');
    expect(c.identityRow).toBe(3); // "通り芯_ラベル"
    const byRow = new Map(c.rowMappings.map((r) => [r.rowIndex, r.sourceField]));
    expect(byRow.get(3)).toBe('gridLabel');
    expect(byRow.get(4)).toBe('typeMark');
    expect(byRow.get(11)).toBe('columnMark');
    expect(byRow.get(13)).toBe('xAxis');
    expect(byRow.get(14)).toBe('yAxis');
  });

  it('reads the FramingType layout', () => {
    const c = configFor(FRAMING_TYPE_SHEET);
    expect(c.identityRow).toBe(3);
    const byRow = new Map(c.rowMappings.map((r) => [r.rowIndex, r.sourceField]));
    expect(byRow.get(4)).toBe('phasingConstant');
    expect(byRow.get(5)).toBe('b');
    expect(byRow.get(16)).toBe('fwHorizontalRebarCount');
    expect(byRow.get(18)).toBeNull();
    expect(byRow.get(19)).toBeNull();
  });

  it('returns null when the sheet lacks the identity anchor', () => {
    const wb = read(templateBytes());
    const dataSheet = wb.SheetNames.indexOf('Data');
    expect(autoDetectTypeSheetConfig(wb, dataSheet, FOUNDATION_TYPE_SHEET)).toBeNull();
    expect(autoDetectTypeSheetConfig(wb, -1, FOUNDATION_TYPE_SHEET)).toBeNull();
  });
});

describe('fillTypeSheet — FoundationType', () => {
  const fill = (rows = columns, strategy: 'first' | 'largest' | 'all' = 'first') =>
    read(fillTypeSheet(templateBytes(), buildFoundationTypeEntities(rows), configFor(FOUNDATION_TYPE_SHEET), strategy));

  it('fills a column per foundation — the case that was silently doing nothing', () => {
    const out = fill();
    expect(at(out, 'FoundationType', 'D4')).toBe('F1');
    expect(at(out, 'FoundationType', 'E4')).toBe('F2');
    expect(at(out, 'FoundationType', 'D23')).toBe('500'); // 柱型_Lx
    expect(at(out, 'FoundationType', 'D24')).toBe('500'); // 柱型_Ly
    expect(at(out, 'FoundationType', 'D29')).toBe('12'); //  柱型_主筋_本数
    expect(at(out, 'FoundationType', 'D30')).toBe('22'); //  柱型_主筋_直径
    expect(at(out, 'FoundationType', 'D31')).toBe('10'); //  柱型_Hoop_直径
    expect(at(out, 'FoundationType', 'D32')).toBe('100'); // 柱型_Hoop_距離_最大
    expect(at(out, 'FoundationType', 'D33')).toBe('800'); // 柱_Lx
    expect(at(out, 'FoundationType', 'D34')).toBe('800'); // 柱_Ly
    expect(at(out, 'FoundationType', 'E23')).toBe('600');
  });

  it('defaults Phasing to 施工', () => {
    const out = fill();
    expect(at(out, 'FoundationType', 'D5')).toBe(PHASING_CONSTRUCTION_VALUE);
    expect(at(out, 'FoundationType', 'E5')).toBe(PHASING_CONSTRUCTION_VALUE);
  });

  it('keeps the column-type caption on the title row', () => {
    const out = fill();
    expect(at(out, 'FoundationType', 'D1')).toBe('FC1');
    expect(at(out, 'FoundationType', 'E1')).toBe('FC2');
  });

  it('leaves parameters the extractor cannot supply blank', () => {
    const out = fill();
    for (const addr of ['D9', 'D15', 'D17', 'D19', 'D25', 'D26', 'D27', 'D35']) {
      expect(at(out, 'FoundationType', addr)).toBe('');
    }
  });

  it('resolves conflicting values with the chosen strategy', () => {
    const conflicting = [
      { ...columns[0], dimensionWidth: '500' },
      { ...columns[0], dimensionWidth: '900' },
    ];
    expect(at(fill(conflicting, 'first'), 'FoundationType', 'D23')).toBe('500');
    expect(at(fill(conflicting, 'largest'), 'FoundationType', 'D23')).toBe('900');
    expect(at(fill(conflicting, 'all'), 'FoundationType', 'D23')).toBe('500 / 900');
  });

  it('writes numbers as numbers so Revit reads them as Double', () => {
    const out = fill();
    expect(out.Sheets.FoundationType.D23.t).toBe('n');
    expect(out.Sheets.FoundationType.D23.v).toBe(500);
  });
});

describe('fillTypeSheet — FoundationInstance', () => {
  const fill = () =>
    read(
      fillTypeSheet(
        templateBytes(),
        buildFoundationInstanceEntities(priority),
        configFor(FOUNDATION_INSTANCE_SHEET),
      ),
    );

  it('gives every grid intersection its own column', () => {
    const out = fill();
    expect(at(out, 'FoundationInstance', 'D3')).toBe('X1-Y1');
    expect(at(out, 'FoundationInstance', 'E3')).toBe('X2-Y1');
    expect(at(out, 'FoundationInstance', 'F3')).toBe('X1-Y2');
  });

  it('repeats the Type Mark across a foundation’s instances instead of collapsing them', () => {
    const out = fill();
    expect(at(out, 'FoundationInstance', 'D4')).toBe('F1');
    expect(at(out, 'FoundationInstance', 'E4')).toBe('F1');
    expect(at(out, 'FoundationInstance', 'F4')).toBe('F2');
  });

  it('fills the column mark and both axes', () => {
    const out = fill();
    expect(at(out, 'FoundationInstance', 'D11')).toBe('FC1');
    expect(at(out, 'FoundationInstance', 'F11')).toBe('FC2');
    expect(at(out, 'FoundationInstance', 'D13')).toBe('X1');
    expect(at(out, 'FoundationInstance', 'E13')).toBe('X2');
    expect(at(out, 'FoundationInstance', 'D14')).toBe('Y1');
    expect(at(out, 'FoundationInstance', 'F14')).toBe('Y2');
  });

  it('leaves the rows it cannot supply blank', () => {
    const out = fill();
    for (const addr of ['D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D12']) {
      expect(at(out, 'FoundationInstance', addr)).toBe('');
    }
  });
});

describe('fillTypeSheet — FramingType', () => {
  const fill = (data = frames) =>
    read(fillTypeSheet(templateBytes(), buildFramingTypeEntities(data), configFor(FRAMING_TYPE_SHEET)));

  it('writes FW fields and leaves the FG rows blank', () => {
    const out = fill([frames[0]]);
    expect(at(out, 'FramingType', 'D3')).toBe('FW1');
    expect(at(out, 'FramingType', 'D4')).toBe(PHASING_CONSTRUCTION_VALUE);
    expect(at(out, 'FramingType', 'D5')).toBe('150');
    expect(at(out, 'FramingType', 'D14')).toBe('13');
    expect(at(out, 'FramingType', 'D16')).toBe('4');
    for (const addr of ['D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13']) {
      expect(at(out, 'FramingType', addr)).toBe('');
    }
  });

  it('writes FG fields and leaves the FW rows blank', () => {
    const out = fill([frames[1]]);
    expect(at(out, 'FramingType', 'D7')).toBe('22');
    expect(at(out, 'FramingType', 'D10')).toBe('200');
    expect(at(out, 'FramingType', 'D13')).toBe('1000');
    for (const addr of ['D14', 'D15', 'D16', 'D17']) {
      expect(at(out, 'FramingType', addr)).toBe('');
    }
  });

  it('never fills the rows with no extracted counterpart', () => {
    const out = fill();
    for (const addr of ['D18', 'D19', 'E18', 'E19']) {
      expect(at(out, 'FramingType', addr)).toBe('');
    }
  });
});

describe('fillTypeSheet — general behaviour', () => {
  it('returns the input untouched when there is nothing to write', () => {
    const bytes = templateBytes();
    expect(fillTypeSheet(bytes, [], configFor(FOUNDATION_TYPE_SHEET))).toBe(bytes);
  });

  it('rejects a sheet index that is not in the workbook', () => {
    expect(() =>
      fillTypeSheet(templateBytes(), buildFoundationTypeEntities(columns), {
        ...configFor(FOUNDATION_TYPE_SHEET),
        sheetIndex: 99,
      }),
    ).toThrow(/not found/i);
  });

  it('updates a column in place instead of duplicating it on re-export', () => {
    const config = configFor(FOUNDATION_TYPE_SHEET);
    const once = fillTypeSheet(templateBytes(), buildFoundationTypeEntities(columns), config);
    const twice = fillTypeSheet(
      once,
      buildFoundationTypeEntities([{ ...columns[0], dimensionWidth: '999' }]),
      config,
    );
    const out = read(twice);

    expect(at(out, 'FoundationType', 'D4')).toBe('F1');
    expect(at(out, 'FoundationType', 'D23')).toBe('999');
    expect(at(out, 'FoundationType', 'E4')).toBe('F2'); // untouched, not shifted
  });

  it('appends a new entity beside the ones already written', () => {
    const config = configFor(FOUNDATION_TYPE_SHEET);
    const once = fillTypeSheet(templateBytes(), buildFoundationTypeEntities([columns[0]]), config);
    const out = read(fillTypeSheet(once, buildFoundationTypeEntities([columns[1]]), config));

    expect(at(out, 'FoundationType', 'D4')).toBe('F1');
    expect(at(out, 'FoundationType', 'E4')).toBe('F2');
  });

  it('skips a row whose label no longer matches the saved config', () => {
    const config = configFor(FOUNDATION_TYPE_SHEET);
    const stale = {
      ...config,
      rowMappings: config.rowMappings.map((r) =>
        r.rowIndex === 23 ? { ...r, label: 'a label that moved away' } : r,
      ),
    };
    const out = read(fillTypeSheet(templateBytes(), buildFoundationTypeEntities(columns), stale));

    expect(at(out, 'FoundationType', 'D23')).toBe(''); // guarded row skipped
    expect(at(out, 'FoundationType', 'D24')).toBe('500'); // the rest still fills
  });

  it('keeps the label column and headings intact', () => {
    const out = read(
      fillTypeSheet(templateBytes(), buildFoundationTypeEntities(columns), configFor(FOUNDATION_TYPE_SHEET)),
    );
    expect(at(out, 'FoundationType', 'C4')).toBe('Type Mark');
    expect(at(out, 'FoundationType', 'C23')).toBe('柱型_Lx');
    expect(at(out, 'FoundationType', 'A1')).toBe('Foundation Types Table');
  });
});

describe('filling every sheet into one workbook', () => {
  /** Exactly what the export button does: chain the fills over one byte stream. */
  const fillAll = () => {
    let bytes: Uint8Array = templateBytes();
    bytes = fillTypeSheet(bytes, buildFoundationTypeEntities(columns), configFor(FOUNDATION_TYPE_SHEET));
    bytes = fillTypeSheet(bytes, buildFoundationInstanceEntities(priority), configFor(FOUNDATION_INSTANCE_SHEET));
    bytes = fillTypeSheet(bytes, buildFramingTypeEntities(frames), configFor(FRAMING_TYPE_SHEET));
    return bytes;
  };

  it('carries all three results in the single exported file', () => {
    const out = read(fillAll());

    expect(at(out, 'FoundationType', 'D4')).toBe('F1');
    expect(at(out, 'FoundationType', 'D23')).toBe('500');

    expect(at(out, 'FoundationInstance', 'D3')).toBe('X1-Y1');
    expect(at(out, 'FoundationInstance', 'E4')).toBe('F1');

    expect(at(out, 'FramingType', 'D3')).toBe('FW1');
    expect(at(out, 'FramingType', 'E3')).toBe('FG1');
  });

  it('keeps every sheet and the macro payload byte-for-byte', () => {
    const before = unzipSync(templateBytes());
    const filled = fillAll();
    const after = unzipSync(filled);
    const out = read(filled);

    expect(out.SheetNames).toEqual(read(templateBytes()).SheetNames);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after['xl/vbaProject.bin']).toStrictEqual(before['xl/vbaProject.bin']);
    expect(after['xl/styles.xml']).toStrictEqual(before['xl/styles.xml']);
    expect(after['xl/sharedStrings.xml']).toStrictEqual(before['xl/sharedStrings.xml']);
    // Sheets nobody filled must be identical too.
    expect(after['xl/worksheets/sheet7.xml']).toStrictEqual(before['xl/worksheets/sheet7.xml']);
  });
});
