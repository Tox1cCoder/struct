import { describe, expect, it } from 'vitest';
import { parseFoundationColumnText } from './parseFoundationText';

describe('parseFoundationColumnText case normalization', () => {
  it('uppercases lowercase trailing letter on the foundation label (F1a -> F1A)', () => {
    const result = parseFoundationColumnText('F1a : C1');
    expect(result).toEqual([{ foundation: 'F1A', columnType: 'C1', bColumn: undefined, hColumn: undefined }]);
  });

  it('uppercases mixed case in column type tokens (c1 -> C1, fc1 -> FC1)', () => {
    const result = parseFoundationColumnText('F2 : c2 : fc2');
    expect(result).toEqual([{ foundation: 'F2', columnType: 'FC2', bColumn: undefined, hColumn: undefined }]);
  });

  it('treats lowercase F-prefix self-reference as the auto-foundation', () => {
    const result = parseFoundationColumnText('F3 : f3a');
    expect(result.map(r => ({ foundation: r.foundation, columnType: r.columnType }))).toEqual([
      { foundation: 'F3A', columnType: 'F3A' },
    ]);
  });

  it('still parses BxH dimensions with uppercase normalization', () => {
    const result = parseFoundationColumnText('F4a : c1 : - : 400x500');
    expect(result).toEqual([
      { foundation: 'F4A', columnType: 'C1', bColumn: '400', hColumn: '500' },
    ]);
  });
});
