export interface ExpectedPriorityFixtureRow {
  foundation: string;
  /** Naturally sorted; code order within a row is not significant. */
  codes: string[];
  method: 'plan-fc' | 'certified-fallback';
}

export const EXPECTED_FOUNDATION_LABELS = [
  'F1', 'F1A', 'F1B', 'F2', 'F2A', 'F3', 'F3A', 'F4',
  'F5', 'F6', 'F7', 'F8', 'F9', 'F9A', 'F10',
] as const;

/**
 * Verified 2026-09-29 from Right.pdf page 1 (基礎伏図) and Left.pdf page 1 (認定柱脚資料
 * placement map) by a 600-dpi visual read and, independently, by a vector-geometry join.
 * Every code whose marker lies inside a footing is listed, including P1/P2 posts.
 * F6/F7/F8 are combined footings; F1A and F9A carry FC1 in the plan.
 */
export const EXPECTED_PRIORITY_ROWS: readonly ExpectedPriorityFixtureRow[] = [
  { foundation: 'F1', codes: ['C1', 'C2', 'C4'], method: 'certified-fallback' },
  { foundation: 'F1A', codes: ['FC1'], method: 'plan-fc' },
  { foundation: 'F1B', codes: ['C3'], method: 'certified-fallback' },
  { foundation: 'F2', codes: ['C1', 'P2'], method: 'certified-fallback' },
  { foundation: 'F2A', codes: ['C6'], method: 'certified-fallback' },
  { foundation: 'F3', codes: ['C5'], method: 'certified-fallback' },
  { foundation: 'F3A', codes: ['C1'], method: 'certified-fallback' },
  { foundation: 'F4', codes: ['P1', 'P2'], method: 'certified-fallback' },
  { foundation: 'F5', codes: ['C3'], method: 'certified-fallback' },
  { foundation: 'F6', codes: ['C1', 'C3', 'P1'], method: 'certified-fallback' },
  { foundation: 'F7', codes: ['C1', 'C3', 'P1'], method: 'certified-fallback' },
  { foundation: 'F8', codes: ['C1', 'C3'], method: 'certified-fallback' },
  { foundation: 'F9', codes: ['P1'], method: 'certified-fallback' },
  { foundation: 'F9A', codes: ['FC1'], method: 'plan-fc' },
  { foundation: 'F10', codes: ['C1'], method: 'certified-fallback' },
];

/**
 * Left.pdf page 1 grid lines (display points), named in the plan's order. The
 * certified sheet prints the third X line as X2A; the plan calls it X2C.
 */
export const CERTIFIED_GRID_LINES = {
  x: [
    ['X1', 322.6], ['X2', 361.8], ['X2C', 431.2], ['X3', 477.8], ['X3A', 514.3],
    ['X4', 602.4], ['X5', 720.5], ['X6', 821.2], ['X7', 919.0],
  ],
  y: [
    ['Y9', 171.2], ['Y8', 218.4], ['Y7A', 257.6], ['Y7', 298.7], ['Y6', 377.0],
    ['Y5', 457.8], ['Y4', 519.5], ['Y3', 537.7], ['Y2', 618.0], ['Y1', 655.8],
  ],
} as const;

/**
 * Labels of the 31 green (C1/C2/C3) and red (C5/C6) markers on Left.pdf page 1, read
 * from 900-dpi crops, keyed by grid intersection. Magenta markers read P1, orange P2,
 * blue C4.
 */
export const VERIFIED_COLUMN_MARKER_READS: Readonly<Record<string, string>> = {
  'X3A/Y8': 'C3', 'X4/Y8': 'C1', 'X5/Y8': 'C5', 'X6/Y8': 'C3', 'X7/Y8': 'C3',
  'X2C/Y7A': 'C3', 'X3/Y7A': 'C6',
  'X2/Y7': 'C1', 'X4/Y7': 'C1', 'X6/Y7': 'C1', 'X7/Y7': 'C3',
  'X2/Y6': 'C1', 'X6/Y6': 'C1', 'X7/Y6': 'C3',
  'X2/Y5': 'C1', 'X3/Y5': 'C2', 'X4/Y5': 'C2', 'X5/Y5': 'C2', 'X6/Y5': 'C1',
  'X1/Y4': 'C3', 'X2/Y4': 'C1',
  'X6/Y3': 'C1',
  'X1/Y2': 'C3', 'X2/Y2': 'C1', 'X3/Y2': 'C1', 'X4/Y2': 'C1', 'X5/Y2': 'C1', 'X6/Y2': 'C1',
  'X1/Y1': 'C3', 'X2/Y1': 'C3', 'X3/Y1': 'C3',
};
