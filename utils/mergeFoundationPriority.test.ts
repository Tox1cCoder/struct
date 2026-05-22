import { describe, expect, it } from 'vitest';

describe('buildFoundationPriorityText', () => {
  it('prefers FC values from the foundation plan at matching coordinates', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'FC1' }],
    );

    expect(result.lines).toEqual(['F1: FC1']);
    expect(result.text).toBe('F1: FC1');
  });

  it('falls back to the certified C code at matching coordinates when no FC exists', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'C1' }],
    );

    expect(result.lines).toEqual(['F1: C3009']);
    expect(result.text).toBe('F1: C3009');
  });

  it('uses the foundation plan location as the viewer source for certified fallback entries', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        {
          xAxis: 'X1',
          yAxis: 'Y1',
          columnType: 'C3009',
          sourceFileId: 'certified-file',
          page: 3,
          bbox: { ymin: 100, xmin: 100, ymax: 200, xmax: 200 },
        },
      ],
      [
        {
          foundation: 'F1',
          xAxis: 'X1',
          yAxis: 'Y1',
          planColumnType: '',
          sourceFileId: 'plan-file',
          page: 7,
          bbox: { ymin: 300, xmin: 400, ymax: 500, xmax: 600 },
        },
      ],
    );

    expect(result.entries[0]).toMatchObject({
      foundation: 'F1',
      columnType: 'C3009',
      origin: 'certified',
      sourceFileId: 'plan-file',
      page: 7,
      bbox: { ymin: 300, xmin: 400, ymax: 500, xmax: 600 },
    });
  });

  it('treats certified P codes the same as certified C codes', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'P1' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
    );

    expect(result.lines).toEqual(['F1: P1']);
    expect(result.text).toBe('F1: P1');
  });

  it('keeps multiple resolved lines for the same foundation when it maps to multiple coordinates', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
        { xAxis: 'X2', yAxis: 'Y2', columnType: 'C3010' },
      ],
      [
        { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
        { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '' },
      ],
    );

    expect(result.lines).toEqual(['F1: C3009', 'F1: C3010']);
    expect(result.text).toBe('F1: C3009\nF1: C3010');
  });

  it('deduplicates identical resolved codes for the same foundation', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
        { xAxis: 'X2', yAxis: 'Y2', columnType: 'C3009' },
      ],
      [
        { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
        { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '' },
      ],
    );

    expect(result.lines).toEqual(['F1: C3009']);
  });

  it('supports arbitrary foundation labels while sorting naturally', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X2', yAxis: 'Y2', columnType: 'C4001' },
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
      ],
      [
        { foundation: 'F659834', xAxis: 'X2', yAxis: 'Y2', planColumnType: '' },
        { foundation: 'F2', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'FC1' },
      ],
    );

    expect(result.lines).toEqual(['F2: FC1', 'F659834: C4001']);
  });

  it('normalizes whitespace and casing before joining by coordinate', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: ' x1 ', yAxis: ' y1 ', columnType: ' c3009 ' }],
      [{ foundation: ' f1 ', xAxis: 'X1', yAxis: 'Y1', planColumnType: ' fc1 ' }],
    );

    expect(result.lines).toEqual(['F1: FC1']);
  });

  it('omits foundations that have neither FC nor a certified coordinate match', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X2', yAxis: 'Y2', columnType: 'C3009' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'C1' }],
    );

    expect(result.lines).toEqual([]);
    expect(result.text).toBe('');
  });
});
