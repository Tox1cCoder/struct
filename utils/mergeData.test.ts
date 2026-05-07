import { describe, expect, it } from 'vitest';
import { mergeReinforcementWithFoundation } from './mergeData';

describe('mergeReinforcementWithFoundation FC priority', () => {
  it('keeps the FC code and drops the C code when both are listed for the same foundation', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [
        { foundation: 'F1', columnType: 'C1' },
        { foundation: 'F1', columnType: 'FC1' },
      ],
    );
    expect(result.map(r => r.columnType)).toEqual(['FC1']);
    expect(result[0].foundation).toBe('F1');
  });

  it('handles FC priority within a comma-separated columnType', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [{ foundation: 'F2', columnType: 'C1, FC1, C2' }],
    );
    expect(result.map(r => r.columnType)).toEqual(['FC1']);
  });

  it('keeps multiple FC codes for the same foundation', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [
        { foundation: 'F3', columnType: 'C1' },
        { foundation: 'F3', columnType: 'FC1' },
        { foundation: 'F3', columnType: 'FC2' },
      ],
    );
    expect(result.map(r => r.columnType).sort()).toEqual(['FC1', 'FC2']);
  });

  it('falls back to C codes when no FC exists for that foundation', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [
        { foundation: 'F4', columnType: 'C1' },
        { foundation: 'F4', columnType: 'C2' },
      ],
    );
    expect(result.map(r => r.columnType).sort()).toEqual(['C1', 'C2']);
  });

  it('applies FC priority independently per foundation', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [
        { foundation: 'F1', columnType: 'C1' },
        { foundation: 'F1', columnType: 'FC1' },
        { foundation: 'F2', columnType: 'C2' },
      ],
    );
    const byFoundation = result.reduce<Record<string, string[]>>((acc, r) => {
      const key = r.foundation ?? '';
      (acc[key] ||= []).push(r.columnType);
      return acc;
    }, {});
    expect(byFoundation['F1']).toEqual(['FC1']);
    expect(byFoundation['F2']).toEqual(['C2']);
  });

  it('preserves bColumn/hColumn from the FC entry when both exist', () => {
    const result = mergeReinforcementWithFoundation(
      [],
      [
        { foundation: 'F1', columnType: 'C1', bColumn: '500', hColumn: '500' },
        { foundation: 'F1', columnType: 'FC1', bColumn: '700', hColumn: '700' },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ foundation: 'F1', columnType: 'FC1', bColumn: '700', hColumn: '700' });
  });

  it('attaches reinforcement data to the surviving FC row', () => {
    const result = mergeReinforcementWithFoundation(
      [
        {
          columnType: 'FC1',
          columnDimensions: '700x700',
          mainReinforcement: '24-D25',
          hoopReinforcement: 'D13@100',
        },
      ],
      [
        { foundation: 'F1', columnType: 'C1' },
        { foundation: 'F1', columnType: 'FC1' },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      foundation: 'F1',
      columnType: 'FC1',
      dimensionWidth: '700',
      dimensionHeight: '700',
      mainReinforcementCount: '24',
      mainReinforcementSize: 'D25',
    });
  });
});
