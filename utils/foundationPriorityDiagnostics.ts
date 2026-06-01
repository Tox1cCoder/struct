import { PriorityPipelineDiagnostics } from '../types';

type StageKey = 'upload' | 'primaryGeneration' | 'primaryValidation' | 'fallbackGeneration' | 'fallbackValidation' | 'total';

const stageMap: Record<StageKey, keyof PriorityPipelineDiagnostics['stages']> = {
  upload: 'uploadMs',
  primaryGeneration: 'primaryGenerationMs',
  primaryValidation: 'primaryValidationMs',
  fallbackGeneration: 'fallbackGenerationMs',
  fallbackValidation: 'fallbackValidationMs',
  total: 'totalMs',
};

export const createPriorityDiagnostics = (
  fileName: string,
  role: 'certified' | 'plan',
): PriorityPipelineDiagnostics => ({
  fileName,
  role,
  stages: {},
  passUsed: 'primary',
});

export const finishStage = (
  diag: PriorityPipelineDiagnostics,
  stage: StageKey,
  durationMs: number,
): PriorityPipelineDiagnostics => ({
  ...diag,
  stages: { ...diag.stages, [stageMap[stage]]: durationMs },
});

export const markEscalated = (
  diag: PriorityPipelineDiagnostics,
  reason: string,
): PriorityPipelineDiagnostics => ({
  ...diag,
  passUsed: 'escalated',
  escalationReason: reason,
});
