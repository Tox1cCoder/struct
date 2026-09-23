import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { transformForExport } from './dataTransform';
import { autoDetectTypeSheetConfig, fillTypeSheet, findSpecSheetIndex } from './typeSheetFiller';
import { FOUNDATION_TYPE_SHEET, buildFoundationTypeEntities } from './templateSheets';

const TEMPLATE = resolve(__dirname, '../samples/V2.5 TnfDesignInformation_v08_Template.xlsm');

/** Run extraction output through the transform, the entity builder and the fill. */
const fillFromExtraction = (extracted: Parameters<typeof transformForExport>[0]) => {
  const rows = transformForExport(extracted).map((r) => ({ ...r, foundation: 'F1' }));
  const bytes = new Uint8Array(readFileSync(TEMPLATE));
  const wb = XLSX.read(bytes, { type: 'array' });
  const config = autoDetectTypeSheetConfig(
    wb,
    findSpecSheetIndex(wb, FOUNDATION_TYPE_SHEET),
    FOUNDATION_TYPE_SHEET,
  )!;
  const out = XLSX.read(fillTypeSheet(bytes, buildFoundationTypeEntities(rows), config), {
    type: 'array',
  });
  return (addr: string) => String(out.Sheets.FoundationType[addr]?.v ?? '');
};

describe('real drawing values through the whole pipeline', () => {
  it('fills every FoundationType row a PDF can supply', () => {
    // Exactly what Left.pdf page 2 (HP4530) states for column C1. A certified
    // base sheet has no cross-section figure, so the hoop tie counts are 0.
    const at = fillFromExtraction([
      {
        columnType: 'C1',
        columnDimensions: '940×800',
        mainReinforcement: '16-D25',
        hoopReinforcement: 'D13@125',
      },
    ]);

    expect([at('C23'), at('D23')]).toEqual(['柱型_Lx', '940']);
    expect([at('C24'), at('D24')]).toEqual(['柱型_Ly', '800']);
    expect([at('C29'), at('D29')]).toEqual(['柱型_主筋_本数', '16']);
    expect([at('C30'), at('D30')]).toEqual(['柱型_主筋_直径', 'D25']);
    expect([at('C31'), at('D31')]).toEqual(['柱型_Hoop_直径', 'D13']);
    expect([at('C32'), at('D32')]).toEqual(['柱型_Hoop_距離_最大', '125']);
    expect([at('C33'), at('D33')]).toEqual(['柱型_主筋_本数_X', '5']);
    expect([at('C34'), at('D34')]).toEqual(['柱型_主筋_本数_Y', '5']);
    expect([at('C35'), at('D35')]).toEqual(['柱型_Hoop_X_補強', '0']);
    expect([at('C36'), at('D36')]).toEqual(['柱型_Hoop_Y_補強', '0']);
  });

  it('fills the hoop tie counts a column-list image supplies', () => {
    // The FC1 column list: 1,400×1,400, 36-D32, D16@100, and a section figure
    // split into a 3×3 grid — 2 vertical and 2 horizontal internal tie lines.
    const at = fillFromExtraction([
      {
        columnType: 'FC1',
        columnDimensions: '1,400×1,400',
        mainReinforcement: '36-D32',
        hoopReinforcement: 'D16@100',
        hoopSupplementaryX: '2',
        hoopSupplementaryY: '2',
      },
    ]);

    expect([at('C23'), at('D23')]).toEqual(['柱型_Lx', '1400']);
    expect([at('C29'), at('D29')]).toEqual(['柱型_主筋_本数', '36']);
    expect([at('C33'), at('D33')]).toEqual(['柱型_主筋_本数_X', '10']);
    expect([at('C34'), at('D34')]).toEqual(['柱型_主筋_本数_Y', '10']);
    expect([at('C35'), at('D35')]).toEqual(['柱型_Hoop_X_補強', '2']);
    expect([at('C36'), at('D36')]).toEqual(['柱型_Hoop_Y_補強', '2']);
  });
});
