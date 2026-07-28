import { describe, expect, it } from 'vitest';
import {
  EXPECTED_FOUNDATION_LABELS,
  EXPECTED_PRIORITY_ROWS,
} from '../tests/fixtures/foundationPriorityLeftRight';

describe('Left/Right Foundation Priority golden fixture', () => {
  it('contains one reviewed entry for every visible foundation label', () => {
    expect(EXPECTED_PRIORITY_ROWS.map((row) => row.foundation).sort()).toEqual(
      [...EXPECTED_FOUNDATION_LABELS].sort(),
    );

    for (const row of EXPECTED_PRIORITY_ROWS) {
      expect(row.codes.length > 0 || row.unresolvedReason).toBeTruthy();
      expect(
        row.codes.every((code) => /^(?:FC[A-Z0-9]+|\d*C[A-Z0-9]+|\d*P[A-Z0-9]+)$/.test(code)),
      ).toBe(true);
      expect(row.methods).toHaveLength(row.codes.length);
      expect(row.planPages).toContain(1);
    }
  });
});
