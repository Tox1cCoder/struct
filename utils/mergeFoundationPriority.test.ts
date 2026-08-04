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

  it('normalizes certified numeric-prefixed C codes such as 1C2', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: '1C2' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
    );

    expect(result.lines).toEqual(['F1: C2']);
  });

  it('merges numeric-prefixed certified codes from the observed foundation PDF coordinate layout', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y5', columnType: '1C2' },
        { xAxis: 'X2', yAxis: 'Y5', columnType: '1C2' },
        { xAxis: 'X3', yAxis: 'Y5', columnType: '1C2' },
        { xAxis: 'X4', yAxis: 'Y5', columnType: '1C3' },
      ],
      [
        { foundation: 'F6', xAxis: 'X1', yAxis: 'Y5', planColumnType: '' },
        { foundation: 'F3', xAxis: 'X2', yAxis: 'Y5', planColumnType: '' },
        { foundation: 'F4', xAxis: 'X3', yAxis: 'Y5', planColumnType: '' },
        { foundation: 'F5', xAxis: 'X4', yAxis: 'Y5', planColumnType: '' },
      ],
    );

    expect(result.lines).toEqual(['F3: C2', 'F4: C2', 'F5: C3', 'F6: C2']);
  });

  it('removes numeric C prefixes and merges equivalent result codes with all evidence', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y1', columnType: '1C1' },
        { xAxis: 'X2', yAxis: 'Y2', columnType: 'C1' },
        { xAxis: 'X3', yAxis: 'Y3', columnType: '12C4' },
      ],
      [
        { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
        { foundation: 'F1', xAxis: 'X2', yAxis: 'Y2', planColumnType: '' },
        { foundation: 'F1', xAxis: 'X3', yAxis: 'Y3', planColumnType: '' },
      ],
    );

    expect(result.lines).toEqual(['F1: C1, C4']);
    expect(result.rows[0].codes).toEqual(['C1', 'C4']);
    expect(result.rows[0].resolutions.map((resolution) => ({
      columnType: resolution.columnType,
      evidenceCount: resolution.locations.length,
    }))).toEqual([
      { columnType: 'C1', evidenceCount: 2 },
      { columnType: 'C4', evidenceCount: 1 },
    ]);
  });

  it('uses the visible foundation plan C or P alias when no certified coordinate matches', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X2', yAxis: 'Y2', columnType: 'C3009' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: 'C1' }],
    );

    expect(result.lines).toEqual(['F1: C1']);
    expect(result.rows[0].resolutions[0].method).toBe('plan-alias-fallback');
  });

  it('uses a direct foundation-plan mapping when coordinates are unavailable', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [],
      [{ foundation: 'F1', xAxis: '', yAxis: '', planColumnType: 'C1' }],
    );

    expect(result.lines).toEqual(['F1: C1']);
    expect(result.rows[0].resolutions[0].method).toBe('plan-alias-fallback');
  });

  it('does not add direct C/P fallback codes after coordinate evidence already resolves the foundation', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' }],
      [
        { foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' },
        { foundation: 'F1', xAxis: '', yAxis: '', planColumnType: 'C1' },
      ],
    );

    expect(result.lines).toEqual(['F1: C3009']);
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

  it('prefers certified C over P when both exist at the same coordinate', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'P1' },
        { xAxis: 'X1', yAxis: 'Y1', columnType: 'C3009' },
      ],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
    );

    expect(result.lines).toEqual(['F1: C3009']);
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

  it('omits unresolved foundation labels from final result rows', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [{ xAxis: 'X2', yAxis: 'Y2', columnType: 'C3009' }],
      [{ foundation: 'F1', xAxis: 'X1', yAxis: 'Y1', planColumnType: '' }],
    );

    expect(result.lines).toEqual([]);
    expect(result.text).toBe('');
    expect(result.rows).toEqual([]);
  });

  it('omits foundation-only plan rows when no coordinate was extracted', async () => {
    const { buildFoundationPriorityText } = await import('./mergeFoundationPriority');

    const result = buildFoundationPriorityText(
      [],
      [{ foundation: 'F1', xAxis: '', yAxis: '', planColumnType: '' }],
    );

    expect(result.lines).toEqual([]);
    expect(result.rows).toEqual([]);
  });
});
