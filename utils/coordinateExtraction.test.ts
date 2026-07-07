import { describe, expect, it } from 'vitest';
import { normalizeCertifiedCoordinateRows, normalizeFoundationPlanCoordinateRows } from './coordinateExtraction';

describe('normalizeCertifiedCoordinateRows', () => {
  it('keeps already-correct certified rows', () => {
    expect(
      normalizeCertifiedCoordinateRows([
        { xAxis: ' X1 ', yAxis: ' y1 ', columnType: ' c3009 ' },
      ]),
    ).toEqual([
      { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
    ]);
  });

  it('salvages alternative keys and combined coordinate strings', () => {
    expect(
      normalizeCertifiedCoordinateRows([
        { columnCode: 'C3009', coordinate: 'X1 / Y1' },
      ]),
    ).toEqual([
      { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
    ]);
  });

  it('salvages snake_case axes and type from Gemini certified rows', () => {
    expect(
      normalizeCertifiedCoordinateRows([
        { type: 'C1', x_axis: 'X3', y_axis: 'Y2' },
      ]),
    ).toEqual([
      { xAxis: 'X3', yAxis: 'Y2', columnType: 'C1' },
    ]);
  });

  it('normalizes half-grid coordinates into between-line locators', () => {
    expect(
      normalizeCertifiedCoordinateRows([
        { columnCode: 'P1', coordinate: 'X1.5 / Y2.5' },
      ]),
    ).toEqual([
      { xAxis: 'X1-X2', yAxis: 'Y2-Y3', columnType: 'P1' },
    ]);
  });

  it('drops rows that still do not contain a full coordinate and C code', () => {
    expect(
      normalizeCertifiedCoordinateRows([
        { columnType: 'C3009', xAxis: 'X1' },
        { yAxis: 'Y1', coordinate: 'X1 / Y1' },
      ]),
    ).toEqual([]);
  });
});

describe('normalizeFoundationPlanCoordinateRows', () => {
  it('salvages alternative field names for foundation plan rows', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundationLabel: ' F659834 ',
          grid: 'X2, Y5',
          fcCode: ' fc12 ',
        },
      ]),
    ).toEqual([
      { foundation: 'F659834', xAxis: 'X2', yAxis: 'Y5', planColumnType: 'FC12' },
    ]);
  });

  it('salvages snake_case field names from Gemini foundation plan rows', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation_label: 'F1',
          x_axis: 'X2',
          y_axis: 'Y5',
          plan_column_type: 'FC1',
        },
      ]),
    ).toEqual([
      { foundation: 'F1', xAxis: 'X2', yAxis: 'Y5', planColumnType: 'FC1' },
    ]);
  });

  it('accepts rows without a visible plan column type if the coordinate is present', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation: 'F1',
          coordinate: { x: 'X1', y: 'Y1' },
          planColumnType: '',
        },
      ]),
    ).toEqual([
      { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
    ]);
  });

  it('keeps foundation labels even when the plan coordinate is not readable', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation: 'F1',
          planColumnType: '',
        },
      ]),
    ).toEqual([
      { foundation: 'F1', xAxis: '', yAxis: '', planColumnType: '' },
    ]);
  });

  it('keeps highlighted C or P aliases from the foundation plan', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation: 'F1',
          coordinate: 'X1 / Y1',
          planColumnType: 'P1',
          isHighlighted: true,
          highlightColor: 'yellow',
        },
      ]),
    ).toEqual([
      {
        foundation: 'F1',
        xAxis: 'X1',
        yAxis: 'Y1',
        planColumnType: 'P1',
        isHighlighted: true,
        highlightColor: 'YELLOW',
      },
    ]);
  });

  it('keeps visible C or P aliases from the foundation plan even when not highlighted', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation: 'F1',
          coordinate: 'X1 / Y1',
          planColumnType: 'C1',
          isHighlighted: false,
          highlightColor: '',
        },
      ]),
    ).toEqual([
      {
        foundation: 'F1',
        xAxis: 'X1',
        yAxis: 'Y1',
        planColumnType: 'C1',
        isHighlighted: false,
      },
    ]);
  });

  it('preserves between-line locators for off-grid support positions', () => {
    expect(
      normalizeFoundationPlanCoordinateRows([
        {
          foundation: 'F1',
          coordinate: 'X1-X2 / Y1',
          planColumnType: '',
        },
      ]),
    ).toEqual([
      { foundation: 'F1', xAxis: 'X1-X2', yAxis: 'Y1', planColumnType: '' },
    ]);
  });
});
