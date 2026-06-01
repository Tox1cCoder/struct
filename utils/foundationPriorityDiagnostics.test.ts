import { describe, expect, it } from 'vitest';
import { createPriorityDiagnostics, finishStage } from './foundationPriorityDiagnostics';

describe('foundation priority diagnostics', () => {
  it('records stage durations and the escalation reason', () => {
    const started = createPriorityDiagnostics('right.pdf', 'plan');
    const measured = finishStage(started, 'upload', 1200);
    expect(measured.stages.uploadMs).toBe(1200);
    expect({ ...measured, escalationReason: 'missing-coordinate-coverage' }.escalationReason)
      .toBe('missing-coordinate-coverage');
  });
});
