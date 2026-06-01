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

  it('treats certified P codes the same as certified C codes', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'P1' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
    );

    expect(result.lines).toEqual(['F1: P1']);
    expect(result.text).toBe('F1: P1');
  });

  it('renders one row per foundation with distinct codes resolved per location', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');
    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009', sourceFileId: 'left' },
        { xAxis: 'X2', yAxis: 'Y2', columnType: 'C3010', sourceFileId: 'left' },
      ],
      [
        { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'FC1', sourceFileId: 'right' },
        { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '', sourceFileId: 'right' },
      ],
    );

    expect(result.lines).toEqual(['F1: FC1, C3010']);
    expect(result.rows[0].codes).toEqual(['FC1', 'C3010']);
  });

  it('retains plan and certified evidence for viewer switching', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');
    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009', sourceFileId: 'left', page: 2 }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '', sourceFileId: 'right', page: 1 }],
    );

    expect(result.rows[0].resolutions[0]).toMatchObject({
      columnType: 'C3009',
      method: 'certified-fallback',
      locations: [{
        plan: { fileId: 'right', page: 1 },
        certified: { fileId: 'left', page: 2 },
      }],
    });
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
