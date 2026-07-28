import { describe, expect, it } from 'vitest';
import { PartMediaResolutionLevel, ThinkingLevel } from '@google/genai';
import {
  addPriorityWarning,
  createPriorityDiagnostics,
  finishStage,
  incrementPriorityCropCount,
  recordPriorityAnchors,
  recordPriorityCoverage,
  recordPriorityRequest,
  recordPriorityUsage,
} from './foundationPriorityDiagnostics';

describe('foundation priority diagnostics', () => {
  it('records stage durations and the escalation reason', () => {
    const started = createPriorityDiagnostics('right.pdf', 'plan');
    const measured = finishStage(started, 'upload', 1200);
    expect(measured.stages.uploadMs).toBe(1200);
    expect({ ...measured, escalationReason: 'missing-coordinate-coverage' }.escalationReason)
      .toBe('missing-coordinate-coverage');
  });

  it('immutably accumulates request, anchor, coverage, crop, usage, and warning details', () => {
    const initial = createPriorityDiagnostics('right.pdf', 'plan');
    const requested = recordPriorityRequest(initial, 'escalated', {
      model: 'gemini-3.1-pro-preview',
      thinkingLevel: ThinkingLevel.HIGH,
      mediaResolution: PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM,
    });
    const anchored = recordPriorityAnchors(requested, {
      mode: 'native',
      anchors: [],
      foundationLabels: ['F1', 'F2'],
      counts: { foundation: 2, 'plan-column': 1, 'certified-column': 0, 'x-axis': 3, 'y-axis': 3 },
    });
    const covered = recordPriorityCoverage(anchored, {
      complete: false,
      mode: 'anchored',
      expectedCount: 2,
      returnedCount: 1,
      coordinateCount: 1,
      codeCount: 1,
      missingLabels: ['F2'],
      unresolvedLabels: [],
      reasons: ['missing-foundations'],
    });
    const withUsage = recordPriorityUsage(covered, 'escalated', {
      promptTokenCount: 100,
      totalTokenCount: 140,
      privateResponse: 'excluded',
    });
    const finished = addPriorityWarning(incrementPriorityCropCount(withUsage, 2), 'Incomplete coverage');

    expect(initial).not.toBe(finished);
    expect(finished).toMatchObject({
      model: 'gemini-3.1-pro-preview',
      passUsed: 'escalated',
      anchorMode: 'native',
      anchorCounts: { foundation: 2 },
      coverage: { missingLabels: ['F2'] },
      cropCount: 2,
      warning: 'Incomplete coverage',
      usage: { escalated: { promptTokenCount: 100, totalTokenCount: 140 } },
    });
    expect(finished.usage?.escalated).not.toHaveProperty('privateResponse');
  });
});
