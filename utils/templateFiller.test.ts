import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { getBookType, parseSheetPreview } from './templateFiller';

describe('getBookType', () => {
  it('keeps the uploaded workbook format', () => {
    expect(getBookType('template.xlsm')).toBe('xlsm');
    expect(getBookType('template.xlsx')).toBe('xlsx');
    expect(getBookType('TEMPLATE.XLSM')).toBe('xlsm');
    expect(getBookType('template.unknown')).toBe('xlsx');
  });
});

describe('parseSheetPreview', () => {
  const workbook = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Foundation Types Table', null, null],
      ['Param Group', null, 'Name of Parameters'],
      [null, null, '柱型_Lx'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FoundationType');
    return wb;
  };

  it('reads the sheet into a 2-D string grid', () => {
    const grid = parseSheetPreview(workbook(), 0);
    expect(grid[1]).toEqual(['Param Group', null, 'Name of Parameters']);
    expect(grid[2][2]).toBe('柱型_Lx');
  });

  it('clamps an out-of-range sheet index instead of throwing', () => {
    expect(parseSheetPreview(workbook(), 99)[0][0]).toBe('Foundation Types Table');
  });
});
