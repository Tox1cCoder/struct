import { describe, expect, it } from 'vitest';
import { buildFrameExportRows, getFrameColumns } from './frameTable';
import { FWFrameData } from '../types';

describe('frame table mappings', () => {
  it('uses only the approved FW columns and values', () => {
    expect(getFrameColumns('FW').map(({ header }) => header)).toEqual([
      'Frame Name',
      'b',
      'h',
      'FW_ベース筋_直径',
      'FW_タテ筋_直径',
      'FW_ヨコ筋_本数',
      'FW_ヨコ筋_直径',
    ]);

    const row: FWFrameData = {
      frameType: 'FW',
      frameName: 'FW1',
      b: '300',
      h: '350',
      fwBaseRebarDiameter: '13',
      fwVerticalRebarDiameter: '13',
      fwHorizontalRebarCount: '3',
      fwHorizontalRebarDiameter: '10',
    };

    expect(buildFrameExportRows([row])).toEqual([['FW1', '300', '350', '13', '13', '3', '10']]);
  });

  it('uses only the approved FG columns', () => {
    expect(getFrameColumns('FG').map(({ header }) => header)).toEqual([
      'Frame Name',
      'b',
      'h',
      'FG_上端筋_直径',
      'FG_下端筋_直径',
      'FG_St_直径',
      'FG_St_距離_最大',
      'FG_腹筋_直径',
      'FG_巾止筋_直径',
      'FG_巾止筋_距離_最大',
    ]);
  });
});
