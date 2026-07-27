import { FrameData } from '../types';

export interface FrameColumn {
  header: string;
  key: string;
}

const SHARED_COLUMNS: FrameColumn[] = [
  { header: 'Frame Name', key: 'frameName' },
  { header: 'b', key: 'b' },
  { header: 'h', key: 'h' },
];

const FW_COLUMNS: FrameColumn[] = [
  { header: 'FW_ベース筋_直径', key: 'fwBaseRebarDiameter' },
  { header: 'FW_タテ筋_直径', key: 'fwVerticalRebarDiameter' },
  { header: 'FW_ヨコ筋_本数', key: 'fwHorizontalRebarCount' },
  { header: 'FW_ヨコ筋_直径', key: 'fwHorizontalRebarDiameter' },
];

const FG_COLUMNS: FrameColumn[] = [
  { header: 'FG_上端筋_直径', key: 'fgTopRebarDiameter' },
  { header: 'FG_下端筋_直径', key: 'fgBottomRebarDiameter' },
  { header: 'FG_St_直径', key: 'fgStirrupDiameter' },
  { header: 'FG_St_距離_最大', key: 'fgStirrupMaxDistance' },
  { header: 'FG_腹筋_直径', key: 'fgBellyRebarDiameter' },
  { header: 'FG_巾止筋_直径', key: 'fgWidthStopRebarDiameter' },
  { header: 'FG_巾止筋_距離_最大', key: 'fgWidthStopRebarMaxDistance' },
];

export const getFrameColumns = (frameType: FrameData['frameType']): FrameColumn[] =>
  frameType === 'FW' ? [...SHARED_COLUMNS, ...FW_COLUMNS] : [...SHARED_COLUMNS, ...FG_COLUMNS];

export const buildFrameExportRows = (rows: FrameData[]): string[][] => {
  const columns = getFrameColumns(rows[0]?.frameType ?? 'FW');
  return rows.map((row) =>
    columns.map(({ key }) => String((row as unknown as Record<string, unknown>)[key] ?? '')),
  );
};
