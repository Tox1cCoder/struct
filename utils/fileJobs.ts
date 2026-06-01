import { ProcessingStatus } from '../types';

type Job = { status: ProcessingStatus };

export const hasActiveJobs = (jobs: Job[]) =>
  jobs.some((job) => job.status === 'PENDING' || job.status === 'PROCESSING');

export const summarizeJobs = (jobs: Job[]) => ({
  total: jobs.length,
  succeeded: jobs.filter((job) => job.status === 'SUCCESS').length,
  processing: jobs.filter((job) => job.status === 'PENDING' || job.status === 'PROCESSING').length,
  failed: jobs.filter((job) => job.status === 'ERROR').length,
});
