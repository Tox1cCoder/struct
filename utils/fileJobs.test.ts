import { describe, expect, it } from 'vitest';
import { hasActiveJobs, summarizeJobs } from './fileJobs';

describe('file job status', () => {
  it('derives active state from rows instead of a workflow lock', () => {
    const jobs = [{ status: 'SUCCESS' as const }, { status: 'PROCESSING' as const }];
    expect(hasActiveJobs(jobs)).toBe(true);
    expect(summarizeJobs(jobs)).toEqual({ total: 2, succeeded: 1, processing: 1, failed: 0 });
  });
});
