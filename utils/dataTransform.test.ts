import { describe, expect, it } from 'vitest';
import { deriveMainBarSplit, transformForExport, withDerivedMainBarSplit } from './dataTransform';

describe('transformForExport dimensions', () => {
  it('uses a single square column dimension for both lx and ly', () => {
    const [row] = transformForExport([
      {
        columnType: 'C1',
        columnDimensions: '660',
        mainReinforcement: '24-D25',
        hoopReinforcement: 'D13@100',
      },
    ]);

    expect(row).toMatchObject({
      dimensionWidth: '660',
      dimensionHeight: '660',
    });
  });
});

describe('deriveMainBarSplit', () => {
  // Every certified sheet in the sample set, so the rule is checked against real
  // column stubs rather than invented ones.
  it.each([
    ['940', '800', '16', '5', '5'],
    ['740', '740', '24', '7', '7'],
    ['680', '680', '16', '5', '5'],
    ['1090', '810', '26', '8', '7'],
    ['1100', '840', '18', '6', '5'],
  ])('splits %sx%s with %s bars into %s/%s', (lx, ly, count, x, y) => {
    expect(deriveMainBarSplit(count, lx, ly)).toEqual({ x, y });
  });

  it('keeps the perimeter identity total = 2 × (nx + ny) − 4', () => {
    for (let total = 4; total <= 60; total += 2) {
      const { x, y } = deriveMainBarSplit(String(total), '1200', '800');
      expect(2 * (Number(x) + Number(y)) - 4).toBe(total);
    }
  });

  it('gives the longer side the extra bar', () => {
    expect(deriveMainBarSplit('26', '1090', '810')).toEqual({ x: '8', y: '7' });
    expect(deriveMainBarSplit('26', '810', '1090')).toEqual({ x: '7', y: '8' });
  });

  it('refuses to guess when no perimeter arrangement fits', () => {
    expect(deriveMainBarSplit('17', '900', '900')).toEqual({ x: '', y: '' }); // odd total
    expect(deriveMainBarSplit('2', '900', '900')).toEqual({ x: '', y: '' }); // no corners
    expect(deriveMainBarSplit('16-D25', '900', '900')).toEqual({ x: '', y: '' }); // unparsed
    expect(deriveMainBarSplit('16', '', '900')).toEqual({ x: '', y: '' }); // no Lx
    expect(deriveMainBarSplit('', '900', '900')).toEqual({ x: '', y: '' });
  });
});

describe('transformForExport main bar split', () => {
  it('derives the per-direction counts alongside the total', () => {
    const [row] = transformForExport([
      {
        columnType: 'C1',
        columnDimensions: '940×800',
        mainReinforcement: '16-D25',
        hoopReinforcement: 'D13@125',
      },
    ]);

    expect(row).toMatchObject({
      mainReinforcementCount: '16',
      mainReinforcementCountX: '5',
      mainReinforcementCountY: '5',
    });
  });
});

describe('withDerivedMainBarSplit', () => {
  const row = {
    columnType: 'C1',
    dimensionWidth: '940',
    dimensionHeight: '800',
    mainReinforcementCount: '16',
    mainReinforcementSize: 'D25',
    hoopReinforcementSize: 'D13',
    hoopReinforcementSpacing: '125',
    mainReinforcementCountX: '5',
    mainReinforcementCountY: '5',
  };

  it('re-derives the split when the total count is edited', () => {
    expect(withDerivedMainBarSplit(row, { mainReinforcementCount: '26' })).toEqual({
      mainReinforcementCount: '26',
      mainReinforcementCountX: '8',
      mainReinforcementCountY: '7',
    });
  });

  it('re-derives the split when a side length is edited', () => {
    expect(withDerivedMainBarSplit(row, { dimensionWidth: '1400' })).toEqual({
      dimensionWidth: '1400',
      mainReinforcementCountX: '6',
      mainReinforcementCountY: '4',
    });
  });

  it('leaves a hand-entered split alone', () => {
    expect(withDerivedMainBarSplit(row, { mainReinforcementCountX: '9' })).toEqual({
      mainReinforcementCountX: '9',
    });
    expect(withDerivedMainBarSplit(row, { columnType: 'C2' })).toEqual({ columnType: 'C2' });
  });
});
