export interface ExpectedPriorityFixtureRow {
  foundation: string;
  codes: string[];
  methods: Array<'plan-fc' | 'certified-fallback'>;
  planPages: number[];
  certifiedPages: number[];
  unresolvedReason?: string;
}

export const EXPECTED_FOUNDATION_LABELS = [
  'F1', 'F1A', 'F1B', 'F2', 'F2A', 'F3', 'F3A', 'F4',
  'F5', 'F6', 'F7', 'F8', 'F9', 'F9A', 'F10',
] as const;

/**
 * Reviewed from Right.pdf page 1 (foundation plan) and Left.pdf page 1
 * (certified placement map). Source labels 1'C1…1'C6 are canonicalized by
 * removing the display apostrophe while preserving the numeric prefix.
 */
export const EXPECTED_PRIORITY_ROWS: readonly ExpectedPriorityFixtureRow[] = [
  { foundation: 'F1', codes: ['1C1', '1C2', '1C4'], methods: ['certified-fallback', 'certified-fallback', 'certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F1A', codes: ['FC1'], methods: ['plan-fc'], planPages: [1], certifiedPages: [] },
  { foundation: 'F1B', codes: [], methods: [], planPages: [1], certifiedPages: [1], unresolvedReason: 'Two between-grid placements require evidence-viewer confirmation.' },
  { foundation: 'F2', codes: ['1C1', 'P1', 'P2'], methods: ['certified-fallback', 'certified-fallback', 'certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F2A', codes: [], methods: [], planPages: [1], certifiedPages: [1], unresolvedReason: 'The Y7A placement overlaps adjacent 1C6/P2 evidence and requires viewer confirmation.' },
  { foundation: 'F3', codes: ['1C5'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F3A', codes: ['1C1'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F4', codes: ['P1'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F5', codes: ['1C3'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F6', codes: ['1C1'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F7', codes: ['1C3', '1C1'], methods: ['certified-fallback', 'certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F8', codes: ['1C3'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F9', codes: ['1C4'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
  { foundation: 'F9A', codes: ['FC1'], methods: ['plan-fc'], planPages: [1], certifiedPages: [] },
  { foundation: 'F10', codes: ['1C1'], methods: ['certified-fallback'], planPages: [1], certifiedPages: [1] },
];
