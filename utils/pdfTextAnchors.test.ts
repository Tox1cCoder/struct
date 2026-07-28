// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPECTED_FOUNDATION_LABELS } from '../tests/fixtures/foundationPriorityLeftRight';
import {
  buildPdfAnchorInventory,
  classifyPriorityAnchor,
  extractPriorityPdfAnchors,
  serializePriorityAnchorManifest,
} from './pdfTextAnchors';

describe('PDF priority anchors', () => {
  it.each([
    ['F1', { kind: 'foundation', label: 'F1' }],
    ['F1A(設計GL-1,500)', { kind: 'foundation', label: 'F1A' }],
    ['FK1', { kind: 'foundation', label: 'FK1' }],
    ['FC1', { kind: 'plan-column', label: 'FC1' }],
    ["1'C3", { kind: 'certified-column', label: '1C3' }],
    ['X2C', { kind: 'x-axis', label: 'X2C' }],
    ['Y7A', { kind: 'y-axis', label: 'Y7A' }],
    ['FG1B', null],
    ['FW2', null],
    ['FWS1', null],
  ])('classifies %s', (sourceText, expected) => {
    expect(classifyPriorityAnchor(sourceText)).toEqual(expected);
  });

  it('deduplicates only the same normalized label at the same location', () => {
    const inventory = buildPdfAnchorInventory([{ page: 1, width: 100, height: 200, items: [
      { text: 'F1', x: 10, y: 20, width: 5, height: 4 },
      { text: 'F1', x: 10, y: 20, width: 5, height: 4 },
      { text: 'F1', x: 50, y: 80, width: 5, height: 4 },
    ] }]);

    expect(inventory.anchors).toHaveLength(2);
    expect(inventory.foundationLabels).toEqual(['F1']);
    expect(inventory.anchors[0].bbox).toEqual({ ymin: 100, xmin: 100, ymax: 120, xmax: 150 });
    expect(serializePriorityAnchorManifest(inventory)).toContain('F1');
  });

  it('extracts every reviewed foundation label from Right.pdf native text', async () => {
    const bytes = readFileSync(resolve(process.cwd(), 'Right.pdf'));
    const file = new File([bytes], 'Right.pdf', { type: 'application/pdf' });
    const inventory = await extractPriorityPdfAnchors(file);

    expect(inventory.mode).toBe('native');
    expect([...inventory.foundationLabels].sort()).toEqual([...EXPECTED_FOUNDATION_LABELS].sort());
  });
});
